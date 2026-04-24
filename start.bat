@echo off
setlocal

rem ====== Install dependencies on first run / after pulls ======
pushd "%~dp0frontend"
set "NEED_NPM_INSTALL=0"
if not exist "node_modules" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\.package-lock.json" set "NEED_NPM_INSTALL=1"
if "%NEED_NPM_INSTALL%"=="0" (
    powershell -NoProfile -Command "if ((Test-Path 'package-lock.json') -and ((Get-Item 'package-lock.json').LastWriteTime -gt (Get-Item 'node_modules\.package-lock.json').LastWriteTime)) { exit 1 } else { exit 0 }"
    if errorlevel 1 set "NEED_NPM_INSTALL=1"
)
if "%NEED_NPM_INSTALL%"=="1" (
    echo [ERP] Installing frontend dependencies ^(npm install^)...
    call npm install
)
popd

pushd "%~dp0backend"
if exist "requirements.txt" (
    py -c "import fastapi, uvicorn, sqlalchemy, psycopg2, alembic, dotenv, pydantic, openpyxl" >nul 2>&1
    if errorlevel 1 (
        echo [ERP] Installing backend dependencies ^(first run only, may take a few minutes^)...
        py -m pip install -r requirements.txt
        if errorlevel 1 (
            echo.
            echo [ERP] WARNING: backend pip install failed.
            echo [ERP] If you see a psycopg2 build error, your Python version may be too new.
            echo [ERP] Recommended: install Python 3.13 from https://www.python.org/downloads/
            echo.
        )
    )
)
popd

rem ====== Auto-detect current LAN IPv4 (active adapter with default gateway) ======
powershell -NoProfile -Command "$c = Get-NetIPConfiguration; $t = $c | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1; if ($t) { $t.IPv4Address.IPAddress }" > "%TEMP%\erp_ip.txt" 2>nul
set /p IP=<"%TEMP%\erp_ip.txt"
del "%TEMP%\erp_ip.txt" >nul 2>&1

if not defined IP set "IP=127.0.0.1"

echo.
echo [ERP] Detected IP: %IP%
echo [ERP] URL: http://%IP%:3000
echo.

start "Backend" cmd /k "cd /d "%~dp0backend" && py -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload"
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev -- --hostname 0.0.0.0 --port 3000"
timeout /t 5 /nobreak >nul
start "" "http://%IP%:3000"

endlocal
