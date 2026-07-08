@echo off
setlocal

title DEXCOWIN MES Watch
echo.
echo [MES] Opening server monitor...
echo [MES] Backend and Frontend will open as split monitor panes.
echo [MES] Closing monitor panes does not stop the servers.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev\open-watch.ps1"
if errorlevel 1 (
    echo.
    echo [MES] ERROR: failed to open the monitor.
    pause
    exit /b 1
)

echo.
echo [MES] Monitor opened. Servers are still independent from this window.
endlocal
