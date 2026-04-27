---
type: code-note
project: ERP
layer: scripts
source_path: scripts/ops/reconcile_inventory.bat
status: active
updated: 2026-04-27
source_sha: e470a3a9606a
tags:
  - erp
  - scripts
  - ops-script
  - bat
---

# reconcile_inventory.bat

> [!summary] 역할
> 운영자가 백업, 복구, 점검, 정합성 확인을 할 때 실행하는 보조 스크립트다.

## 원본 위치

- Source: `scripts/ops/reconcile_inventory.bat`
- Layer: `scripts`
- Kind: `ops-script`
- Size: `2073` bytes

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
rem  ERP 재고 정합성 1차 진단 스크립트 (Phase 4)
rem  - /health/detailed 호출 → inventory_mismatch_count 확인
rem  - 0 이면 정상 종료
rem  - > 0 이면 backup_db.bat 호출 후 운영 담당자에게 보고하도록 안내
rem
rem  실제 정합성 복구는 별도 절차(서비스 레이어 수동 호출 또는 SQL).
rem  이 스크립트는 "발견 + 백업 + 보고"만 자동화한다.
rem ============================================================
setlocal
set "URL=http://127.0.0.1:8010/health/detailed"
set "OUT=%TEMP%\erp_health_%RANDOM%.json"

echo [RECONCILE] /health/detailed 호출 중...
curl -s -m 8 "%URL%" -o "%OUT%"
if not "%ERRORLEVEL%"=="0" (
    echo [RECONCILE] 백엔드 호출 실패. 백엔드가 8010 포트에서 떠 있는지 확인하세요.
    if exist "%OUT%" del "%OUT%"
    exit /b 1
)

rem mismatch_count 추출 (PowerShell 1줄 사용 — 외부 종속성 없음)
for /f %%V in ('powershell -NoProfile -Command "(Get-Content '%OUT%' -Raw | ConvertFrom-Json).inventory_mismatch_count"') do set "MISMATCH=%%V"

echo [RECONCILE] inventory_mismatch_count = %MISMATCH%

if "%MISMATCH%"=="0" (
    echo [RECONCILE] OK — 정합성 위반 없음
    del "%OUT%"
    exit /b 0
)

echo.
echo [RECONCILE] 정합성 위반 발견. DB 백업을 먼저 수행합니다...
echo.

call "%~dp0backup_db.bat"
if not "%ERRORLEVEL%"=="0" (
    echo [RECONCILE] 백업 실패 — 운영 담당자에게 즉시 보고하세요.
    del "%OUT%"
    exit /b 2
)

echo.
echo ============================================================
echo  [RECONCILE] 다음 단계
echo  1. 위 백업 파일을 안전한 위치에 보관
echo  2. /health/detailed 응답 전체를 운영 담당자에게 전달:
type "%OUT%"
echo.
echo  3. 수정 작업은 별도 절차(개발자 수동) — 자동 수정 안 함.
echo ============================================================

del "%OUT%"
endlocal
exit /b 0
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
