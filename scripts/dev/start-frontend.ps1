# scripts/dev/start-frontend.ps1
# Start the Next.js dev server for the current DEXCOWIN MES root.
# C:\ERP     -> frontend 3001, backend 8011
# C:\ERP-dev -> frontend 3000, backend 8010

$ErrorActionPreference = "Stop"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
$FrontendDir = Join-Path $Profile.RepoRoot "frontend"
$StopScript = Join-Path $Profile.RepoRoot "scripts\dev\stop-frontend.ps1"
$LogDir = Join-Path $FrontendDir "logs"
$StdoutLog = Join-Path $LogDir "frontend-dev.out.log"
$StderrLog = Join-Path $LogDir "frontend-dev.err.log"
$RuntimeFile = Join-Path $LogDir "frontend-runtime.json"

if (-not (Test-Path $FrontendDir)) {
    throw "Frontend directory not found: $FrontendDir"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$env:PORT = [string] $Profile.FrontendPort
$env:BACKEND_INTERNAL_URL = $Profile.BackendInternalUrl

Write-Host "[start-frontend] profile=$($Profile.Label) root=$($Profile.RepoRoot)"
Write-Host "[start-frontend] frontend=http://127.0.0.1:$($Profile.FrontendPort) backend=$($Profile.BackendInternalUrl)"

& $StopScript

$nodeArgs = @("scripts/dev.js")
$proc = Start-Process `
    -FilePath "node" `
    -ArgumentList $nodeArgs `
    -WorkingDirectory $FrontendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdoutLog `
    -RedirectStandardError $StderrLog `
    -PassThru

@{
    profile = $Profile.Label
    repoRoot = $Profile.RepoRoot
    service = "frontend"
    port = [int] $Profile.FrontendPort
    pid = $proc.Id
    startedAt = (Get-Date).ToString("o")
    stdoutLog = $StdoutLog
    stderrLog = $StderrLog
    command = "node $($nodeArgs -join ' ')"
    cwd = $FrontendDir
    backendInternalUrl = $Profile.BackendInternalUrl
} | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $RuntimeFile

$ok = $false
$healthUrl = "http://127.0.0.1:$($Profile.FrontendPort)/mes"
for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $ok = $true; break }
    }
    catch {
        # still starting or compiling
    }
}

if (-not $ok) {
    throw "[start-frontend] Frontend did not respond on $healthUrl. Check logs: $StdoutLog / $StderrLog"
}

Write-Host "[start-frontend] OK - $($Profile.Label) frontend live on $healthUrl"
Write-Host "[start-frontend] logs: $StdoutLog / $StderrLog"
