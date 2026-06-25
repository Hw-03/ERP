@echo off
rem ============================================================
rem  DEXCOWIN MES DB restore (operator must stop the backend first)
rem  Usage: restore_db.bat <backup-filename>
rem      filename is relative to backend\_backup\
rem ============================================================
setlocal

set "ROOT=%~dp0..\.."
set "DB=%ROOT%\backend\mes.db"
set "BACKUP_DIR=%ROOT%\backend\_backup"
set "VERIFY=%~dp0_verify_backup.py"

if "%~1"=="" (
    echo Usage: restore_db.bat ^<backup-filename^>
    echo Available backups:
    dir /B "%BACKUP_DIR%\mes_*.db" 2>nul
    exit /b 2
)

set "SRC=%BACKUP_DIR%\%~1"
if not exist "%SRC%" (
    echo [RESTORE] not found: %SRC%
    exit /b 1
)

python "%VERIFY%" "%SRC%"
if errorlevel 1 (
    echo [RESTORE] source backup verification failed: %SRC%
    exit /b 3
)

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"`) do set "TS=%%i"
if exist "%DB%" (
    copy /Y "%DB%" "%BACKUP_DIR%\mes_PRE-RESTORE_%TS%.db" >nul
    echo [RESTORE] snapshot: mes_PRE-RESTORE_%TS%.db
)

copy /Y "%SRC%" "%DB%" >nul
if errorlevel 1 (
    echo [RESTORE] copy failed
    exit /b 1
)
del "%DB%-wal" "%DB%-shm" 2>nul

echo [RESTORE] OK
echo   restored: %SRC%
echo   to      : %DB%
echo Now start the backend manually.

endlocal
exit /b 0
