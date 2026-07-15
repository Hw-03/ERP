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

$launch = Start-ServiceSupervisor `
    -Profile $Profile `
    -Service "frontend" `
    -Port $Profile.FrontendPort `
    -ServiceDir $FrontendDir `
    -StatePath $StatePath `
    -EventPath $EventPath `
    -ControlPath $ControlPath `
    -StdoutLog $StdoutLog `
    -StderrLog $StderrLog `
    -ChildCommand @("node", "scripts/dev.js") `
    -Environment @{
        MES_RUNTIME_ROOT = $RuntimeRoot
        PORT = [string] $Profile.FrontendPort
        BACKEND_INTERNAL_URL = $Profile.BackendInternalUrl
    }

$healthUrl = "http://127.0.0.1:$($Profile.FrontendPort)/mes"
$ok = $false
for ($attempt = 0; $attempt -lt 90; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
        $response = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) { $ok = $true; break }
    }
    catch {
        # The supervisor may still be starting, compiling, or backing off.
    }
}

if (-not $ok) {
    $state = Get-RuntimeState -Path $StatePath
    throw "[start-frontend] Frontend did not respond on $healthUrl. status=$($state.status). Check $EventPath"
}

$mode = if ($launch.Existing) { "already running" } else { "started" }
Write-Host "[start-frontend] OK - $($Profile.Label) frontend $mode on $healthUrl"
Write-Host "[start-frontend] runtime events: $EventPath"
