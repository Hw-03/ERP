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
$RuntimePathsScript = Join-Path $RepoRoot "scripts\dev\runtime-paths.ps1"
$CheckedCommandScript = Join-Path $RepoRoot "scripts\dev\checked-command.ps1"
$EnsureSchemaReadyScript = Join-Path $RepoRoot "scripts\dev\ensure-schema-ready.ps1"
$StatusScript = Join-Path $RepoRoot "scripts\dev\status-servers.ps1"
$StopServersScript = Join-Path $RepoRoot "scripts\dev\stop-servers.ps1"
$StartFrontendScript = Join-Path $RepoRoot "scripts\dev\start-frontend.ps1"
$StartBackendScript = Join-Path $RepoRoot "scripts\dev\start-backend.ps1"
$StopFrontendScript = Join-Path $RepoRoot "scripts\dev\stop-frontend.ps1"
$StopBackendScript = Join-Path $RepoRoot "scripts\dev\stop-backend.ps1"
$SyncToEmployeeScript = Join-Path $RepoRoot "scripts\dev\sync-to-employee.ps1"
$BackupBat = Join-Path $RepoRoot "scripts\ops\backup_db.bat"
$RestoreBat = Join-Path $RepoRoot "scripts\ops\restore_db.bat"

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
Assert-FileExists $RuntimePathsScript
Assert-FileExists $EnsureSchemaReadyScript
Assert-FileExists $StatusScript
Assert-FileExists $StopServersScript
Assert-FileExists $BackupBat
Assert-FileExists $RestoreBat

Assert-ContentNotMatch $StartBat 'cmd\s*/k.*(uvicorn|npm\s+run\s+dev)' "start.bat must not attach server processes to cmd /k."
Assert-ContentMatch $StartBat 'start-backend\.ps1' "start.bat must call start-backend.ps1."
Assert-ContentMatch $StartBat 'start-frontend\.ps1' "start.bat must call start-frontend.ps1."
Assert-ContentMatch $StartBat 'watch\.bat' "start.bat must mention watch.bat for manual monitoring."
Assert-ContentNotMatch $StartBat 'start\s+"[^"]*"\s+"%~dp0watch\.bat"|Start-Process\s+.*watch\.bat' "start.bat must not open the monitor automatically."
Assert-ContentMatch $StartBat 'stop\.bat' "start.bat must mention stop.bat for full shutdown."
Assert-ContentMatch $StartBat 'ensure-schema-ready\.ps1' "start.bat must delegate schema readiness to the shared helper."
Assert-ContentMatch $StartBat '-Mode\s+Start' "start.bat must invoke the read-only schema-start mode."
Assert-ContentNotMatch $StartBat '(?m)^\s*py\s+bootstrap_db\.py[^\r\n]*--(schema|migrate|all)' "start.bat must not embed direct database mutation commands."
Assert-ContentMatch $StartBat '(?s)ensure-schema-ready\.ps1.*?-Mode\s+Start.*?SCHEMA_EXIT.*?exit\s+/b\s+%SCHEMA_EXIT%.*?start-backend\.ps1' "start.bat must propagate schema readiness failures before server startup."

Assert-ContentMatch $EnsureSchemaReadyScript 'ValidateSet\("Start",\s*"Report"\)' "schema helper must expose Start and Report modes."
Assert-ContentMatch $EnsureSchemaReadyScript 'bootstrap_db\.py.*--check' "schema helper must invoke bootstrap --check."
foreach ($forbiddenSchemaHelperPattern in @('--migrate', 'stop-servers\.ps1', 'backup_db\.py', 'restore_db\.py', '_verify_backup\.py', 'check_inventory_integrity\.py', 'Read-Host', 'mes\.db')) {
    Assert-ContentNotMatch $EnsureSchemaReadyScript $forbiddenSchemaHelperPattern "schema helper must remain a read-only DATABASE_URL adapter: $forbiddenSchemaHelperPattern"
}
Assert-ContentMatch $EnsureSchemaReadyScript 'ready=True' "schema helper must require the machine-readable ready marker."
Assert-ContentMatch $EnsureSchemaReadyScript 'ready=False' "schema helper must distinguish a machine-readable not-ready result."
Assert-ContentMatch $EnsureSchemaReadyScript 'exit\s+2' "schema helper must return 2 for NOT_READY."
Assert-ContentMatch $EnsureSchemaReadyScript 'exit\s+3' "schema helper must return 3 for CHECK_ERROR."

