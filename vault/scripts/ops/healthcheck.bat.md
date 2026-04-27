---
type: code-note
project: ERP
layer: scripts
source_path: scripts/ops/healthcheck.bat
status: active
updated: 2026-04-27
source_sha: ba6e03435330
tags:
  - erp
  - scripts
  - ops-script
  - bat
---

# healthcheck.bat

> [!summary] 역할
> 운영자가 백업, 복구, 점검, 정합성 확인을 할 때 실행하는 보조 스크립트다.

## 원본 위치

- Source: `scripts/ops/healthcheck.bat`
- Layer: `scripts`
- Kind: `ops-script`
- Size: `646` bytes

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
rem  ERP 헬스체크 스크립트
rem  - http://127.0.0.1:8010/health/detailed 를 호출하여 상태를 출력
rem  - inventory mismatch / open queue / DB 행 수 확인용
rem ============================================================
setlocal

set "URL=http://127.0.0.1:8010/health/detailed"

echo [HEALTH] %URL%
echo.

curl -s -m 5 "%URL%"
set "RC=%ERRORLEVEL%"
echo.

if not "%RC%"=="0" (
    echo.
    echo [HEALTH] 호출 실패: 백엔드가 8010 포트에서 떠 있는지 확인하세요.
    exit /b 1
)

echo [HEALTH] OK
endlocal
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
