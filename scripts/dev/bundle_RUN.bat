@echo off
rem DEXCOWIN MES launcher (space/Korean path safe)
start "MES Backend" "%~dp0_backend.bat"
start "MES Frontend" "%~dp0_frontend.bat"
echo Starting servers... a browser will open in about 15 seconds.
timeout /t 15 /nobreak >nul
start "" "http://localhost:3000/legacy?tab=admin"