Assert-ContentMatch $WatchBat 'open-watch\.ps1' "watch.bat must open the split monitoring launcher."
Assert-ContentNotMatch $WatchBat 'start-(backend|frontend)|stop-(backend|frontend)|stop-servers|taskkill|Stop-Process' "watch.bat must not start or stop servers."

Assert-ContentMatch $StopBat 'stop-servers\.ps1' "stop.bat must call stop-servers.ps1."
Assert-ContentMatch $StatusBat 'status-servers\.ps1' "status.bat must call status-servers.ps1."
Assert-ContentMatch $StatusScript 'ensure-schema-ready\.ps1' "status must report shared schema readiness."
Assert-ContentMatch $StatusScript '-Mode\s+Report' "status must use read-only schema report mode."
Assert-ContentMatch $StatusScript 'status-database.*NOT_READY' "status must label NOT_READY distinctly."
Assert-ContentMatch $StatusScript 'status-database.*CHECK_ERROR' "status must label CHECK_ERROR distinctly."
Assert-ContentMatch $WatchServiceScript 'ensure-schema-ready\.ps1' "backend monitor must report shared schema readiness once."
Assert-ContentMatch $WatchServiceScript '-Mode\s+Report' "backend monitor must use read-only schema report mode."
Assert-ContentMatch $WatchServiceScript 'watch-database.*NOT_READY' "watch must label NOT_READY distinctly."
Assert-ContentMatch $WatchServiceScript 'watch-database.*CHECK_ERROR' "watch must label CHECK_ERROR distinctly."
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
Assert-ContentMatch $SyncToEmployeeScript 'runtime-paths\.ps1' "sync-to-employee.ps1 must copy the shared runtime path resolver."
Assert-ContentMatch $SyncToEmployeeScript 'checked-command\.ps1' "sync-to-employee.ps1 must use and copy the checked external-command helper."
Assert-ContentMatch $SyncToEmployeeScript 'ensure-schema-ready\.ps1' "sync-to-employee.ps1 must copy the shared schema readiness helper."
Assert-ContentMatch $CheckedCommandScript 'Invoke-CheckedExternalCommand' "checked-command.ps1 must expose checked external command execution."

Assert-ContentMatch $RuntimePathsScript 'MES_RUNTIME_ROOT' "runtime-paths.ps1 must support the single runtime root override."
Assert-ContentMatch $RuntimePathsScript '_attic[\\/]runtime' "runtime-paths.ps1 must default permanent artifacts to _attic/runtime."
Assert-ContentMatch $RuntimePathsScript 'outside MES_RUNTIME_ROOT' "runtime-paths.ps1 must reject paths outside the runtime root."
foreach ($runtimeScript in @($StartBackendScript, $StartFrontendScript, $StopBackendScript, $StopFrontendScript, $StatusScript, $WatchServiceScript)) {
    Assert-ContentMatch $runtimeScript 'runtime-paths\.ps1' "$runtimeScript must use the shared runtime path resolver."
    Assert-ContentNotMatch $runtimeScript '(backend|frontend)[\\/]logs' "$runtimeScript must not use legacy service-local log directories."
}

Assert-ContentMatch $BackupBat 'backup_db\.py' "backup_db.bat must delegate to backup_db.py."
Assert-ContentNotMatch $BackupBat 'sqlite3|copy\s+/Y|_verify_backup' "backup_db.bat must stay a thin Python wrapper."
Assert-ContentMatch $RestoreBat 'restore_db\.py' "restore_db.bat must delegate to restore_db.py."
Assert-ContentNotMatch $RestoreBat 'copy\s+/Y|_verify_backup' "restore_db.bat must stay a thin Python wrapper."

