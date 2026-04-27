@echo off
rem ============================================================
rem  ERP DB backup script (WAL safe)
rem  - copies backend\erp.db to backend\_backup\erp_YYYYMMDD_HHMMSS.db
rem  - safe to run while the backend is up (transaction-consistent)
rem
rem  fallback order:
rem    1) sqlite3 CLI ".backup" command (preferred)
rem    2) python sqlite3 backup() API (uses backend's bundled sqlite3 module)
rem    3) WAL checkpoint + copy of db / wal / shm 3 files (last resort)
rem ============================================================
setlocal enabledelayedexpansion

set "ROOT=%~dp0..\.."
set "DB=%ROOT%\backend\erp.db"
set "DEST_DIR=%ROOT%\backend\_backup"

if not exist "%DB%" (
    echo [BACKUP] erp.db not found: %DB%
    exit /b 1
)

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

rem timestamp via PowerShell so the format is locale-independent
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"`) do set "TS=%%i"
set "DEST=%DEST_DIR%\erp_%TS%.db"

rem ----- 1: sqlite3 CLI -----------------------------------------------------
where sqlite3 >nul 2>&1
if not errorlevel 1 (
    sqlite3 "%DB%" ".backup '%DEST%'"
    if not errorlevel 1 (
        echo [BACKUP] OK ^(sqlite3 .backup^)
        echo   from : %DB%
        echo   to   : %DEST%
        endlocal & exit /b 0
    )
    echo [BACKUP] sqlite3 .backup failed - trying python fallback
)

rem ----- 2: Python sqlite3 backup API --------------------------------------
where python >nul 2>&1
if not errorlevel 1 (
    python -c "import sqlite3,sys; src=sqlite3.connect(r'%DB%'); dst=sqlite3.connect(r'%DEST%'); src.backup(dst); dst.close(); src.close()"
    if not errorlevel 1 (
        echo [BACKUP] OK ^(python sqlite3.backup^)
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

echo [BACKUP] OK ^(file copy fallback^)
echo   from : %DB%
echo   to   : %DEST%

endlocal
exit /b 0
