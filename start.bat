@echo off
start "Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --reload"
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
