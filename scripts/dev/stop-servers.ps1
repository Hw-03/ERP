# scripts/dev/stop-servers.ps1
# Stop both DEXCOWIN MES runtime servers for the current repo profile.

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$BackendStop = Join-Path $RepoRoot "scripts\dev\stop-backend.ps1"
$FrontendStop = Join-Path $RepoRoot "scripts\dev\stop-frontend.ps1"

Write-Host "[stop-servers] stopping backend..."
& $BackendStop

Write-Host "[stop-servers] stopping frontend..."
& $FrontendStop

Write-Host "[stop-servers] OK - backend and frontend stopped"
