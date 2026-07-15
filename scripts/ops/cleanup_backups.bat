@echo off
set "KEEP=%~1"
if "%KEEP%"=="" set "KEEP=10"
py "%~dp0cleanup_backups.py" --keep "%KEEP%"
exit /b %ERRORLEVEL%
