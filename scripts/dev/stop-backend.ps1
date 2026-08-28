# Stop the supervised DEXCOWIN MES backend for this repo profile.

$ErrorActionPreference = "Stop"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
. (Join-Path $PSScriptRoot "runtime-paths.ps1")
. (Join-Path $PSScriptRoot "runtime-control.ps1")
. (Join-Path $PSScriptRoot "runtime-task-control.ps1")

$LogDir = Get-MesRuntimePath -RepoRoot $Profile.RepoRoot -RelativePath "logs\backend" -CreateDirectory
$StatePath = Join-Path $LogDir "backend-runtime.json"
$EventPath = Join-Path $LogDir "backend-runtime-events.jsonl"
$ControlPath = Join-Path $LogDir "backend-runtime-control.json"
$LaunchRequestPath = Join-Path $LogDir "backend-runtime-launch-request.json"

Stop-SupervisedService `
    -Profile $Profile `
    -Service "backend" `
    -Port $Profile.BackendPort `
    -StatePath $StatePath `
    -EventPath $EventPath `
    -ControlPath $ControlPath `
    -Source "stop-backend.ps1"

Stop-RuntimeScheduledTask `
    -RepoRoot $Profile.RepoRoot `
    -Service "backend" `
    -LaunchRequestPath $LaunchRequestPath

Write-Host "[stop-backend] OK - $($Profile.Label) port $($Profile.BackendPort) free"
