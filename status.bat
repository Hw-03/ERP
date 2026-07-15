@echo off
setlocal

title DEXCOWIN MES Status
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev\status-servers.ps1"

echo.
pause
endlocal
