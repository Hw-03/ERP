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

if (-not (Test-Path $BackendDir)) {
    throw "백엔드 경로를 찾을 수 없습니다: $BackendDir"
}

# 1) preflight - clear stale workers for this profile port only.
& $StopScript

# 2) Start py directly without a powershell.exe wrapper.
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

Start-Process -FilePath "py" -ArgumentList $uvicornArgs -WorkingDirectory $BackendDir -WindowStyle Hidden

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
    throw "[start] uvicorn 이 $($Profile.BackendPort) 에서 응답하지 않음 - 좀비/기동실패 점검 필요"
}

Write-Host "[start] OK - $($Profile.Label) backend live on $healthUrl"
