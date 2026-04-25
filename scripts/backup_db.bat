@echo off
rem ============================================================
rem  ERP DB 백업 스크립트
rem  - backend\erp.db 를 backend\_backup\erp_YYYYMMDD_HHMMSS.db 로 복사
rem  - 백엔드가 실행 중이어도 SQLite WAL 모드라 보통 안전하게 복사됨
rem  - 외부 백업이 필요하면 _backup 폴더를 통째로 복사할 것
rem ============================================================
setlocal

set "ROOT=%~dp0.."
set "DB=%ROOT%\backend\erp.db"
set "DEST_DIR=%ROOT%\backend\_backup"

if not exist "%DB%" (
    echo [BACKUP] erp.db 를 찾을 수 없습니다: %DB%
    exit /b 1
)

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

rem YYYYMMDD_HHMMSS 타임스탬프 — locale 의존 없이 PowerShell 사용
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"`) do set "TS=%%i"

set "DEST=%DEST_DIR%\erp_%TS%.db"

copy /Y "%DB%" "%DEST%" >nul
if errorlevel 1 (
    echo [BACKUP] 복사 실패: %DB% -^> %DEST%
    exit /b 1
)

echo [BACKUP] OK
echo   from : %DB%
echo   to   : %DEST%

endlocal
