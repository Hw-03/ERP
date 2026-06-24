---
type: file-explanation
source_path: "scripts/ops/reconcile_inventory.bat"
importance: critical
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# reconcile_inventory.bat — reconcile_inventory.bat 설명

## 이 파일은 무엇을 책임지나

`reconcile_inventory.bat`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.

## 업무 흐름에서의 의미

운영 중 장애 대응, 백업, 복구, 정합성 점검처럼 실제 데이터 안전과 연결됩니다.

## 언제 보면 좋나

- 운영 점검, 백업, 복구, 정합성 확인이 필요할 때
- 장애 대응 절차를 검토할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

### 먼저 같이 볼 파일
- `_attic/docs/operations/DAILY_OPERATION_CHECKLIST.md` — `DAILY_OPERATION_CHECKLIST.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- `_attic/docs/operations/INCIDENT_RESPONSE.md` — `INCIDENT_RESPONSE.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- [[ERP/backend/app/services/integrity.py]] — `integrity.py`는 `integrity` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 조심할 점

이 파일은 운영 데이터, 재고 수량, 승인 상태, DB 구조, 백업/복구 중 하나와 직접 연결됩니다. 수정 전에는 관련 테스트, 백업 여부, 연결 화면/API를 반드시 확인해야 합니다.

## 핵심 발췌

```bat
@echo off
rem ============================================================
rem  MES 재고 정합성 1차 진단 스크립트 (Phase 4)
rem  - /health/detailed 호출 → inventory_mismatch_count 확인
rem  - 0 이면 정상 종료
rem  - > 0 이면 backup_db.bat 호출 후 운영 담당자에게 보고하도록 안내
rem
rem  실제 정합성 복구는 별도 절차(서비스 레이어 수동 호출 또는 SQL).
rem  이 스크립트는 "발견 + 백업 + 보고"만 자동화한다.
rem ============================================================
setlocal
set "URL=http://127.0.0.1:8010/health/detailed"
set "OUT=%TEMP%\mes_health_%RANDOM%.json"

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
```
