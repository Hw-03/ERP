$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

$StartBat = Join-Path $RepoRoot "start.bat"
$WatchBat = Join-Path $RepoRoot "watch.bat"
$StopBat = Join-Path $RepoRoot "stop.bat"
$StatusBat = Join-Path $RepoRoot "status.bat"
$WatchScript = Join-Path $RepoRoot "scripts\dev\watch-servers.ps1"
$OpenWatchScript = Join-Path $RepoRoot "scripts\dev\open-watch.ps1"
$WatchServiceScript = Join-Path $RepoRoot "scripts\dev\watch-service.ps1"
$SupervisorScript = Join-Path $RepoRoot "scripts\dev\service_supervisor.py"
$RuntimeControlScript = Join-Path $RepoRoot "scripts\dev\runtime-control.ps1"
$StatusScript = Join-Path $RepoRoot "scripts\dev\status-servers.ps1"
$StopServersScript = Join-Path $RepoRoot "scripts\dev\stop-servers.ps1"
$StartFrontendScript = Join-Path $RepoRoot "scripts\dev\start-frontend.ps1"
$StartBackendScript = Join-Path $RepoRoot "scripts\dev\start-backend.ps1"
$StopFrontendScript = Join-Path $RepoRoot "scripts\dev\stop-frontend.ps1"
$StopBackendScript = Join-Path $RepoRoot "scripts\dev\stop-backend.ps1"
$SyncToEmployeeScript = Join-Path $RepoRoot "scripts\dev\sync-to-employee.ps1"

function Assert-FileExists {
    param([string] $Path)
    if (-not (Test-Path $Path)) {
        throw "Expected file to exist: $Path"
    }
}

function Assert-ContentMatch {
    param(
        [string] $Path,
        [string] $Pattern,
        [string] $Message
    )
    $content = Get-Content -Raw $Path
    if ($content -notmatch $Pattern) {
        throw $Message
    }
}

function Assert-ContentNotMatch {
    param(
        [string] $Path,
        [string] $Pattern,
        [string] $Message
    )
    $content = Get-Content -Raw $Path
    if ($content -match $Pattern) {
        throw $Message
    }
}

Assert-FileExists $WatchBat
Assert-FileExists $StopBat
Assert-FileExists $StatusBat
Assert-FileExists $WatchScript
Assert-FileExists $OpenWatchScript
Assert-FileExists $WatchServiceScript
Assert-FileExists $SupervisorScript
Assert-FileExists $RuntimeControlScript
Assert-FileExists $StatusScript
Assert-FileExists $StopServersScript

Assert-ContentNotMatch $StartBat 'cmd\s*/k.*(uvicorn|npm\s+run\s+dev)' "start.bat must not attach server processes to cmd /k."
Assert-ContentMatch $StartBat 'start-backend\.ps1' "start.bat must call start-backend.ps1."
Assert-ContentMatch $StartBat 'start-frontend\.ps1' "start.bat must call start-frontend.ps1."
Assert-ContentMatch $StartBat 'watch\.bat' "start.bat must mention watch.bat for manual monitoring."
Assert-ContentNotMatch $StartBat 'start\s+"[^"]*"\s+"%~dp0watch\.bat"|Start-Process\s+.*watch\.bat' "start.bat must not open the monitor automatically."
Assert-ContentMatch $StartBat 'stop\.bat' "start.bat must mention stop.bat for full shutdown."

Assert-ContentMatch $WatchBat 'open-watch\.ps1' "watch.bat must open the split monitoring launcher."
Assert-ContentNotMatch $WatchBat 'start-(backend|frontend)|stop-(backend|frontend)|stop-servers|taskkill|Stop-Process' "watch.bat must not start or stop servers."

Assert-ContentMatch $StopBat 'stop-servers\.ps1' "stop.bat must call stop-servers.ps1."
Assert-ContentMatch $StatusBat 'status-servers\.ps1' "status.bat must call status-servers.ps1."
Assert-ContentMatch $StopServersScript 'stop-backend\.ps1' "stop-servers.ps1 must stop the backend."
Assert-ContentMatch $StopServersScript 'stop-frontend\.ps1' "stop-servers.ps1 must stop the frontend."

