# scripts/dev/stop-backend.ps1
# Stop the backend for the current DEXCOWIN MES root.
# C:\ERP     -> port 8011
# C:\ERP-dev -> port 8010

$ErrorActionPreference = "Stop"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
$Port = [int] $Profile.BackendPort
$RuntimeFile = Join-Path $Profile.RepoRoot "backend\logs\backend-runtime.json"

function Get-ListenPidsFromNetstat {
    @(
        & netstat.exe -ano -p tcp 2>$null |
            ForEach-Object {
                if ($_ -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
                    [int] $Matches[1]
                }
            } |
            Sort-Object -Unique
    )
}

function Get-PortPids {
    $combined = @()
    $tcpPids = @(
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
    $netstatPids = Get-ListenPidsFromNetstat
    if ($tcpPids) { foreach ($p in $tcpPids) { $combined += [int] $p } }
    if ($netstatPids) { foreach ($p in $netstatPids) { $combined += [int] $p } }
    return @($combined | Where-Object { $_ } | Sort-Object -Unique)
}

function Get-UvicornPythonPids {
    @(
        Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='py.exe'" -ErrorAction SilentlyContinue |
            Where-Object {
                $_.CommandLine -and
                ($_.CommandLine -match 'uvicorn\s+app\.main:app') -and
                ($_.CommandLine -match "--port\s+$Port")
            } |
            Select-Object -ExpandProperty ProcessId
    )
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

# Sweep up to 3 times to handle uvicorn reload parent/worker handoff.
for ($attempt = 1; $attempt -le 3; $attempt++) {
    $listenPids = Get-PortPids
    $uvicornPids = Get-UvicornPythonPids
    $runtimePids = Get-RuntimePid
    $combined = @()
    if ($listenPids) { foreach ($p in $listenPids) { $combined += [int] $p } }
    if ($uvicornPids) { foreach ($p in $uvicornPids) { $combined += [int] $p } }
    if ($runtimePids) { foreach ($p in $runtimePids) { $combined += [int] $p } }
    $allPids = @($combined | Sort-Object -Unique)

    if ($allPids.Count -eq 0) { break }

    foreach ($procId in $allPids) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($null -eq $proc) {
            Write-Host "[stop] PID $procId already gone - attempt $attempt"
        }
        else {
            Write-Host "[stop] taskkill /T /F PID $procId ($($proc.ProcessName)) - attempt $attempt"
            & cmd.exe /c "taskkill.exe /T /F /PID $procId >NUL 2>NUL"
        }
    }
    Start-Sleep -Milliseconds 1000
}

$stillListen = Get-PortPids
$stillUvicorn = Get-UvicornPythonPids
if ($stillListen.Count -gt 0 -or $stillUvicorn.Count -gt 0) {
    $msg = "Failed to stop $($Profile.Label) backend port $Port - listen: $($stillListen -join ','), uvicorn-py: $($stillUvicorn -join ',')"
    throw $msg
}

Write-Host "[stop] OK - $($Profile.Label) port $Port free, no uvicorn python alive"
