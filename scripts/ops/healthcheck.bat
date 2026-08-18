@echo off
rem ============================================================
rem  MES 헬스체크 스크립트
rem  - inventory mismatch / open queue / DB 행 수 확인용
rem ============================================================
setlocal

set "BACKEND_URL="
for /f "usebackq delims=" %%U in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\dev\resolve-server-profile.ps1" -Property BackendInternalUrl`) do set "BACKEND_URL=%%U"
if not defined BACKEND_URL (
    echo [HEALTH] ERROR: server profile did not provide a backend URL.
    exit /b 1
)
set "URL=%BACKEND_URL%/health/detailed"

echo [HEALTH] %URL%
echo.

curl -f -s -m 5 "%URL%"
set "RC=%ERRORLEVEL%"
echo.

if not "%RC%"=="0" (
    echo.
    echo [HEALTH] ERROR: request failed or returned an HTTP error.
    exit /b 1
)

echo [HEALTH] OK
endlocal
