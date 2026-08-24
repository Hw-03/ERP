[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$TaskName = "DEXCOWIN MES Weekly Inventory Snapshot"
)

$ErrorActionPreference = "Stop"

if ([TimeZoneInfo]::Local.Id -ne "Korea Standard Time") {
    throw "이 작업은 Asia/Seoul(Korea Standard Time) 시스템에서만 등록할 수 있습니다."
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$backendRoot = Join-Path $repoRoot "backend"
$captureScript = Join-Path $backendRoot "scripts\capture_weekly_inventory_snapshot.py"
if (-not (Test-Path -LiteralPath $captureScript -PathType Leaf)) {
    throw "스냅샷 실행 파일을 찾을 수 없습니다: $captureScript"
}

$pythonLauncher = Get-Command py.exe -ErrorAction Stop
$action = New-ScheduledTaskAction `
    -Execute $pythonLauncher.Source `
    -Argument "-3 `"$captureScript`"" `
    -WorkingDirectory $backendRoot
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At "00:00"
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

if ($PSCmdlet.ShouldProcess($TaskName, "매주 월요일 00:00 KST 재고 스냅샷 작업 등록")) {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Description "일요일 23:59 KST 기준 DEXCOWIN MES 완료품 재고를 확정합니다." `
        -Force | Out-Null
    Write-Output "등록 완료: $TaskName (매주 월요일 00:00 KST)"
}