Assert-ContentMatch $OpenWatchScript 'wt(\.exe)?' "open-watch.ps1 must prefer Windows Terminal for split panes."
Assert-ContentMatch $OpenWatchScript 'split-pane' "open-watch.ps1 must create a split pane for frontend/backend monitoring."
Assert-ContentMatch $OpenWatchScript 'watch-service\.ps1' "open-watch.ps1 must launch service-specific watchers."
Assert-ContentMatch $OpenWatchScript 'TabTitle' "open-watch.ps1 must set a profile-specific monitor tab title."
Assert-ContentMatch $OpenWatchScript 'Start-Process' "open-watch.ps1 must fall back to separate monitor windows when wt.exe is unavailable."
Assert-ContentNotMatch $OpenWatchScript 'taskkill|Stop-Process|stop-backend|stop-frontend|stop-servers|start-backend|start-frontend' "open-watch.ps1 must not start or stop servers."

Assert-ContentMatch $WatchScript 'open-watch\.ps1' "watch-servers.ps1 must delegate to the split monitor launcher."
Assert-ContentNotMatch $WatchScript 'taskkill|Stop-Process|stop-backend|stop-frontend|stop-servers|start-backend|start-frontend' "watch-servers.ps1 must not start or stop servers."

Assert-ContentMatch $WatchServiceScript 'param\s*\(' "watch-service.ps1 must accept parameters."
Assert-ContentMatch $WatchServiceScript 'Service' "watch-service.ps1 must support service selection."
Assert-ContentMatch $WatchServiceScript 'Get-Content\s+.*-Tail' "watch-service.ps1 must show recent logs while monitoring."
Assert-ContentMatch $WatchServiceScript '-Wait' "watch-service.ps1 must stream logs continuously instead of redrawing a status panel."
Assert-ContentMatch $WatchServiceScript 'Start-Job' "watch-service.ps1 must tail each log file independently."
Assert-ContentNotMatch $WatchServiceScript 'Get-Content\s+-Path\s+\$existingPaths[^\r\n]*-Wait' "watch-service.ps1 must not block forever on only the first log path."
Assert-ContentNotMatch $WatchServiceScript 'health/live|Test-Url|Get-NetTCPConnection|State\s+:' "watch-service.ps1 must not render a status dashboard."
Assert-ContentNotMatch $WatchServiceScript 'Profile\s+:|URL\s+:|Runtime\s+:|Restart\s+:|Watch\s+:|Stop\s+:' "watch-service.ps1 must keep the pane content focused on logs only."
Assert-ContentMatch $WatchServiceScript 'NO_COLOR' "watch-service.ps1 must filter noisy frontend color warnings."
Assert-ContentNotMatch $WatchServiceScript 'GET\s+/mes\s+200|GET /mes 200' "watch-service.ps1 must keep frontend success logs visible so the monitor resembles the old frontend log view."
Assert-ContentMatch $WatchServiceScript 'FrontendStdoutNoise' "watch-service.ps1 must keep frontend stdout filtering separate from stderr filtering."
Assert-ContentMatch $WatchServiceScript 'FrontendStderrNoise' "watch-service.ps1 must keep frontend stderr noise filtering separate from stdout logs."
Assert-ContentMatch $WatchServiceScript 'FrontendErrorPatterns' "watch-service.ps1 must define frontend compile/error patterns for prominent monitor output."
Assert-ContentMatch $WatchServiceScript 'FRONTEND ERROR' "watch-service.ps1 must visibly label frontend compile/error lines."
Assert-ContentMatch $WatchServiceScript 'ForegroundColor\s+Red' "watch-service.ps1 must color frontend compile/error lines red when the host supports it."
Assert-ContentMatch $WatchServiceScript 'Syntax Error|Failed to compile' "watch-service.ps1 must recognize common Next.js compile errors."
Assert-ContentMatch $WatchServiceScript 'port_unavailable' "watch-service.ps1 must highlight runtime port failures."
Assert-ContentNotMatch $WatchServiceScript 'Clear-Host|SetCursorPosition|LastRender|Render-MonitorScreen' "watch-service.ps1 must not redraw a synthetic screen."
Assert-ContentNotMatch $WatchServiceScript 'taskkill|Stop-Process|stop-backend|stop-frontend|stop-servers|start-backend|start-frontend' "watch-service.ps1 must not start or stop servers."

