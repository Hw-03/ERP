@echo off
rem Thin Windows wrapper. A bare filename resolves under runtime/backups/sqlite.
if "%~1"=="" (
    py "%~dp0restore_db.py" --help
    exit /b 2
)
set "ROOT=%~dp0..\.."
py "%~dp0restore_db.py" --sqlite "%~1" --target "%ROOT%\backend\mes.db" --check
exit /b %ERRORLEVEL%
