# scripts/prod/deploy.ps1
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
