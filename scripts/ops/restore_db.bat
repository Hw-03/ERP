@echo off
rem ============================================================
rem  ERP DB restore (operator must stop the backend first!)
rem  Usage: restore_db.bat <backup-filename>
rem      filename is relative to backend\_backup\
rem  Steps:
rem    1) snapshot the current erp.db as erp_PRE-RESTORE_TS.db
rem    2) integrity_check on the source backup
rem    3) replace erp.db + remove stale wal/shm
rem ============================================================
setlocal

set "ROOT=%~dp0..\.."
set "DB=%ROOT%\backend\erp.db"

if "%~1"=="" (
    echo Usage: restore_db.bat ^<backup-filename^>
    echo Available backups:
    dir /B "%ROOT%\backend\_backup\erp_*.db" 2>nul
    exit /b 2
)

set "SRC=%ROOT%\backend\_backup\%~1"
if not exist "%SRC%" (
    echo [RESTORE] not found: %SRC%
    exit /b 1
)

rem 1) safety snapshot before overwrite
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"`) do set "TS=%%i"
if exist "%DB%" (
    copy /Y "%DB%" "%ROOT%\backend\_backup\erp_PRE-RESTORE_%TS%.db" >nul
    echo [RESTORE] snapshot: erp_PRE-RESTORE_%TS%.db
)

rem 2) integrity check
python -c "import sqlite3,sys; c=sqlite3.connect(r'%SRC%'); r=c.execute('PRAGMA integrity_check').fetchone()[0]; sys.exit(0 if r=='ok' else 3)"
if errorlevel 3 (
    echo [RESTORE] integrity check failed on %SRC%
    exit /b 3
)

rem 3) replace + remove stale wal/shm
copy /Y "%SRC%" "%DB%" >nul
if errorlevel 1 (
    echo [RESTORE] copy failed
    exit /b 1
)
del "%DB%-wal" "%DB%-shm" 2>nul

echo [RESTORE] OK
echo   restored: %SRC%
echo   to     : %DB%
echo Now start the backend manually (start.bat or uvicorn).

endlocal
exit /b 0
