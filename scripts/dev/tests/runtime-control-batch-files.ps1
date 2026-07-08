$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

$StartBat = Join-Path $RepoRoot "start.bat"
$WatchBat = Join-Path $RepoRoot "watch.bat"
$StopBat = Join-Path $RepoRoot "stop.bat"
$WatchScript = Join-Path $RepoRoot "scripts\dev\watch-servers.ps1"
$OpenWatchScript = Join-Path $RepoRoot "scripts\dev\open-watch.ps1"
$WatchServiceScript = Join-Path $RepoRoot "scripts\dev\watch-service.ps1"
$StopServersScript = Join-Path $RepoRoot "scripts\dev\stop-servers.ps1"
$StartFrontendScript = Join-Path $RepoRoot "scripts\dev\start-frontend.ps1"
$StartBackendScript = Join-Path $RepoRoot "scripts\dev\start-backend.ps1"
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
Assert-FileExists $WatchScript
Assert-FileExists $OpenWatchScript
Assert-FileExists $WatchServiceScript
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
Assert-ContentNotMatch $WatchServiceScript 'health/live|Test-Url|Get-NetTCPConnection|State\s+:' "watch-service.ps1 must not render a status dashboard."
Assert-ContentNotMatch $WatchServiceScript 'Profile\s+:|URL\s+:|Runtime\s+:|Restart\s+:|Watch\s+:|Stop\s+:' "watch-service.ps1 must keep the pane content focused on logs only."
Assert-ContentMatch $WatchServiceScript 'NO_COLOR' "watch-service.ps1 must filter noisy frontend color warnings."
Assert-ContentNotMatch $WatchServiceScript 'GET\s+/mes\s+200|GET /mes 200' "watch-service.ps1 must keep frontend success logs visible so the monitor resembles the old frontend log view."
Assert-ContentMatch $WatchServiceScript 'FrontendStdoutNoise' "watch-service.ps1 must keep frontend stdout filtering separate from stderr filtering."
Assert-ContentMatch $WatchServiceScript 'FrontendStderrNoise' "watch-service.ps1 must keep frontend stderr noise filtering separate from stdout logs."
Assert-ContentNotMatch $WatchServiceScript 'Clear-Host|SetCursorPosition|LastRender|Render-MonitorScreen' "watch-service.ps1 must not redraw a synthetic screen."
Assert-ContentNotMatch $WatchServiceScript 'taskkill|Stop-Process|stop-backend|stop-frontend|stop-servers|start-backend|start-frontend' "watch-service.ps1 must not start or stop servers."

Assert-ContentMatch $SyncToEmployeeScript 'open-watch\.ps1' "sync-to-employee.ps1 must copy open-watch.ps1 to the employee server."
Assert-ContentMatch $SyncToEmployeeScript 'watch-service\.ps1' "sync-to-employee.ps1 must copy watch-service.ps1 to the employee server."

Assert-ContentMatch $StartBackendScript 'RedirectStandardOutput' "start-backend.ps1 must redirect backend stdout to a log file."
Assert-ContentMatch $StartBackendScript 'backend-runtime\.json' "start-backend.ps1 must write backend runtime metadata."
Assert-ContentMatch $StartFrontendScript 'RedirectStandardOutput' "start-frontend.ps1 must redirect frontend stdout to a log file."
Assert-ContentMatch $StartFrontendScript 'frontend-runtime\.json' "start-frontend.ps1 must write frontend runtime metadata."

Write-Host "[test] OK - runtime batch files keep servers detached and monitoring separate"
