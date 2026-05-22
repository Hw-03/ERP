---
type: file-explanation
source_path: "scripts/ops/restore_db.bat"
importance: important
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# restore_db.bat — restore_db.bat 설명

## 이 파일은 무엇을 책임지나

`restore_db.bat`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.

## 업무 흐름에서의 의미

운영 중 장애 대응, 백업, 복구, 정합성 점검처럼 실제 데이터 안전과 연결됩니다.

## 언제 보면 좋나

- 운영 점검, 백업, 복구, 정합성 확인이 필요할 때
- 장애 대응 절차를 검토할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/docs/operations/DAILY_OPERATION_CHECKLIST.md]] — `DAILY_OPERATION_CHECKLIST.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- [[ERP/docs/operations/INCIDENT_RESPONSE.md]] — `INCIDENT_RESPONSE.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- [[ERP/backend/app/services/integrity.py]] — `integrity.py`는 `integrity` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 조심할 점

운영 스크립트는 실제 DB 파일이나 백업 파일을 건드릴 수 있습니다. 실행 전 대상 경로를 확인해야 합니다.

## 핵심 발췌

```bat
@echo off
rem ============================================================
rem  MES DB restore (operator must stop the backend first!)
rem  Usage: restore_db.bat <backup-filename>
rem      filename is relative to backend\_backup\
rem  Steps:
rem    1) snapshot the current mes.db as mes_PRE-RESTORE_TS.db
rem    2) integrity_check on the source backup
rem    3) replace mes.db + remove stale wal/shm
rem ============================================================
setlocal

set "ROOT=%~dp0..\.."
set "DB=%ROOT%\backend\mes.db"

if "%~1"=="" (
    echo Usage: restore_db.bat ^<backup-filename^>
    echo Available backups:
    dir /B "%ROOT%\backend\_backup\mes_*.db" 2>nul
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
    copy /Y "%DB%" "%ROOT%\backend\_backup\mes_PRE-RESTORE_%TS%.db" >nul
    echo [RESTORE] snapshot: mes_PRE-RESTORE_%TS%.db
)

rem 2) integrity check
python -c "import sqlite3,sys; c=sqlite3.connect(r'%SRC%'); r=c.execute('PRAGMA integrity_check').fetchone()[0]; sys.exit(0 if r=='ok' else 3)"
if errorlevel 3 (
    echo [RESTORE] integrity check failed on %SRC%
    exit /b 3
)

rem 3) replace + remove stale wal/shm
copy /Y "%SRC%" "%DB%" >nul
if errorlevel 1 (
    echo [RESTORE] copy failed
    exit /b 1
)
del "%DB%-wal" "%DB%-shm" 2>nul

echo [RESTORE] OK
echo   restored: %SRC%
echo   to     : %DB%
echo Now start the backend manually (start.bat or uvicorn).
```
