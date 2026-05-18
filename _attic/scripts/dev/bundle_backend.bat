@echo off
title MES Backend
cd /d "%~dp0app\backend"
set "PATH=%~dp0python;%~dp0python\Scripts;%PATH%"
echo [MES] Backend starting on http://127.0.0.1:8010
echo [MES] Do not close this window while using the program.
"%~dp0python\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8010
echo.
echo [MES] Backend stopped. If this closed with an error, copy the text above.
pause
