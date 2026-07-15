# Start or recover the supervised DEXCOWIN MES backend for this repo profile.

param([switch] $NoReload)

$ErrorActionPreference = "Stop"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
. (Join-Path $PSScriptRoot "runtime-control.ps1")

$BackendDir = Join-Path $Profile.RepoRoot "backend"
$LogDir = Join-Path $BackendDir "logs"
$StatePath = Join-Path $LogDir "backend-runtime.json"
$EventPath = Join-Path $LogDir "backend-runtime-events.jsonl"
$ControlPath = Join-Path $LogDir "backend-runtime-control.json"
$StdoutLog = Join-Path $LogDir "backend-dev.out.log"
$StderrLog = Join-Path $LogDir "backend-dev.err.log"

if (-not (Test-Path $BackendDir)) {
    throw "Backend directory not found: $BackendDir"
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$childCommand = @(
    "py", "-m", "uvicorn", "app.main:app",
    "--host", "0.0.0.0",
    "--port", [string] $Profile.BackendPort
)
if (-not $NoReload) { $childCommand += "--reload" }

$launch = Start-ServiceSupervisor `
    -Profile $Profile `
    -Service "backend" `
    -Port $Profile.BackendPort `
    -ServiceDir $BackendDir `
    -StatePath $StatePath `
    -EventPath $EventPath `
    -ControlPath $ControlPath `
    -StdoutLog $StdoutLog `
    -StderrLog $StderrLog `
    -ChildCommand $childCommand

$healthUrl = "http://127.0.0.1:$($Profile.BackendPort)/health/live"
$ok = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
        $response = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) { $ok = $true; break }
    }
    catch {
        # The supervisor may still be starting or backing off after a failure.
    }
}

if (-not $ok) {
    $state = Get-RuntimeState -Path $StatePath
    throw "[start-backend] Backend did not respond on $healthUrl. status=$($state.status). Check $EventPath"
}

$mode = if ($launch.Existing) { "already running" } else { "started" }
Write-Host "[start-backend] OK - $($Profile.Label) backend $mode on $healthUrl"
Write-Host "[start-backend] runtime events: $EventPath"
