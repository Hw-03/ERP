# scripts/dev/auto-sync-to-employee.ps1
# 예약 전용: 검증된 코드와 사전 검증된 스키마 변경만 직원 서버에 반영한다.

$ErrorActionPreference = "Stop"

$RepoRoot = "C:\ERP"
$SyncScript = Join-Path $RepoRoot "scripts\dev\sync-to-employee.ps1"
$script:EmployeeSyncExit = 1

function Invoke-EmployeeSync {
    param([string[]] $Arguments = @())

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $SyncScript @Arguments | Out-Host
    $script:EmployeeSyncExit = [int] $LASTEXITCODE
}

Invoke-EmployeeSync -Arguments @("-DryRun")
$dryRunExit = $script:EmployeeSyncExit
if ($dryRunExit -eq 0) {
    Invoke-EmployeeSync
    exit $script:EmployeeSyncExit
}
if ($dryRunExit -eq 2) {
    Write-Host "[auto] 최근 직원 활동으로 다음 예약까지 동기화를 미룹니다."
    exit 2
}
if ($dryRunExit -eq 3) {
    Invoke-EmployeeSync -Arguments @("-AutoSchema")
    exit $script:EmployeeSyncExit
}

Write-Host "[auto] dry-run 실패 (exit $dryRunExit)"
exit $dryRunExit
