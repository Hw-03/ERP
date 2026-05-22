# scripts/dev/start-backend.ps1
# preflight stop → uvicorn 시작 → /health/live 헬스 확인.
# 좀비가 있던 자리도 무조건 정리 후 띄우므로 "백엔드 로그 0줄" 패턴 차단.
#
# 사용법:
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev\start-backend.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev\start-backend.ps1 -NoReload

param(
    [switch] $NoReload
)

$ErrorActionPreference = "Stop"

$RepoRoot   = git rev-parse --show-toplevel
$BackendDir = Join-Path $RepoRoot "backend"
$StopScript = Join-Path $RepoRoot "scripts\dev\stop-backend.ps1"

# 1) preflight - 좀비 정리
& $StopScript

# 2) 새 PowerShell 창에서 uvicorn 시작
$reloadFlag = if ($NoReload) { "" } else { "--reload" }
$uvicornCmd = "py -m uvicorn app.main:app --host 0.0.0.0 --port 8010 $reloadFlag"

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$BackendDir'; $uvicornCmd"
)

# 3) /health/live 헬스 체크 (최대 15초)
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8010/health/live" `
            -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $ok = $true; break }
    }
    catch {
        # 아직 기동 중 — 무시
    }
}

if (-not $ok) {
    throw "[start] uvicorn 이 8010 에서 응답하지 않음 - 좀비/기동실패 점검 필요"
}

Write-Host "[start] OK - backend live on http://127.0.0.1:8010"
