---
type: file-explanation
source_path: "scripts/ops/healthcheck.bat"
importance: important
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# healthcheck.bat — healthcheck.bat 설명

## 이 파일은 무엇을 책임지나

`healthcheck.bat`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.

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

운영 스크립트는 실제 DB 파일이나 백업 파일을 건드릴 수 있습니다. 실행 전 대상 경로를 확인해야 합니다.

## 핵심 발췌

```bat
@echo off
rem ============================================================
rem  MES 헬스체크 스크립트
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
```
