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

Write-Host "==> Playwright E2E (전용 DB mes_e2e.db · 실 mes.db 미접촉)"
Push-Location $FrontendRoot
try {
    npx playwright test
    if ($LASTEXITCODE -ne 0) {
        throw "Playwright E2E failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "E2E verification passed."
