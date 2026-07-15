# Stop the supervised DEXCOWIN MES frontend for this repo profile.

$ErrorActionPreference = "Stop"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
. (Join-Path $PSScriptRoot "runtime-paths.ps1")
. (Join-Path $PSScriptRoot "runtime-control.ps1")

$LogDir = Get-MesRuntimePath -RepoRoot $Profile.RepoRoot -RelativePath "logs\frontend" -CreateDirectory
$StatePath = Join-Path $LogDir "frontend-runtime.json"
$EventPath = Join-Path $LogDir "frontend-runtime-events.jsonl"
$ControlPath = Join-Path $LogDir "frontend-runtime-control.json"

Stop-SupervisedService `
    -Profile $Profile `
    -Service "frontend" `
    -Port $Profile.FrontendPort `
    -StatePath $StatePath `
    -EventPath $EventPath `
    -ControlPath $ControlPath `
    -Source "stop-frontend.ps1"

Write-Host "[stop-frontend] OK - $($Profile.Label) port $($Profile.FrontendPort) free"
