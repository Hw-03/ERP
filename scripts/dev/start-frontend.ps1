# scripts/dev/start-frontend.ps1
# dev 전용 — 포트 3001, 백엔드 8011

$env:PORT                 = "3001"
$env:BACKEND_INTERNAL_URL = "http://localhost:8011"
$env:NEXT_PUBLIC_APP_TITLE = "MES 개발"

Set-Location "C:\ERP\frontend"
npm run dev
