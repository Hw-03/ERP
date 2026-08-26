@echo off
setlocal
set "ROOT=%~dp0..\.."
set "LOG_DIR=%ROOT%\_attic\runtime\logs\ops"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1
if errorlevel 1 exit /b 1

if /I "%~1"=="--help" (
    py "%~dp0backup_to_nas.py" %*
    exit /b %ERRORLEVEL%
)

py "%~dp0backup_to_nas.py" %* >> "%LOG_DIR%\backup-to-nas.log" 2>&1
exit /b %ERRORLEVEL%