Assert-ContentMatch $SyncToEmployeeScript 'open-watch\.ps1' "sync-to-employee.ps1 must copy open-watch.ps1 to the employee server."
Assert-ContentMatch $SyncToEmployeeScript 'watch-service\.ps1' "sync-to-employee.ps1 must copy watch-service.ps1 to the employee server."

Assert-ContentMatch $StartBackendScript 'Start-ServiceSupervisor' "start-backend.ps1 must launch the shared supervisor."
Assert-ContentMatch $StartBackendScript 'backend-runtime\.json' "start-backend.ps1 must write backend runtime metadata."
Assert-ContentMatch $StartFrontendScript 'Start-ServiceSupervisor' "start-frontend.ps1 must launch the shared supervisor."
Assert-ContentMatch $StartFrontendScript 'frontend-runtime\.json' "start-frontend.ps1 must write frontend runtime metadata."
Assert-ContentMatch $RuntimeControlScript 'service_supervisor\.py' "runtime-control.ps1 must invoke the shared supervisor."
Assert-ContentMatch $RuntimeControlScript '(?s)schemaVersion.*Test-StoredRuntimeProcessOwned' "runtime-control.ps1 must validate a stale schema-v1 child PID before stopping it."
Assert-ContentMatch $RuntimeControlScript '(?s)function Start-ServiceSupervisor.*?Test-SupervisorProcessOwned.*?function Stop-SupervisedService' "runtime-control.ps1 must validate the stored supervisor PID before reusing it."
Assert-ContentMatch $RuntimeControlScript '(?s)function Stop-SupervisedService.*?Test-SupervisorProcessOwned' "runtime-control.ps1 must validate the stored supervisor PID before stopping it."
Assert-ContentMatch $RuntimeControlScript '(?s)function Start-ServiceSupervisor.*System\.Threading\.Mutex.*WaitOne' "runtime-control.ps1 must serialize concurrent starts per profile and service."
Assert-ContentMatch $RuntimeControlScript 'sys\.executable' "runtime-control.ps1 must launch the real Python executable so the stored supervisor PID is authoritative."
Assert-ContentMatch $RuntimeControlScript '(?s)launchedStartedAt.*supervisor_start_timeout.*Test-ProcessStartMatches.*Stop-ProcessTree' "runtime-control.ps1 must revalidate a timed-out launch PID before stopping it."
Assert-ContentMatch $RuntimeControlScript '(?s)supervisor_force_stop_after_timeout.*?Test-SupervisorProcessOwned.*?Stop-ProcessTree' "runtime-control.ps1 must revalidate the supervisor immediately before a forced stop."
Assert-ContentMatch $RuntimeControlScript 'Wait-ServicePortFree' "runtime-control.ps1 must verify that the service port is actually free before reporting success."
Assert-ContentMatch $RuntimeControlScript '(?s)candidateExpectedStarts.*Test-ProcessStartMatches.*Stop-ProcessTree' "runtime-control.ps1 must revalidate orphan PID creation time immediately before stopping it."
Assert-ContentMatch $RuntimeControlScript '(?s)candidateToleranceSeconds.*0\.25.*Test-ProcessStartMatches.*ToleranceSeconds' "runtime-control.ps1 must preserve the legacy PID tolerance during final ownership validation."
Assert-ContentMatch $RuntimeControlScript '(?s)function Stop-SupervisedService.*System\.Threading\.Mutex.*WaitOne' "runtime-control.ps1 must serialize stop requests with concurrent starts."
Assert-ContentMatch $StopBackendScript 'backend-runtime-control\.json' "stop-backend.ps1 must write an intentional stop request."
Assert-ContentMatch $StopFrontendScript 'frontend-runtime-control\.json' "stop-frontend.ps1 must write an intentional stop request."
Assert-ContentMatch $SyncToEmployeeScript 'service_supervisor\.py' "sync-to-employee.ps1 must copy the supervisor."
Assert-ContentMatch $SyncToEmployeeScript 'status-servers\.ps1' "sync-to-employee.ps1 must copy status reporting."
Assert-ContentMatch $StatusScript 'Test-SupervisorProcessOwned' "status-servers.ps1 must not report a reused supervisor PID as alive."
Assert-ContentMatch $StatusScript 'Test-StoredRuntimeProcessOwned' "status-servers.ps1 must not report a reused child PID as alive."

