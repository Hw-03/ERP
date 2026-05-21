---
type: code-note
project: ERP
layer: scripts
source_path: erp/scripts/ops/restore_db.bat
status: active
updated: 2026-04-27
source_sha: c6ea982a239e
tags:
  - erp
  - scripts
  - ops-script
  - bat
---

# restore_db.bat

> [!summary] 역할
> 운영자가 백업, 복구, 점검, 정합성 확인을 할 때 실행하는 보조 스크립트다.

## 원본 위치

- Source: `scripts/ops/restore_db.bat`
- Layer: `scripts`
- Kind: `ops-script`
- Size: `1726` bytes

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
rem  ERP DB restore (operator must stop the backend first!)
rem  Usage: restore_db.bat <backup-filename>
rem      filename is relative to backend\_backup\
rem  Steps:
rem    1) snapshot the current erp.db as erp_PRE-RESTORE_TS.db
rem    2) integrity_check on the source backup
rem    3) replace erp.db + remove stale wal/shm
rem ============================================================
setlocal

set "ROOT=%~dp0..\.."
set "DB=%ROOT%\backend\erp.db"

if "%~1"=="" (
    echo Usage: restore_db.bat ^<backup-filename^>
    echo Available backups:
    dir /B "%ROOT%\backend\_backup\erp_*.db" 2>nul
    exit /b 2
)

set "SRC=%ROOT%\backend\_backup\%~1"
if not exist "%SRC%" (
    echo [RESTORE] not found: %SRC%
    exit /b 1
)

rem 1) safety snapshot before overwrite
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"`) do set "TS=%%i"
if exist "%DB%" (
    copy /Y "%DB%" "%ROOT%\backend\_backup\erp_PRE-RESTORE_%TS%.db" >nul
    echo [RESTORE] snapshot: erp_PRE-RESTORE_%TS%.db
)

# ... (이하 22줄 생략. 원본 참조)

````