Assert-ContentMatch $SyncToEmployeeScript 'Join-Path\s+\$EmpRoot\s+"_attic\\runtime\\backups\\sqlite"' "employee backups must live under the employee runtime root."
Assert-ContentMatch $SyncToEmployeeScript 'backup_db\.py' "employee deployment must use sqlite3.backup through backup_db.py."
Assert-ContentNotMatch $SyncToEmployeeScript 'Copy-Item\s+\$EmpDb\s+\$backupPath' "employee deployment must not raw-copy the live SQLite DB."
Assert-ContentMatch $SyncToEmployeeScript 'BACKUP_PATH=' "employee deployment must parse the exact verified backup path."
Assert-ContentNotMatch $SyncToEmployeeScript 'Get-ChildItem[^\r\n]+mes_\*\.db' "employee deployment must not guess the new backup from a directory scan."
Assert-ContentMatch $SyncToEmployeeScript '(?s)\[guard\].*\[schema\].*\[stop\].*\[backup\].*\[sync\].*\[migrate\].*\[post-verify\].*\[start\].*\[health\]' "employee deployment stages must follow the guarded stop/backup/sync/migrate/verify/start/health order."
Assert-ContentMatch $SyncToEmployeeScript '(?s)function\s+Restart-EmployeeServices.*start-backend\.ps1.*start-frontend\.ps1.*Success' "the checked restart helper must report both employee service results."
Assert-ContentMatch $SyncToEmployeeScript '(?s)if\s*\(-not\s+\$backupResult\.Success\).*Restart-EmployeeServices.*exit\s+7' "backup failure must restart the existing employee servers and abort deployment."
Assert-ContentMatch $SyncToEmployeeScript '(?s)\$backendStop.*Invoke-EmployeeServiceScript.*\$frontendStop.*Invoke-EmployeeServiceScript.*Test-TcpPortFree\s+-Port\s+8010.*Test-TcpPortFree\s+-Port\s+3000' "employee deployment must check stop exits and actual ports before backup."
Assert-ContentMatch $SyncToEmployeeScript '(?s)Invoke-CheckedExternalCommand.*bootstrap_db\.py.*--migrate.*WorkingDirectory\s+\$EmpBackend' "employee deployment must run Alembic migration through the checked command helper in the employee backend."
Assert-ContentMatch $SyncToEmployeeScript '(?s)bootstrap_db\.py.*--migrate.*bootstrap_db\.py.*--check.*_verify_backup\.py.*check_inventory_integrity\.py.*\[start\]' "employee deployment must check Alembic head and database integrity before restarting services."
Assert-ContentNotMatch $SyncToEmployeeScript 'failed=\(\\d\+\)|\$failedCount' "employee deployment must decide migration success only from the checked process result."
Assert-ContentMatch $SyncToEmployeeScript '\\\\alembic\\\\' "schema guard must detect Alembic revision changes."
Assert-ContentMatch $SyncToEmployeeScript 'alembic\\\.ini' "schema guard must detect alembic.ini changes."
Assert-ContentMatch $SyncToEmployeeScript 'migration_type_compare\\\.py' "schema guard must detect migration type comparison changes."
Assert-ContentMatch $SyncToEmployeeScript '(?s)\$backendDryRun\s*=\s*robocopy.*?/NJH\s+/NDL\s+/NP\s+2>&1' "backend dry-run must retain robocopy file classes for schema detection and reporting."
Assert-ContentMatch $SyncToEmployeeScript '(?s)\$frontendDryRun\s*=\s*robocopy.*?/NJH\s+/NDL\s+/NP\s+2>&1' "frontend dry-run must retain robocopy file classes for change reporting."
Assert-ContentMatch $SyncToEmployeeScript '(?s)_verify_backup\.py.*check_inventory_integrity\.py.*--db-url.*Write-RecoveryInstructions.*exit\s+8' "post-verification must run schema and inventory checks and leave recovery guidance on failure."
Assert-ContentMatch $SyncToEmployeeScript 'restore_db\.py.*--sqlite.*--target.*--check' "migration or post-verification failure must print the exact restore_db.py command."
Assert-ContentNotMatch $SyncToEmployeeScript '&\s+.*restore_db\.py' "employee deployment must never auto-restore the database."

