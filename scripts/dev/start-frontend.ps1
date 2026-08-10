# Start or recover the supervised DEXCOWIN MES frontend for this repo profile.

$ErrorActionPreference = "Stop"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
. (Join-Path $PSScriptRoot "runtime-paths.ps1")
. (Join-Path $PSScriptRoot "runtime-control.ps1")

$FrontendDir = Join-Path $Profile.RepoRoot "frontend"
$RuntimeRoot = Get-MesRuntimeRoot -RepoRoot $Profile.RepoRoot
$LogDir = Get-MesRuntimePath -RepoRoot $Profile.RepoRoot -RelativePath "logs\frontend" -CreateDirectory
$StatePath = Join-Path $LogDir "frontend-runtime.json"
$EventPath = Join-Path $LogDir "frontend-runtime-events.jsonl"
$ControlPath = Join-Path $LogDir "frontend-runtime-control.json"
$StdoutLog = Join-Path $LogDir "frontend-dev.out.log"
$StderrLog = Join-Path $LogDir "frontend-dev.err.log"

if (-not (Test-Path $FrontendDir)) {
    throw "Frontend directory not found: $FrontendDir"
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startup = Invoke-ProfileFrontendStartup `
    -Profile $Profile `
    -FrontendDir $FrontendDir `
    -RuntimeRoot $RuntimeRoot `
    -StatePath $StatePath `
    -EventPath $EventPath `
    -ControlPath $ControlPath `
    -StdoutLog $StdoutLog `
    -StderrLog $StderrLog
$launch = $startup.Launch
$healthUrl = $startup.HealthUrl

$mode = if ($launch.Existing) { "already running" } else { "started" }
Write-Host "[start-frontend] OK - $($Profile.Label) frontend $mode on $healthUrl"
Write-Host "[start-frontend] runtime events: $EventPath"
