---
type: code-note
project: ERP
layer: scripts
source_path: scripts/ops/cleanup_backups.bat
status: active
updated: 2026-04-27
source_sha: dd82a3cafc52
tags:
  - erp
  - scripts
  - ops-script
  - bat
---

# cleanup_backups.bat

> [!summary] 역할
> 운영자가 백업, 복구, 점검, 정합성 확인을 할 때 실행하는 보조 스크립트다.

## 원본 위치

- Source: `scripts/ops/cleanup_backups.bat`
- Layer: `scripts`
- Kind: `ops-script`
- Size: `764` bytes

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
rem  Delete backup files older than N days (default: 30).
rem  Usage: cleanup_backups.bat [days]
rem ============================================================
setlocal

set "ROOT=%~dp0..\.."
set "DAYS=%~1"
if "%DAYS%"=="" set "DAYS=30"

echo [CLEANUP] removing backups older than %DAYS% days from %ROOT%\backend\_backup\

powershell -NoProfile -Command "$cut=(Get-Date).AddDays(-%DAYS%); $files=Get-ChildItem '%ROOT%\backend\_backup\erp_*.db' | Where-Object { $_.LastWriteTime -lt $cut }; if ($files) { $files | ForEach-Object { Write-Output ('  removed: ' + $_.Name); Remove-Item $_.FullName -Force } } else { Write-Output '  nothing to remove' }"

endlocal
exit /b 0
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
