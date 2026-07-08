@echo off
setlocal

title DEXCOWIN MES Stop
echo.
echo [MES] Stopping DEXCOWIN MES servers...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev\stop-servers.ps1"
if errorlevel 1 (
    echo.
    echo [MES] ERROR: server shutdown failed.
    pause
    exit /b 1
)

echo.
echo [MES] Servers stopped.
pause
endlocal
