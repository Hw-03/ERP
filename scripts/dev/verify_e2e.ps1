# Playwright E2E 검증 — 전용 DB(mes_e2e.db)·전용 백엔드(8021)·전용 프론트(3100).
# globalSetup 이 전용 DB 부트스트랩·시드·백엔드 기동을 자동 처리하고, teardown 이
# 전용 DB 삭제 + 실 backend/mes.db SHA256 불변을 검증한다(실 DB 절대 미접촉).
#
# 사용:
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_e2e.ps1
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = git rev-parse --show-toplevel
$FrontendRoot = Join-Path $RepoRoot "frontend"

function Test-LoopbackPortAvailable {
    param([Parameter(Mandatory = $true)][int] $Port)

    $listener = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Loopback,
        $Port
    )
    try {
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        $listener.Stop()
    }
}

$FrontendPort = 3100
if (-not (Test-LoopbackPortAvailable -Port $FrontendPort)) {
    $FrontendPort = 3300..3399 |
        Where-Object { Test-LoopbackPortAvailable -Port $_ } |
        Select-Object -First 1
    if (-not $FrontendPort) {
        throw "Playwright E2E frontend port unavailable: 3100 and fallback range 3300-3399."
    }
    Write-Host "==> Port 3100 unavailable; using dedicated frontend port $FrontendPort"
}

$nodeVersion = (& node --version 2>$null)
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v20\.') {
    throw "Playwright E2E requires Node.js 20 (current: $nodeVersion)."
}

Write-Host "==> Playwright E2E (전용 DB mes_e2e.db · 실 mes.db 미접촉 · frontend $FrontendPort)"
$PreviousFrontendPort = $env:E2E_FRONTEND_PORT
$env:E2E_FRONTEND_PORT = [string] $FrontendPort
Push-Location $FrontendRoot
try {
    npm run test:e2e
    if ($LASTEXITCODE -ne 0) {
        throw "Playwright E2E failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
    $env:E2E_FRONTEND_PORT = $PreviousFrontendPort
}

Write-Host ""
Write-Host "E2E verification passed."
