# scripts/dev/auto-sync-to-employee.ps1
# 예약 전용: 검증된 코드와 사전 검증된 스키마 변경만 직원 서버에 반영한다.

$ErrorActionPreference = "Stop"

$RepoRoot = "C:\ERP"
$SyncScript = Join-Path $RepoRoot "scripts\dev\sync-to-employee.ps1"
$script:EmployeeSyncExit = 1
$script:EmployeeSyncOutput = @()

function Invoke-EmployeeSync {
    param([string[]] $Arguments = @())

    $script:EmployeeSyncOutput = @(
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $SyncScript @Arguments 2>&1
    )
    $script:EmployeeSyncExit = [int] $LASTEXITCODE
    $script:EmployeeSyncOutput | Out-Host
}

Invoke-EmployeeSync -Arguments @("-DryRun")
$dryRunExit = $script:EmployeeSyncExit
if ($dryRunExit -eq 0) {
    $changeLine = $script:EmployeeSyncOutput |
        ForEach-Object { [string] $_ } |
        Where-Object { $_ -match '^SYNC_CHANGES=(0|1)$' } |
        Select-Object -Last 1
    if (-not $changeLine) {
        Write-Host "[auto] dry-run의 SYNC_CHANGES 계약을 확인할 수 없습니다."
        exit 4
    }
    if ($changeLine -eq "SYNC_CHANGES=0") {
        Write-Host "[auto] 코드 변경 없음 - 직원 서버 stop/build/restart를 생략합니다."
        Write-Host "AUTO_SYNC_RESULT=NO_CHANGES"
        exit 0
    }
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
