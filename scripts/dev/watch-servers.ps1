# scripts/dev/watch-servers.ps1
# Show DEXCOWIN MES server status and recent logs without controlling server lifetime.

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

function Write-LogTail {
    param(
        [string] $Title,
        [string] $Path,
        [int] $Lines = 12
    )

    Write-Host ""
    Write-Host "----- $Title -----" -ForegroundColor DarkCyan
    if (Test-Path $Path) {
        Get-Content -Path $Path -Tail $Lines -ErrorAction SilentlyContinue
    }
    else {
        Write-Host "(no log yet) $Path" -ForegroundColor DarkGray
    }
}

function Get-LatestDump {
    param([string] $Dir)
    $dumpDir = Join-Path $Dir "dumps"
    if (-not (Test-Path $dumpDir)) { return $null }
    Get-ChildItem $dumpDir -File -Filter "*.json" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

while ($true) {
    $backendPids = @(Get-ListenPids -Port ([int] $Profile.BackendPort))
    $frontendPids = @(Get-ListenPids -Port ([int] $Profile.FrontendPort))
    $backendHealth = Test-Url "http://127.0.0.1:$($Profile.BackendPort)/health/live"
    $frontendHealth = Test-Url "http://127.0.0.1:$($Profile.FrontendPort)/mes"
    $latestFrontendDump = Get-LatestDump $FrontendLogDir

    Clear-Host
    Write-Host "DEXCOWIN MES server monitor" -ForegroundColor Cyan
    Write-Host "Closing this window does NOT stop the servers." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Profile : $($Profile.Label)"
    Write-Host "URL     : $($Profile.PublicUrl)"
    Write-Host "Restart : double-click start.bat"
    Write-Host "Watch   : double-click watch.bat"
    Write-Host "Stop    : double-click stop.bat"
    Write-Host ""

    $backendState = if ($backendPids.Count -gt 0 -and $backendHealth -eq 200) { "LIVE" } elseif ($backendPids.Count -gt 0) { "PORT ONLY" } else { "DOWN" }
    $frontendState = if ($frontendPids.Count -gt 0 -and $frontendHealth) { "LIVE" } elseif ($frontendPids.Count -gt 0) { "PORT ONLY" } else { "DOWN" }

    $backendHealthText = if ($backendHealth) { [string] $backendHealth } else { "-" }
    $frontendHealthText = if ($frontendHealth) { [string] $frontendHealth } else { "-" }
    Write-Host ("Backend  : {0} port={1} pid={2} health={3}" -f $backendState, $Profile.BackendPort, ($backendPids -join ","), $backendHealthText)
    Write-Host ("Frontend : {0} port={1} pid={2} http={3}" -f $frontendState, $Profile.FrontendPort, ($frontendPids -join ","), $frontendHealthText)
    Write-Host "Backend runtime : $BackendRuntime"
    Write-Host "Frontend runtime: $FrontendRuntime"
    if ($latestFrontendDump) {
        Write-Host "Latest frontend exit dump: $($latestFrontendDump.FullName)"
    }

    Write-LogTail "Backend stdout" $BackendOut
    Write-LogTail "Backend stderr" $BackendErr 8
    Write-LogTail "Frontend stdout" $FrontendOut
    Write-LogTail "Frontend stderr" $FrontendErr 8

    Start-Sleep -Seconds 2
}
