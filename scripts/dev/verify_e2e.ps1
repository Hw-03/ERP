# Playwright E2E 검증 — 전용 DB(mes_e2e.db)·전용 백엔드(8021/8022)·전용 프론트(3100/3300).
# globalSetup 이 전용 DB 부트스트랩·시드·백엔드 기동을 자동 처리하고, teardown 이
# 전용 DB 삭제 + 실 backend/mes.db/-wal/-shm 불변을 검증한다(실 DB 절대 미접촉).
#
# 사용:
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_e2e.ps1
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = git rev-parse --show-toplevel
$FrontendRoot = Join-Path $RepoRoot "frontend"
$ExclusiveBindProbe = Join-Path $RepoRoot "scripts/dev/e2e-exclusive-bind-probe.ps1"

function Test-LoopbackPortAvailable {
    param([Parameter(Mandatory = $true)][int] $Port)

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connectTask = $client.ConnectAsync([System.Net.IPAddress]::Loopback, $Port)
        if ($connectTask.Wait(500) -and $client.Connected) {
            return $false
        }
    }
    catch {
        # Connection refusal is expected for a free port; the exclusive bind below is authoritative.
    }
    finally {
        $client.Dispose()
    }

    return (& $ExclusiveBindProbe -Port $Port) -eq "AVAILABLE"
}

$BackendPort = 8021
if (-not (Test-LoopbackPortAvailable -Port $BackendPort)) {
    $BackendPort = 8022
    if (-not (Test-LoopbackPortAvailable -Port $BackendPort)) {
        throw "Playwright E2E backend ports unavailable: 8021 and fallback 8022."
    }
    Write-Host "==> Port 8021 unavailable; using dedicated backend port $BackendPort"
}

$FrontendPort = 3100
if (-not (Test-LoopbackPortAvailable -Port $FrontendPort)) {
    $FrontendPort = 3300
    if (-not (Test-LoopbackPortAvailable -Port $FrontendPort)) {
        throw "Playwright E2E frontend ports unavailable: 3100 and fallback 3300."
    }
    Write-Host "==> Port 3100 unavailable; using dedicated frontend port $FrontendPort"
}

$nodeVersion = (& node --version 2>$null)
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v20\.') {
    throw "Playwright E2E requires Node.js 20 (current: $nodeVersion)."
}

Write-Host "==> Playwright E2E (전용 DB mes_e2e.db · 실 mes.db 미접촉 · backend $BackendPort · frontend $FrontendPort)"
$PreviousBackendPort = $env:E2E_BACKEND_PORT
$PreviousFrontendPort = $env:E2E_FRONTEND_PORT
$PreviousBaseUrl = $env:E2E_BASE_URL
$env:E2E_BACKEND_PORT = [string] $BackendPort
$env:E2E_FRONTEND_PORT = [string] $FrontendPort
$env:E2E_BASE_URL = "http://127.0.0.1:$FrontendPort"
Push-Location $FrontendRoot
try {
    npm run test:e2e
    if ($LASTEXITCODE -ne 0) {
        throw "Playwright E2E failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
    $env:E2E_BACKEND_PORT = $PreviousBackendPort
    $env:E2E_FRONTEND_PORT = $PreviousFrontendPort
    $env:E2E_BASE_URL = $PreviousBaseUrl
}

Write-Host ""
Write-Host "E2E verification passed."
