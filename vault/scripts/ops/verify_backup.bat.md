---
type: code-note
project: ERP
layer: scripts
source_path: scripts/ops/verify_backup.bat
status: active
updated: 2026-04-27
source_sha: df9fb91ebaa6
tags:
  - erp
  - scripts
  - ops-script
  - bat
---

# verify_backup.bat

> [!summary] 역할
> 운영자가 백업, 복구, 점검, 정합성 확인을 할 때 실행하는 보조 스크립트다.

## 원본 위치

- Source: `scripts/ops/verify_backup.bat`
- Layer: `scripts`
- Kind: `ops-script`
- Size: `901` bytes

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
rem  Verify the most recent backup file:
rem    - PRAGMA integrity_check
rem    - row counts (items / inventory / transaction_logs / bom / admin_audit_logs)
rem  Excludes erp_PRE-RESTORE_* files from "most recent" lookup.
rem ============================================================
setlocal

set "ROOT=%~dp0..\.."

for /f "usebackq delims=" %%f in (`powershell -NoProfile -Command "(Get-ChildItem '%ROOT%\backend\_backup\erp_*.db' | Where-Object { $_.Name -notlike '*PRE-RESTORE*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName"`) do set "LATEST=%%f"

if not defined LATEST (
    echo [VERIFY] no backup found in %ROOT%\backend\_backup\
    exit /b 1
)

echo [VERIFY] latest backup: %LATEST%

python "%~dp0_verify_backup.py" "%LATEST%"

endlocal
exit /b %ERRORLEVEL%
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