. $RuntimeControlScript
$currentCommandLine = Get-ProcessCommandLine -ProcessId $PID
$currentStartedAt = (Get-Process -Id $PID).StartTime.ToString("o")
if (-not $currentCommandLine -or $currentCommandLine -notmatch 'powershell') {
    throw "runtime-control.ps1 must return the current process command line on Windows PowerShell 5.1."
}
$devNextCommand = '"C:\Program Files\nodejs\node.exe" C:\ERP\frontend\node_modules\next\dist\server\lib\start-server.js'
$employeeNextCommand = '"C:\Program Files\nodejs\node.exe" C:\ERP-dev\frontend\node_modules\next\dist\server\lib\start-server.js'
if (-not (Test-ServiceProcessOwned -Service "frontend" -Port 3001 -RepoRoot "C:\ERP" -CommandLine $devNextCommand)) {
    throw "runtime-control.ps1 must recognize the current profile's Next.js listener."
}
if (Test-ServiceProcessOwned -Service "frontend" -Port 3001 -RepoRoot "C:\ERP" -CommandLine $employeeNextCommand) {
    throw "runtime-control.ps1 must never recognize the employee profile's Next.js listener as development."
}
$otherBackendCommand = 'C:\Other\python.exe -m uvicorn other.app:app --port 8011'
if (Test-ServiceProcessOwned -Service "backend" -Port 8011 -RepoRoot "C:\ERP" -CommandLine $otherBackendCommand) {
    throw "runtime-control.ps1 must not identify an unrelated uvicorn process by port alone."
}
$devSupervisorCommand = 'C:\Python\python.exe C:\ERP\scripts\dev\service_supervisor.py --profile development --service frontend --state-path C:\ERP\frontend\logs\frontend-runtime.json'
$employeeSupervisorCommand = 'C:\Python\python.exe C:\ERP-dev\scripts\dev\service_supervisor.py --profile employee --service frontend --state-path C:\ERP-dev\frontend\logs\frontend-runtime.json'
if (-not (Test-SupervisorProcessOwned -ProcessId $PID -ExpectedStartedAt $currentStartedAt -RepoRoot "C:\ERP" -Service "frontend" -StatePath "C:\ERP\frontend\logs\frontend-runtime.json" -CommandLine $devSupervisorCommand)) {
    throw "runtime-control.ps1 must recognize the current profile's supervisor command."
}
if (Test-SupervisorProcessOwned -ProcessId $PID -ExpectedStartedAt $currentStartedAt -RepoRoot "C:\ERP" -Service "frontend" -StatePath "C:\ERP\frontend\logs\frontend-runtime.json" -CommandLine $employeeSupervisorCommand) {
    throw "runtime-control.ps1 must reject another profile's supervisor command."
}
if (Test-SupervisorProcessOwned -ProcessId $PID -ExpectedStartedAt "2000-01-01T00:00:00+09:00" -RepoRoot "C:\ERP" -Service "frontend" -StatePath "C:\ERP\frontend\logs\frontend-runtime.json" -CommandLine $devSupervisorCommand) {
    throw "runtime-control.ps1 must reject a reused supervisor PID with a different creation time."
}
$oneSecondBeforeCurrent = ([DateTimeOffset]::Parse($currentStartedAt).AddSeconds(-1)).ToString("o")
if (Test-SupervisorProcessOwned -ProcessId $PID -ExpectedStartedAt $oneSecondBeforeCurrent -RepoRoot "C:\ERP" -Service "frontend" -StatePath "C:\ERP\frontend\logs\frontend-runtime.json" -CommandLine $devSupervisorCommand) {
    throw "runtime-control.ps1 must not use a wide creation-time tolerance for supervisor ownership."
}
$oneHundredMillisecondsBeforeCurrent = ([DateTimeOffset]::Parse($currentStartedAt).AddMilliseconds(-100)).ToString("o")
if (Test-SupervisorProcessOwned -ProcessId $PID -ExpectedStartedAt $oneHundredMillisecondsBeforeCurrent -RepoRoot "C:\ERP" -Service "frontend" -StatePath "C:\ERP\frontend\logs\frontend-runtime.json" -CommandLine $devSupervisorCommand) {
    throw "runtime-control.ps1 must use kernel-time precision for supervisor ownership."
}
$legacyFrontendWrapper = '"C:\Program Files\nodejs\node.exe" scripts/dev.js'
if (-not (Test-StoredRuntimeProcessOwned `
    -ProcessId $PID `
    -ExpectedStartedAt $currentStartedAt `
    -Service "frontend" `
    -Port 3001 `
    -RepoRoot "C:\ERP" `
    -StoredCwd "C:\ERP\frontend" `
    -CommandLine $legacyFrontendWrapper)) {
    throw "runtime-control.ps1 must recognize a legacy wrapper only when its stored cwd matches the profile."
}
if (Test-StoredRuntimeProcessOwned `
    -ProcessId $PID `
    -ExpectedStartedAt $currentStartedAt `
    -Service "frontend" `
    -Port 3001 `
    -RepoRoot "C:\ERP" `
    -StoredCwd "C:\ERP-dev\frontend" `
    -CommandLine $legacyFrontendWrapper) {
    throw "runtime-control.ps1 must reject a legacy PID from another profile."
}
if (Test-StoredRuntimeProcessOwned `
    -ProcessId $PID `
    -ExpectedStartedAt "2000-01-01T00:00:00+09:00" `
    -Service "frontend" `
    -Port 3001 `
    -RepoRoot "C:\ERP" `
    -StoredCwd "C:\ERP\frontend" `
    -CommandLine $legacyFrontendWrapper) {
    throw "runtime-control.ps1 must reject a reused child PID with a different creation time."
}
if (Test-StoredRuntimeProcessOwned `
    -ProcessId $PID `
    -ExpectedStartedAt $oneSecondBeforeCurrent `
    -Service "frontend" `
    -Port 3001 `
    -RepoRoot "C:\ERP" `
    -StoredCwd "C:\ERP\frontend" `
    -CommandLine $legacyFrontendWrapper) {
    throw "runtime-control.ps1 must not use a wide creation-time tolerance for child ownership."
}
if (Test-StoredRuntimeProcessOwned `
    -ProcessId $PID `
    -ExpectedStartedAt $oneHundredMillisecondsBeforeCurrent `
    -Service "frontend" `
    -Port 3001 `
    -RepoRoot "C:\ERP" `
    -StoredCwd "C:\ERP\frontend" `
    -CommandLine $legacyFrontendWrapper) {
    throw "runtime-control.ps1 must use kernel-time precision for child ownership."
}
Stop-ProcessTree -ProcessId 2147483000
$controlRequest = New-RuntimeControlRequest -Action "stop" -Source "runtime-control-test"
if (-not $controlRequest.requesterParentName) {
    throw "runtime control requests must identify the parent process name."
}
if ($controlRequest.Contains("requesterParentCommand")) {
    throw "runtime control requests must not persist the full parent command line."
}
$incidentLog = Join-Path $env:TEMP "mes-runtime-control-test-$PID.jsonl"
[System.IO.File]::WriteAllLines(
    $incidentLog,
    @(
        '{"event":"stale_supervisor","timestamp":"2026-07-15T00:00:00+09:00"}',
        '{"event":"service_started","timestamp":"2026-07-15T00:00:01+09:00"}',
        '{"event":"stale_pid_reused","timestamp":"2026-07-15T00:00:02+09:00"}',
        '{"event":"service_started","timestamp":"2026-07-15T00:00:03+09:00"}'
    )
)
try {
    $lastIncident = Get-LastRuntimeIncident -Path $incidentLog
    if (-not $lastIncident -or $lastIncident.event -ne "stale_pid_reused") {
        throw "runtime status must preserve the last incident after a successful restart."
    }
}
finally {
    Remove-Item -LiteralPath $incidentLog -Force -ErrorAction SilentlyContinue
}

Write-Host "[test] OK - runtime batch files keep servers detached and monitoring separate"
