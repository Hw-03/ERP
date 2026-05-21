---
type: code-note
project: ERP
layer: scripts
source_path: erp/scripts/ops/backup_db.bat
status: active
updated: 2026-04-27
source_sha: 54ace48ba0f0
tags:
  - erp
  - scripts
  - ops-script
  - bat
---

# backup_db.bat

> [!summary] 역할
> 운영자가 백업, 복구, 점검, 정합성 확인을 할 때 실행하는 보조 스크립트다.

## 원본 위치

- Source: `scripts/ops/backup_db.bat`
- Layer: `scripts`
- Kind: `ops-script`
- Size: `2558` bytes

## 연결

- Parent hub: [[scripts/ops/ops|scripts/ops]]
- Related: [[scripts/scripts]]

## 읽는 포인트

- 실행 전 대상 DB/파일 경로를 확인한다.
- 운영 스크립트는 백업 여부와 되돌림 절차를 먼저 본다.

## 원본 발췌

````bat
@echo off
rem ============================================================
rem  ERP DB backup script (WAL safe)
rem  - copies backend\erp.db to backend\_backup\erp_YYYYMMDD_HHMMSS.db
rem  - safe to run while the backend is up (transaction-consistent)
rem
rem  fallback order:
rem    1) sqlite3 CLI ".backup" command (preferred)
rem    2) python sqlite3 backup() API (uses backend's bundled sqlite3 module)
rem    3) WAL checkpoint + copy of db / wal / shm 3 files (last resort)
rem ============================================================
setlocal enabledelayedexpansion

set "ROOT=%~dp0..\.."
set "DB=%ROOT%\backend\erp.db"
set "DEST_DIR=%ROOT%\backend\_backup"

if not exist "%DB%" (
    echo [BACKUP] erp.db not found: %DB%
    exit /b 1
)

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

rem timestamp via PowerShell so the format is locale-independent
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"`) do set "TS=%%i"
set "DEST=%DEST_DIR%\erp_%TS%.db"

rem ----- 1: sqlite3 CLI -----------------------------------------------------
where sqlite3 >nul 2>&1
if not errorlevel 1 (
    sqlite3 "%DB%" ".backup '%DEST%'"
    if not errorlevel 1 (
        echo [BACKUP] OK ^(sqlite3 .backup^)
        echo   from : %DB%
# ... (이하 38줄 생략. 원본 참조)

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
