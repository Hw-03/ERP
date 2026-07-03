# scripts/dev/start-frontend.ps1
# Start the Next.js dev server for the current DEXCOWIN MES root.
# C:\ERP     -> frontend 3001, backend 8011
# C:\ERP-dev -> frontend 3000, backend 8010

$ErrorActionPreference = "Stop"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
$FrontendDir = Join-Path $Profile.RepoRoot "frontend"

if (-not (Test-Path $FrontendDir)) {
    throw "프론트엔드 경로를 찾을 수 없습니다: $FrontendDir"
}

$env:PORT = [string] $Profile.FrontendPort
$env:BACKEND_INTERNAL_URL = $Profile.BackendInternalUrl

Write-Host "[start-frontend] profile=$($Profile.Label) root=$($Profile.RepoRoot)"
Write-Host "[start-frontend] frontend=http://127.0.0.1:$($Profile.FrontendPort) backend=$($Profile.BackendInternalUrl)"

Set-Location $FrontendDir
npm run dev
