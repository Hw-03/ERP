$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

$StartBat = Join-Path $RepoRoot "start.bat"
$WatchBat = Join-Path $RepoRoot "watch.bat"
$StopBat = Join-Path $RepoRoot "stop.bat"
$WatchScript = Join-Path $RepoRoot "scripts\dev\watch-servers.ps1"
$StopServersScript = Join-Path $RepoRoot "scripts\dev\stop-servers.ps1"
$StartFrontendScript = Join-Path $RepoRoot "scripts\dev\start-frontend.ps1"
$StartBackendScript = Join-Path $RepoRoot "scripts\dev\start-backend.ps1"

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
Assert-FileExists $StopServersScript

Assert-ContentNotMatch $StartBat 'cmd\s*/k.*(uvicorn|npm\s+run\s+dev)' "start.bat must not attach server processes to cmd /k."
Assert-ContentMatch $StartBat 'start-backend\.ps1' "start.bat must call start-backend.ps1."
Assert-ContentMatch $StartBat 'start-frontend\.ps1' "start.bat must call start-frontend.ps1."
Assert-ContentMatch $StartBat 'watch\.bat' "start.bat must open or mention watch.bat for reopening the monitor."
Assert-ContentMatch $StartBat 'stop\.bat' "start.bat must mention stop.bat for full shutdown."

Assert-ContentMatch $WatchBat 'watch-servers\.ps1' "watch.bat must open the monitoring script."
Assert-ContentNotMatch $WatchBat 'start-(backend|frontend)|stop-(backend|frontend)|stop-servers|taskkill|Stop-Process' "watch.bat must not start or stop servers."

Assert-ContentMatch $StopBat 'stop-servers\.ps1' "stop.bat must call stop-servers.ps1."
Assert-ContentMatch $StopServersScript 'stop-backend\.ps1' "stop-servers.ps1 must stop the backend."
Assert-ContentMatch $StopServersScript 'stop-frontend\.ps1' "stop-servers.ps1 must stop the frontend."

Assert-ContentMatch $WatchScript 'Get-Content\s+.*-Tail' "watch-servers.ps1 must show recent logs while monitoring."
Assert-ContentNotMatch $WatchScript 'taskkill|Stop-Process|stop-backend|stop-frontend|stop-servers' "watch-servers.ps1 must not stop servers."

Assert-ContentMatch $StartBackendScript 'RedirectStandardOutput' "start-backend.ps1 must redirect backend stdout to a log file."
Assert-ContentMatch $StartBackendScript 'backend-runtime\.json' "start-backend.ps1 must write backend runtime metadata."
Assert-ContentMatch $StartFrontendScript 'RedirectStandardOutput' "start-frontend.ps1 must redirect frontend stdout to a log file."
Assert-ContentMatch $StartFrontendScript 'frontend-runtime\.json' "start-frontend.ps1 must write frontend runtime metadata."

Write-Host "[test] OK - runtime batch files keep servers detached and monitoring separate"
