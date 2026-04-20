@echo off
start "Backend" cmd /k "cd /d "%~dp0backend" && py -m uvicorn app.main:app --reload"
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"