Assert-ContentMatch $StartBackendScript 'Start-ServiceSupervisor' "start-backend.ps1 must launch the shared supervisor."
Assert-ContentMatch $StartBackendScript 'backend-runtime\.json' "start-backend.ps1 must write backend runtime metadata."
Assert-ContentMatch $StartFrontendScript 'Invoke-ProfileFrontendStartup' "start-frontend.ps1 must launch through shared profile startup orchestration."
Assert-ContentMatch $RuntimeControlScript '(?s)function\s+Start-ProfileFrontendSupervisor.*?Start-ServiceSupervisor' "runtime-control.ps1 must launch the frontend through the shared supervisor."
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
Assert-ContentMatch $RuntimeControlScript '(?s)function\s+Recover-CrashLoopPortListeners.*?Test-ServiceProcessOwned.*?Get-ProcessStartedAt.*?Test-ProcessStartMatches.*?Stop-ProcessTree.*?Wait-ServicePortFree.*?orphan_listener_recovered' "runtime-control.ps1 must recover only revalidated owned crash-loop listeners before resetting the supervisor."
Assert-ContentMatch $RuntimeControlScript '(?s)foreach\s*\(\$candidate\s+in\s+\$candidates\).*?Get-ProcessCommandLine.*?Test-ServiceProcessOwned.*?Test-ProcessStartMatches.*?Stop-ProcessTree' "runtime-control.ps1 must revalidate command line and start time immediately before each crash-loop listener kill."
Assert-ContentMatch $RuntimeControlScript 'kill_revalidation_failed_after_partial_recovery' "runtime-control.ps1 must distinguish a crash-loop conflict after partial listener recovery."
Assert-ContentMatch $RuntimeControlScript 'terminatedPids\s*=\s*@\(\$terminatedPids\)' "runtime-control.ps1 must record already terminated listener PIDs when later kill revalidation fails."
Assert-ContentMatch $RuntimeControlScript '(?s)state\.status\s+-eq\s+"crash_loop".*?Recover-CrashLoopPortListeners.*?restart-reset' "crash-loop supervisors must recover an owned listener conflict before a restart reset."
Assert-ContentMatch $RuntimeControlScript '(?s)port_conflict.*crash_loop' "runtime-control.ps1 must record crash-loop listener ownership conflicts."
Assert-ContentMatch $RuntimeControlScript 'MES_SUPERVISED_FRONTEND\s*=\s*"1"' "runtime-control.ps1 must mark the supervised frontend child."
Assert-ContentMatch $RuntimeControlScript '(?s)\$frontendMode\s*=\s*if.*?Profile\.Name.*?employee.*?start.*?dev.*?MES_FRONTEND_MODE\s*=\s*\$frontendMode' "runtime-control.ps1 must run only the employee frontend with next start."
Assert-ContentMatch $RuntimeControlScript 'BACKEND_INTERNAL_URL' "runtime-control.ps1 must pass the profile backend URL to the frontend child."
Assert-ContentMatch $RuntimeControlScript 'health/live' "runtime-control.ps1 must verify direct backend health before starting the frontend."
Assert-ContentMatch $RuntimeControlScript 'backend_proxy_mismatch' "runtime-control.ps1 must record a backend proxy boot-id mismatch."
Assert-ContentMatch $RuntimeControlScript '(?s)backend_proxy_mismatch.*?Stop-SupervisedService.*?Start-ProfileFrontendSupervisor.*?backend_proxy_mismatch.*?throw' "runtime-control.ps1 must control-restart only this profile frontend once before failing a persistent proxy mismatch."
Assert-ContentMatch $StartFrontendScript 'Invoke-ProfileFrontendStartup' "start-frontend.ps1 must delegate profile-scoped startup and proxy verification to runtime-control.ps1."
Assert-ContentMatch $RuntimeControlScript 'function\s+Invoke-ProfileFrontendStartup' "runtime-control.ps1 must expose injectable frontend startup orchestration for behavior tests."
Assert-ContentMatch $RuntimeControlScript '(?s)function\s+Invoke-ProfileFrontendStartup.*?health/live.*?Start-ProfileFrontendSupervisor.*?api/app-session.*?backend_proxy_mismatch.*?Stop-SupervisedService.*?Start-ProfileFrontendSupervisor' "frontend startup orchestration must check backend health before start and perform one profile-scoped proxy mismatch restart."
Assert-ContentMatch $RuntimeControlScript '(?s)frontend-startup.*?System\.Threading\.Mutex|System\.Threading\.Mutex.*?frontend-startup' "frontend startup orchestration must serialize each profile with a dedicated mutex."
Assert-ContentMatch $RuntimeControlScript '(?s)attempt\s*=\s*2.*?Stop-SupervisedService.*?persistent-proxy-mismatch.*?throw' "a persistent proxy mismatch must stop the stale frontend before failing."
Assert-ContentMatch $RuntimeControlScript '\$frontendPattern\s*=\s*''\^\\s\*''' "frontend listener ownership must anchor the complete command line."
Assert-ContentMatch $RuntimeControlScript 'start-server\\\.js' "frontend listener ownership must require Next start-server.js."
Assert-ContentMatch $RuntimeControlScript '(?s)function\s+Test-ServiceProcessOwned.*?TrustedAncestorPids.*?Test-ProcessDescendsFrom' "backend listener ownership must require trusted supervisor ancestry."
Assert-ContentMatch $RuntimeControlScript '(?s)candidateExpectedStarts.*Test-ProcessStartMatches.*Stop-ProcessTree' "runtime-control.ps1 must revalidate orphan PID creation time immediately before stopping it."
Assert-ContentMatch $RuntimeControlScript '(?s)candidateToleranceSeconds.*0\.25.*Test-ProcessStartMatches.*ToleranceSeconds' "runtime-control.ps1 must preserve the legacy PID tolerance during final ownership validation."
Assert-ContentMatch $RuntimeControlScript '(?s)function Stop-SupervisedService.*System\.Threading\.Mutex.*WaitOne' "runtime-control.ps1 must serialize stop requests with concurrent starts."
Assert-ContentMatch $StopBackendScript 'backend-runtime-control\.json' "stop-backend.ps1 must write an intentional stop request."
Assert-ContentMatch $StopFrontendScript 'frontend-runtime-control\.json' "stop-frontend.ps1 must write an intentional stop request."
Assert-ContentMatch $SyncToEmployeeScript 'service_supervisor\.py' "sync-to-employee.ps1 must copy the supervisor."
Assert-ContentMatch $SyncToEmployeeScript 'status-servers\.ps1' "sync-to-employee.ps1 must copy status reporting."
Assert-ContentMatch $SyncToEmployeeScript '(?s)\[sync-frontend\].*?robocopy.*?Invoke-EmployeeFrontendBuild.*?\[sync\] 백엔드.*?robocopy.*?\[migrate\]' "employee deployment must build the production frontend before backend sync and DB migration."
Assert-ContentMatch $SyncToEmployeeScript '(?s)\.next-prod.*?previous.*?npm\.cmd.*?run.*?build.*?Restart-EmployeeServices.*?exit\s+9' "employee deployment must restore the prior frontend build and services when production build fails."
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
$devSupervisorCommand = 'C:\Python\python.exe C:\ERP\scripts\dev\service_supervisor.py --profile development --service frontend --state-path C:\ERP\_attic\runtime\logs\frontend\frontend-runtime.json'
$employeeSupervisorCommand = 'C:\Python\python.exe C:\ERP-dev\scripts\dev\service_supervisor.py --profile employee --service frontend --state-path C:\ERP-dev\_attic\runtime\logs\frontend\frontend-runtime.json'
if (-not (Test-SupervisorProcessOwned -ProcessId $PID -ExpectedStartedAt $currentStartedAt -RepoRoot "C:\ERP" -Service "frontend" -StatePath "C:\ERP\_attic\runtime\logs\frontend\frontend-runtime.json" -CommandLine $devSupervisorCommand)) {
    throw "runtime-control.ps1 must recognize the current profile's supervisor command."
}
if (Test-SupervisorProcessOwned -ProcessId $PID -ExpectedStartedAt $currentStartedAt -RepoRoot "C:\ERP" -Service "frontend" -StatePath "C:\ERP\_attic\runtime\logs\frontend\frontend-runtime.json" -CommandLine $employeeSupervisorCommand) {
    throw "runtime-control.ps1 must reject another profile's supervisor command."
}
if (Test-SupervisorProcessOwned -ProcessId $PID -ExpectedStartedAt "2000-01-01T00:00:00+09:00" -RepoRoot "C:\ERP" -Service "frontend" -StatePath "C:\ERP\_attic\runtime\logs\frontend\frontend-runtime.json" -CommandLine $devSupervisorCommand) {
    throw "runtime-control.ps1 must reject a reused supervisor PID with a different creation time."
}
$oneSecondBeforeCurrent = ([DateTimeOffset]::Parse($currentStartedAt).AddSeconds(-1)).ToString("o")
if (Test-SupervisorProcessOwned -ProcessId $PID -ExpectedStartedAt $oneSecondBeforeCurrent -RepoRoot "C:\ERP" -Service "frontend" -StatePath "C:\ERP\_attic\runtime\logs\frontend\frontend-runtime.json" -CommandLine $devSupervisorCommand) {
    throw "runtime-control.ps1 must not use a wide creation-time tolerance for supervisor ownership."
}
$oneHundredMillisecondsBeforeCurrent = ([DateTimeOffset]::Parse($currentStartedAt).AddMilliseconds(-100)).ToString("o")
if (Test-SupervisorProcessOwned -ProcessId $PID -ExpectedStartedAt $oneHundredMillisecondsBeforeCurrent -RepoRoot "C:\ERP" -Service "frontend" -StatePath "C:\ERP\_attic\runtime\logs\frontend\frontend-runtime.json" -CommandLine $devSupervisorCommand) {
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
