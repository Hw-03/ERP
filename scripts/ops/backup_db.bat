@echo off
rem ============================================================
rem  DEXCOWIN MES DB backup script (WAL safe)
rem  - writes backend\_backup\mes_YYYYMMDD_HHMMSS.db
rem  - verifies the created backup before reporting success
rem ============================================================
setlocal enabledelayedexpansion

set "ROOT=%~dp0..\.."
set "DB=%ROOT%\backend\mes.db"
set "DEST_DIR=%ROOT%\backend\_backup"
set "VERIFY=%~dp0_verify_backup.py"

if not exist "%DB%" (
    echo [BACKUP] mes.db not found: %DB%
    exit /b 1
)

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"`) do set "TS=%%i"
set "DEST=%DEST_DIR%\mes_%TS%.db"

rem ----- 1: sqlite3 CLI -----------------------------------------------------
where sqlite3 >nul 2>&1
if not errorlevel 1 (
    sqlite3 "%DB%" ".backup '%DEST%'"
    if not errorlevel 1 (
        call :verify_or_fail
        echo [BACKUP] OK ^(sqlite3 .backup + verify^)
        echo   from : %DB%
        echo   to   : %DEST%
        endlocal & exit /b 0
    )
    echo [BACKUP] sqlite3 .backup failed - trying python fallback
)

rem ----- 2: Python sqlite3 backup API --------------------------------------
where python >nul 2>&1
if not errorlevel 1 (
    python -c "import sqlite3; src=sqlite3.connect(r'%DB%'); dst=sqlite3.connect(r'%DEST%'); src.backup(dst); dst.close(); src.close()"
    if not errorlevel 1 (
        call :verify_or_fail
        echo [BACKUP] OK ^(python sqlite3.backup + verify^)
        echo   from : %DB%
        echo   to   : %DEST%
        endlocal & exit /b 0
    )
    echo [BACKUP] python backup failed - trying file copy fallback
)

rem ----- 3: WAL checkpoint + copy 3 files ----------------------------------
where python >nul 2>&1
if not errorlevel 1 (
    python -c "import sqlite3; c=sqlite3.connect(r'%DB%'); c.execute('PRAGMA wal_checkpoint(TRUNCATE)'); c.close()"
)
copy /Y "%DB%" "%DEST%" >nul
if errorlevel 1 (
    echo [BACKUP] copy failed: %DB% -^> %DEST%
    endlocal & exit /b 1
)
if exist "%DB%-wal" copy /Y "%DB%-wal" "%DEST%-wal" >nul
if exist "%DB%-shm" copy /Y "%DB%-shm" "%DEST%-shm" >nul

call :verify_or_fail
echo [BACKUP] OK ^(file copy fallback + verify^)
echo   from : %DB%
echo   to   : %DEST%
endlocal & exit /b 0

:verify_or_fail
python "%VERIFY%" "%DEST%"
if errorlevel 1 (
    echo [BACKUP] verification failed; removing invalid backup: %DEST%
    del "%DEST%" "%DEST%-wal" "%DEST%-shm" "%DEST%-journal" 2>nul
    endlocal & exit /b 1
)
exit /b 0
