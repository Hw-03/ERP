@echo off
rem ============================================================
rem  ERP 헬스체크 스크립트
rem  - http://127.0.0.1:8010/health/detailed 를 호출하여 상태를 출력
rem  - inventory mismatch / open queue / DB 행 수 확인용
rem ============================================================
setlocal

set "URL=http://127.0.0.1:8010/health/detailed"

echo [HEALTH] %URL%
echo.

curl -s -m 5 "%URL%"
set "RC=%ERRORLEVEL%"
echo.

if not "%RC%"=="0" (
    echo.
    echo [HEALTH] 호출 실패: 백엔드가 8010 포트에서 떠 있는지 확인하세요.
    exit /b 1
)

echo [HEALTH] OK
endlocal
