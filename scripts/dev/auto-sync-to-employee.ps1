# scripts/dev/auto-sync-to-employee.ps1
# 예약 전용: 검증된 코드와 사전 검증된 스키마 변경만 직원 서버에 반영한다.

$ErrorActionPreference = "Stop"

$RepoRoot = "C:\ERP"
$SyncScript = Join-Path $RepoRoot "scripts\dev\sync-to-employee.ps1"

function Invoke-EmployeeSync {
    param([string[]] $Arguments = @())

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $SyncScript @Arguments
    return [int] $LASTEXITCODE
}

Set-Location -LiteralPath $RepoRoot
$dirty = @(git status --porcelain)
if ($LASTEXITCODE -ne 0) {
    Write-Host "[source] git status 확인 실패"
    exit 10
}
if ($dirty.Count -gt 0) {
    Write-Host "[source] 미커밋 변경이 있어 예약 동기화를 중단합니다."
    $dirty | ForEach-Object { Write-Host "  $_" }
    exit 10
}

$upstream = (git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null | Select-Object -Last 1)
if ($LASTEXITCODE -ne 0 -or -not $upstream) {
    Write-Host "[source] 현재 브랜치의 원격 추적 브랜치가 없어 예약 동기화를 중단합니다."
    exit 10
}
$unpublished = @(git rev-list "$upstream..HEAD")
if ($LASTEXITCODE -ne 0) {
    Write-Host "[source] 원격 반영 상태 확인 실패"
    exit 10
}
if ($unpublished.Count -gt 0) {
    Write-Host "[source] 원격에 반영되지 않은 커밋이 있어 예약 동기화를 중단합니다."
    exit 10
}

$dryRunExit = Invoke-EmployeeSync -Arguments @("-DryRun")
if ($dryRunExit -eq 0) {
    exit (Invoke-EmployeeSync)
}
if ($dryRunExit -eq 2) {
    Write-Host "[auto] 최근 직원 활동으로 다음 예약까지 동기화를 미룹니다."
    exit 2
}
if ($dryRunExit -eq 3) {
    exit (Invoke-EmployeeSync -Arguments @("-AutoSchema"))
}

Write-Host "[auto] dry-run 실패 (exit $dryRunExit)"
exit $dryRunExit
