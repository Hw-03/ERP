@echo off
title MES Frontend
cd /d "%~dp0app\frontend"
set "PATH=%~dp0node;%PATH%"
set "BACKEND_INTERNAL_URL=http://127.0.0.1:8010"
echo [MES] Frontend starting on http://localhost:3000
echo [MES] Do not close this window while using the program.
"%~dp0node\npm.cmd" run start
echo.
echo [MES] Frontend stopped. If this closed with an error, copy the text above.
pause
