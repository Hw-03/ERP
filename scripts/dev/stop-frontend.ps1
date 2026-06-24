# scripts/dev/stop-frontend.ps1
# 포트 3001 을 잡고 있는 모든 프로세스 강제 종료 (Node.js / Next.js dev 좀비 방지).

$ErrorActionPreference = "SilentlyContinue"

$pids = @(
    Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
)

if ($pids.Count -eq 0) {
    Write-Host "[stop-frontend] port 3001 already free"
    exit 0
}

foreach ($procId in $pids) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($null -eq $proc) {
        Write-Host "[stop-frontend] PID $procId already gone"
    } else {
        Write-Host "[stop-frontend] taskkill /T /F PID $procId ($($proc.ProcessName))"
        & taskkill.exe /T /F /PID $procId | Out-Null
    }
}

Start-Sleep -Milliseconds 500
Write-Host "[stop-frontend] OK - port 3001 free"
