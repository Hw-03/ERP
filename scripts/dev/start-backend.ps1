# scripts/dev/start-backend.ps1
# Start the backend for the current DEXCOWIN MES root after clearing stale workers.
# C:\ERP     -> backend 8011
# C:\ERP-dev -> backend 8010

param(
    [switch] $NoReload
)

$ErrorActionPreference = "Stop"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
$RepoRoot = $Profile.RepoRoot
$BackendDir = Join-Path $RepoRoot "backend"
$StopScript = Join-Path $RepoRoot "scripts\dev\stop-backend.ps1"
$LogDir = Join-Path $BackendDir "logs"
$StdoutLog = Join-Path $LogDir "backend-dev.out.log"
$StderrLog = Join-Path $LogDir "backend-dev.err.log"
$RuntimeFile = Join-Path $LogDir "backend-runtime.json"

if (-not (Test-Path $BackendDir)) {
    throw "Backend directory not found: $BackendDir"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# 1) preflight - clear stale workers for this profile port only.
& $StopScript

# 2) Start py directly and detach server lifetime from the visible monitor window.
$uvicornArgs = @(
    "-m",
    "uvicorn",
    "app.main:app",
    "--host",
    "0.0.0.0",
    "--port",
    [string] $Profile.BackendPort
)
if (-not $NoReload) {
    $uvicornArgs += "--reload"
}

$proc = Start-Process `
    -FilePath "py" `
    -ArgumentList $uvicornArgs `
    -WorkingDirectory $BackendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdoutLog `
    -RedirectStandardError $StderrLog `
    -PassThru

@{
    profile = $Profile.Label
    repoRoot = $RepoRoot
    service = "backend"
    port = [int] $Profile.BackendPort
    pid = $proc.Id
    startedAt = (Get-Date).ToString("o")
    stdoutLog = $StdoutLog
    stderrLog = $StderrLog
    command = "py $($uvicornArgs -join ' ')"
    cwd = $BackendDir
} | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $RuntimeFile

# 3) /health/live check, max 15 seconds.
$ok = $false
$healthUrl = "http://127.0.0.1:$($Profile.BackendPort)/health/live"
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $ok = $true; break }
    }
    catch {
        # still starting
    }
}

if (-not $ok) {
    throw "[start-backend] Backend did not respond on $healthUrl. Check logs: $StdoutLog / $StderrLog"
}

Write-Host "[start-backend] OK - $($Profile.Label) backend live on $healthUrl"
Write-Host "[start-backend] logs: $StdoutLog / $StderrLog"
