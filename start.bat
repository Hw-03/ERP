@echo off
start "Backend" cmd /k "cd /d "%~dp0backend" && py -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload"
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev -- --hostname 0.0.0.0 --port 3000"
timeout /t 5 /nobreak >nul
start "" "http://192.168.0.63:3000"
