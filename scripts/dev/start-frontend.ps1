# scripts/dev/start-frontend.ps1
# dev 전용 — 포트 3001, 백엔드 8011
# 탭 제목("MES 개발")은 frontend/.env.local 의 NEXT_PUBLIC_MES_ENV=dev 로 제어.
# (한글은 UTF-8 소스에만 두고 셸 환경변수로 전달하지 않음 — CP949 깨짐 방지)

$env:PORT                 = "3001"
$env:BACKEND_INTERNAL_URL = "http://localhost:8011"

Set-Location "C:\ERP\frontend"
npm run dev
