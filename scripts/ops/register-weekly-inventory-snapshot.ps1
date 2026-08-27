[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string] $TaskName = "DEXCOWIN MES Weekly Inventory Snapshot",
    [switch] $PreflightOnly
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
Get-Command Register-ScheduledTask -ErrorAction Stop | Out-Null
Get-Command Export-ScheduledTask -ErrorAction Stop | Out-Null

if ($PreflightOnly) {
    Write-Output "Weekly snapshot task preflight passed: $captureScript"
    exit 0
}

$action = New-ScheduledTaskAction `
    -Execute $pythonLauncher.Source `
    -Argument "-3 `"$captureScript`"" `
    -WorkingDirectory $backendRoot
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At "00:00"
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

if (-not $PSCmdlet.ShouldProcess($TaskName, "매주 월요일 00:00 KST 재고 스냅샷 작업 등록")) {
    exit 0
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "일요일 23:59 KST 기준 DEXCOWIN MES 완료품 재고를 확정합니다." `
    -Force | Out-Null

[xml] $taskXml = Export-ScheduledTask -TaskName $TaskName
$namespace = New-Object System.Xml.XmlNamespaceManager($taskXml.NameTable)
$namespace.AddNamespace("t", $taskXml.DocumentElement.NamespaceURI)

function Get-TaskXmlValue {
    param([string] $XPath)

    $node = $taskXml.SelectSingleNode($XPath, $namespace)
    if ($null -eq $node) {
        return $null
    }
    return $node.InnerText
}

$validationErrors = [System.Collections.Generic.List[string]]::new()
$actualCommand = Get-TaskXmlValue -XPath "/t:Task/t:Actions/t:Exec/t:Command"
$actualArguments = Get-TaskXmlValue -XPath "/t:Task/t:Actions/t:Exec/t:Arguments"
$actualWorkingDirectory = Get-TaskXmlValue -XPath "/t:Task/t:Actions/t:Exec/t:WorkingDirectory"
$startBoundary = Get-TaskXmlValue -XPath "/t:Task/t:Triggers/t:CalendarTrigger/t:StartBoundary"
$monday = $taskXml.SelectSingleNode(
    "/t:Task/t:Triggers/t:CalendarTrigger/t:ScheduleByWeek/t:DaysOfWeek/t:Monday",
    $namespace
)
$startWhenAvailable = Get-TaskXmlValue -XPath "/t:Task/t:Settings/t:StartWhenAvailable"
$multipleInstances = Get-TaskXmlValue -XPath "/t:Task/t:Settings/t:MultipleInstancesPolicy"
$executionTimeLimit = Get-TaskXmlValue -XPath "/t:Task/t:Settings/t:ExecutionTimeLimit"

$expectedCommand = [System.IO.Path]::GetFullPath($pythonLauncher.Source)
$expectedArguments = "-3 `"$captureScript`""
$expectedWorkingDirectory = [System.IO.Path]::GetFullPath($backendRoot)

try {
    $normalizedCommand = [System.IO.Path]::GetFullPath($actualCommand.Trim('"'))
}
catch {
    $normalizedCommand = ""
}
try {
    $normalizedWorkingDirectory = [System.IO.Path]::GetFullPath($actualWorkingDirectory)
}
catch {
    $normalizedWorkingDirectory = ""
}

if (-not $normalizedCommand.Equals($expectedCommand, [System.StringComparison]::OrdinalIgnoreCase)) {
    $validationErrors.Add("실행 파일이 직원 환경 Python과 다릅니다.")
}
if (-not [string]::Equals($actualArguments, $expectedArguments, [System.StringComparison]::OrdinalIgnoreCase)) {
    $validationErrors.Add("실행 인수가 직원 환경 스냅샷 스크립트와 다릅니다.")
}
if (-not $normalizedWorkingDirectory.Equals($expectedWorkingDirectory, [System.StringComparison]::OrdinalIgnoreCase)) {
    $validationErrors.Add("작업 디렉터리가 직원 환경 backend와 다릅니다.")
}

$parsedStart = [datetime]::MinValue
if (-not [datetime]::TryParse($startBoundary, [ref] $parsedStart) -or $parsedStart.TimeOfDay -ne [TimeSpan]::Zero) {
    $validationErrors.Add("실행 시각이 월요일 00:00이 아닙니다.")
}
if ($null -eq $monday) {
    $validationErrors.Add("월요일 실행 요일이 설정되지 않았습니다.")
}
if ($startWhenAvailable -ne "true") {
    $validationErrors.Add("StartWhenAvailable이 활성화되지 않았습니다.")
}
if ($multipleInstances -ne "IgnoreNew") {
    $validationErrors.Add("중복 실행 정책이 IgnoreNew가 아닙니다.")
}
if ($executionTimeLimit -ne "PT10M") {
    $validationErrors.Add("실행 제한 시간이 10분이 아닙니다.")
}

if ($validationErrors.Count -gt 0) {
    throw "주간 재고 스냅샷 예약 작업 검증 실패: $($validationErrors -join ' ')"
}

Write-Output "Weekly snapshot task verified: $TaskName (매주 월요일 00:00 KST)"
