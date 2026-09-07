# _attic/scripts/prod/deploy.ps1
# [HISTORICAL — 실행 금지] 과거 직원 환경 배포 스크립트 보존본이다.
# 현재 배포·검증 경로가 아니며 parser-only 격리 검증 외에는 실행하지 않는다.
# C:\ERP-dev(직원용)에 최신 main 브랜치 반영.
# sparse-checkout 설정으로 backend/frontend/scripts 만 pull됨.
# 대부분의 변경은 hot-reload로 자동 반영됨.
# 재시작이 필요한 경우: -Restart 플래그 추가.

param([switch] $Restart)

$ProdDir = "C:\ERP-dev"

Write-Host "[deploy] git pull..."
Set-Location $ProdDir
git pull
Write-Host "[deploy] 완료 (hot-reload 자동 적용)"

if ($Restart) {
    Write-Host "[deploy] 서버 재시작..."
    powershell -ExecutionPolicy Bypass -File "$ProdDir\scripts\dev\stop-backend.ps1"
    powershell -ExecutionPolicy Bypass -File "$ProdDir\scripts\dev\start-backend.ps1"
    Write-Host "[deploy] 백엔드 재시작 완료. 프론트는 새 창에서 npm run dev 실행 필요."
}
