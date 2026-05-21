---
type: code-note
project: ERP
layer: root
source_path: erp/start.bat
status: active
updated: 2026-04-27
source_sha: 7206a93e62d6
tags:
  - erp
  - root
  - launcher
  - bat
---

# start.bat

> [!summary] 역할
> Windows 환경에서 ERP 서버와 프론트엔드를 실행하기 위한 시작 스크립트다.

## 원본 위치

- Source: `start.bat`
- Layer: `root`
- Kind: `launcher`
- Size: `2615` bytes

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````bat
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

# ... (이하 32줄 생략. 원본 참조)

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
