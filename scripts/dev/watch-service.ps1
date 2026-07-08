param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("backend", "frontend")]
    [string] $Service
)

# Show one service status and important recent logs. This script never controls server lifetime.

$ErrorActionPreference = "Continue"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
$RepoRoot = $Profile.RepoRoot
$BackendLogDir = Join-Path $RepoRoot "backend\logs"
$FrontendLogDir = Join-Path $RepoRoot "frontend\logs"
$BackendOut = Join-Path $BackendLogDir "backend-dev.out.log"
$BackendErr = Join-Path $BackendLogDir "backend-dev.err.log"
$FrontendOut = Join-Path $FrontendLogDir "frontend-dev.out.log"
$FrontendErr = Join-Path $FrontendLogDir "frontend-dev.err.log"
$BackendRuntime = Join-Path $BackendLogDir "backend-runtime.json"
$FrontendRuntime = Join-Path $FrontendLogDir "frontend-runtime.json"
$AnsiClearToEnd = "$([char]27)[J"
$LastRender = $null

$ServiceTitle = if ($Service -eq "backend") { "Backend" } else { "Frontend" }
try {
    $Host.UI.RawUI.WindowTitle = "DEXCOWIN MES $ServiceTitle Watch"
    [Console]::CursorVisible = $false
}
catch {
    # Some hosts do not allow title or cursor updates.
}

function Move-MonitorCursorHome {
    try {
        [Console]::SetCursorPosition(0, 0)
    }
    catch {
        Write-Host "$([char]27)[H" -NoNewline
    }
}

function Get-ListenPids {
    param([int] $Port)
    @(
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
}

function Test-Url {
    param([string] $Url)
    try {
        $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 1 -ErrorAction Stop
        return $resp.StatusCode
    }
    catch {
        return $null
    }
}

function Test-LineMatchesAny {
    param(
        [string] $Line,
        [string[]] $Patterns
    )

    foreach ($pattern in $Patterns) {
        if ($Line -match $pattern) {
            return $true
        }
    }
    return $false
}

function Get-ImportantLogTail {
    param(
        [string] $Title,
        [string] $Path,
        [string[]] $NoisePatterns,
        [int] $Lines = 12
    )

    $rows = [System.Collections.Generic.List[string]]::new()
    $rows.Add("")
    $rows.Add("----- $Title -----")

    if (-not (Test-Path $Path)) {
        $rows.Add("(no log yet) $Path")
        return $rows
    }

    $recent = Get-Content -Path $Path -Tail 120 -ErrorAction SilentlyContinue
    $important = @(
        $recent |
            Where-Object { $_ -and -not (Test-LineMatchesAny -Line $_ -Patterns $NoisePatterns) } |
            Select-Object -Last $Lines
    )

    if ($important.Count -eq 0) {
        $rows.Add("(no important lines in recent log)")
        return $rows
    }

    foreach ($line in $important) {
        $rows.Add($line)
    }
    return $rows
}

function Get-LatestDump {
    param([string] $Dir)
    $dumpDir = Join-Path $Dir "dumps"
    if (-not (Test-Path $dumpDir)) { return $null }
    Get-ChildItem $dumpDir -File -Filter "*.json" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

function Add-HeaderLines {
    param(
        [System.Collections.Generic.List[string]] $Rows,
        [string] $Name,
        [string] $State,
        [int] $Port,
        [object[]] $Pids,
        [string] $CheckLabel,
        [object] $CheckValue,
        [string] $RuntimePath
    )

    $checkText = if ($CheckValue) { [string] $CheckValue } else { "-" }
    $pidText = if ($Pids.Count -gt 0) { $Pids -join "," } else { "-" }

    $Rows.Add("DEXCOWIN MES $Name monitor")
    $Rows.Add("Closing this pane/window does NOT stop the servers.")
    $Rows.Add("")
    $Rows.Add("Profile : $($Profile.Label)")
    $Rows.Add("URL     : $($Profile.PublicUrl)")
    $Rows.Add("Service : $Name")
    $Rows.Add("State   : $State")
    $Rows.Add("Port    : $Port")
    $Rows.Add("PID     : $pidText")
    $Rows.Add("$CheckLabel : $checkText")
    $Rows.Add("Runtime : $RuntimePath")
    $Rows.Add("")
    $Rows.Add("Restart : double-click start.bat")
    $Rows.Add("Watch   : double-click watch.bat")
    $Rows.Add("Stop    : double-click stop.bat")
}

$BackendNoise = @(
    'GET /health/live HTTP/1\.1" 200 OK',
    '"GET /health/live HTTP/1\.1" 200 OK'
)

$FrontendStdoutNoise = @()

$FrontendStderrNoise = @(
    "NO_COLOR.*FORCE_COLOR",
    "Use ``node --trace-warnings"
)

function Render-MonitorScreen {
    $rows = [System.Collections.Generic.List[string]]::new()

    if ($Service -eq "backend") {
        $pids = @(Get-ListenPids -Port ([int] $Profile.BackendPort))
        $health = Test-Url "http://127.0.0.1:$($Profile.BackendPort)/health/live"
        $state = if ($pids.Count -gt 0 -and $health -eq 200) { "LIVE" } elseif ($pids.Count -gt 0) { "PORT ONLY" } else { "DOWN" }

        Add-HeaderLines -Rows $rows -Name "Backend" -State $state -Port ([int] $Profile.BackendPort) -Pids $pids -CheckLabel "Health" -CheckValue $health -RuntimePath $BackendRuntime
        $rows.AddRange([string[]] (Get-ImportantLogTail "Backend stdout" $BackendOut $BackendNoise))
        $rows.AddRange([string[]] (Get-ImportantLogTail "Backend stderr" $BackendErr $BackendNoise 14))
    }
    else {
        $pids = @(Get-ListenPids -Port ([int] $Profile.FrontendPort))
        $http = Test-Url "http://127.0.0.1:$($Profile.FrontendPort)/mes"
        $state = if ($pids.Count -gt 0 -and $http) { "LIVE" } elseif ($pids.Count -gt 0) { "PORT ONLY" } else { "DOWN" }
        $latestDump = Get-LatestDump $FrontendLogDir

        Add-HeaderLines -Rows $rows -Name "Frontend" -State $state -Port ([int] $Profile.FrontendPort) -Pids $pids -CheckLabel "HTTP" -CheckValue $http -RuntimePath $FrontendRuntime
        if ($latestDump) {
            $rows.Add("Latest exit dump: $($latestDump.FullName)")
        }
        $rows.AddRange([string[]] (Get-ImportantLogTail "Frontend stdout" $FrontendOut $FrontendStdoutNoise))
        $rows.AddRange([string[]] (Get-ImportantLogTail "Frontend stderr" $FrontendErr $FrontendStderrNoise 14))
    }

    return ($rows -join [Environment]::NewLine)
}

while ($true) {
    $screen = Render-MonitorScreen
    if ($screen -ne $LastRender) {
        Move-MonitorCursorHome
        Write-Host ($screen + $AnsiClearToEnd) -NoNewline
        $LastRender = $screen
    }

    Start-Sleep -Seconds 2
}
