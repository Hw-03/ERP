# scripts/dev/stop-frontend.ps1
# Stop the frontend dev server for the current DEXCOWIN MES root.
# C:\ERP     -> port 3001
# C:\ERP-dev -> port 3000

$ErrorActionPreference = "Stop"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
$Port = [int] $Profile.FrontendPort

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

$pids = Get-ListeningPortPids
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
        & taskkill.exe /T /F /PID $procId | Out-Null
    }
}

Start-Sleep -Milliseconds 500
$remaining = Get-ListeningPortPids
if ($remaining.Count -gt 0) {
    throw "Failed to stop $($Profile.Label) frontend port $Port. Remaining PID(s): $($remaining -join ',')"
}
Write-Host "[stop-frontend] OK - $($Profile.Label) port $Port free"