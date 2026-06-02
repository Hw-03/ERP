@echo off
setlocal

rem ====== Prerequisites: Python + Node.js ======
set "MISSING_PY=0"
set "MISSING_NODE=0"
where py >nul 2>&1
if errorlevel 1 set "MISSING_PY=1"
where node >nul 2>&1
if errorlevel 1 set "MISSING_NODE=1"
if "%MISSING_PY%%MISSING_NODE%"=="00" goto :prereq_ok

echo.
echo ================================================================
echo  [MES] 필수 프로그램이 설치되어 있지 않습니다
echo ================================================================
if "%MISSING_PY%"=="1"   echo   [ ] Python 3.13+    ^(미설치^)
if "%MISSING_PY%"=="0"   echo   [O] Python          ^(설치됨^)
if "%MISSING_NODE%"=="1" echo   [ ] Node.js LTS     ^(미설치^)
if "%MISSING_NODE%"=="0" echo   [O] Node.js         ^(설치됨^)
echo.
echo ----------------------------------------------------------------
echo  [수동 설치 - 권장]
echo    Python : https://www.python.org/downloads/
echo             ^(설치 화면에서 "Add python.exe to PATH" 반드시 체크^)
echo    Node.js: https://nodejs.org/  ^(LTS 버전 다운로드^)
echo.
echo  [자동 설치] Windows 10/11 + winget + 관리자 권한 필요
echo ----------------------------------------------------------------
echo.
set "USE_WINGET=N"
set /p USE_WINGET="자동 설치를 시도할까요? (Y/N, 기본 N): "
if /i not "%USE_WINGET%"=="Y" goto :prereq_exit

where winget >nul 2>&1
if errorlevel 1 (
    echo.
    echo [MES] winget 을 찾을 수 없습니다. 위 링크로 수동 설치 후 다시 실행하세요.
    goto :prereq_exit
)

if "%MISSING_PY%"=="1" (
    echo.
    echo [MES] Python 3.13 설치 중... ^(UAC 창이 뜨면 "예" 클릭^)
    winget install -e --id Python.Python.3.13 --accept-source-agreements --accept-package-agreements --override "/quiet PrependPath=1"
)
if "%MISSING_NODE%"=="1" (
    echo.
    echo [MES] Node.js LTS 설치 중... ^(UAC 창이 뜨면 "예" 클릭^)
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
)

echo.
echo ================================================================
echo  설치 완료. 변경된 PATH 를 반영하려면
echo  이 cmd 창을 닫고 새 cmd 창에서 start.bat 를 다시 실행하세요.
echo ================================================================
pause
exit /b 0

:prereq_exit
echo.
echo 설치 완료 후 새 cmd 창에서 start.bat 를 다시 실행해 주세요.
pause
exit /b 1

:prereq_ok

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
    echo [MES] Installing frontend dependencies ^(npm install^)...
    call npm install
)
popd

pushd "%~dp0backend"
if exist "requirements.txt" (
    py -c "import fastapi, uvicorn, sqlalchemy, psycopg2, alembic, dotenv, pydantic, openpyxl" >nul 2>&1
    if errorlevel 1 (
        echo [MES] Installing backend dependencies ^(first run only, may take a few minutes^)...
        py -m pip install -r requirements.txt
        if errorlevel 1 (
            echo.
            echo [MES] WARNING: backend pip install failed.
            echo [MES] If you see a psycopg2 build error, your Python version may be too new.
            echo [MES] Recommended: install Python 3.13 from https://www.python.org/downloads/
            echo.
        )
    )
)
popd

rem ====== Ensure DB schema is up to date (Phase 5.4-B) ======
rem main.py 의 Base.metadata.create_all 부작용을 제거했으므로,
rem 신규 모델/컬럼 추가 시 idempotent 하게 반영하기 위해 schema + migrate 둘 다 실행.
pushd "%~dp0backend"
echo [MES] Ensuring DB schema is up to date...
py bootstrap_db.py --schema --migrate --seed
if errorlevel 1 (
    echo [MES] ERROR: bootstrap_db.py --schema --migrate --seed failed. Aborting.
    popd
    pause
    exit /b 1
)
popd

rem ====== Auto-detect current LAN IPv4 (active adapter with default gateway) ======
powershell -NoProfile -Command "$c = Get-NetIPConfiguration; $t = $c | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1; if ($t) { $t.IPv4Address.IPAddress }" > "%TEMP%\mes_ip.txt" 2>nul
set /p IP=<"%TEMP%\mes_ip.txt"
del "%TEMP%\mes_ip.txt" >nul 2>&1

if not defined IP set "IP=127.0.0.1"

echo.
echo [MES] Detected IP: %IP%
echo [MES] URL: http://%IP%:3000
echo.

rem preflight - 포트 8010 좀비 정리 (워커 고아화 재발 방지)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev\stop-backend.ps1"
start "Backend" cmd /k "cd /d "%~dp0backend" && py -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload"
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 5 /nobreak >nul
start "" "http://%IP%:3000"

endlocal
