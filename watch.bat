@echo off
setlocal

title DEXCOWIN MES Watch
echo.
echo [MES] Opening server monitor...
echo [MES] This window only shows status and logs. Closing it does not stop the servers.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev\watch-servers.ps1"

echo.
echo [MES] Monitor closed. Servers were not stopped by this window.
pause
endlocal
