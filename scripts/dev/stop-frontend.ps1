# scripts/dev/stop-frontend.ps1
# Stop the frontend dev server for the current DEXCOWIN MES root.
# C:\ERP     -> port 3001
# C:\ERP-dev -> port 3000

$ErrorActionPreference = "Stop"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
$Port = [int] $Profile.FrontendPort
$RuntimeFile = Join-Path $Profile.RepoRoot "frontend\logs\frontend-runtime.json"

function Get-ListeningPortPids {
    $combined = @()
    $tcpPids = @(
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
    $netstatPids = @(
        & netstat.exe -ano -p tcp 2>$null |
            ForEach-Object {
                if ($_ -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
                    [int] $Matches[1]
                }
            }
    )
    if ($tcpPids) { foreach ($p in $tcpPids) { $combined += [int] $p } }
    if ($netstatPids) { foreach ($p in $netstatPids) { $combined += [int] $p } }
    return @($combined | Where-Object { $_ } | Sort-Object -Unique)
}

function Get-RuntimePid {
    if (-not (Test-Path $RuntimeFile)) { return @() }
    try {
        $runtime = Get-Content -Raw $RuntimeFile | ConvertFrom-Json
        if ($runtime.pid -and (Get-Process -Id ([int] $runtime.pid) -ErrorAction SilentlyContinue)) {
            return @([int] $runtime.pid)
        }
    }
    catch {
        return @()
    }
    return @()
}

function Get-NextDevPids {
    @(
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object {
                $_.CommandLine -and
                ($_.CommandLine -match 'next[\\/]dist[\\/]bin[\\/]next') -and
                ($_.CommandLine -match "--port\s+$Port")
            } |
            Select-Object -ExpandProperty ProcessId
    )
}

$combined = @()
$listenPids = Get-ListeningPortPids
$runtimePids = Get-RuntimePid
$nextDevPids = Get-NextDevPids
if ($listenPids) { foreach ($p in $listenPids) { $combined += [int] $p } }
if ($runtimePids) { foreach ($p in $runtimePids) { $combined += [int] $p } }
if ($nextDevPids) { foreach ($p in $nextDevPids) { $combined += [int] $p } }
$pids = @($combined | Where-Object { $_ } | Sort-Object -Unique)
if ($pids.Count -eq 0) {
    Write-Host "[stop-frontend] $($Profile.Label) port $Port already free"
    exit 0
}

foreach ($procId in $pids) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($null -eq $proc) {
        Write-Host "[stop-frontend] PID $procId already gone"
    }
    else {
        Write-Host "[stop-frontend] taskkill /T /F PID $procId ($($proc.ProcessName))"
        & cmd.exe /c "taskkill.exe /T /F /PID $procId >NUL 2>NUL"
    }
}

Start-Sleep -Milliseconds 500
$remaining = Get-ListeningPortPids
$remainingNext = Get-NextDevPids
if ($remaining.Count -gt 0 -or $remainingNext.Count -gt 0) {
    throw "Failed to stop $($Profile.Label) frontend port $Port. Remaining listen PID(s): $($remaining -join ','), next PID(s): $($remainingNext -join ',')"
}
Write-Host "[stop-frontend] OK - $($Profile.Label) port $Port free"
