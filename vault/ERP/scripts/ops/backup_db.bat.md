---
type: file-explanation
source_path: "scripts/ops/backup_db.bat"
importance: important
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# backup_db.bat — backup_db.bat 설명

## 이 파일은 무엇을 책임지나

`backup_db.bat`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.

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
rem  MES DB backup script (WAL safe)
rem  - copies backend\mes.db to backend\_backup\mes_YYYYMMDD_HHMMSS.db
rem  - safe to run while the backend is up (transaction-consistent)
rem
rem  fallback order:
rem    1) sqlite3 CLI ".backup" command (preferred)
rem    2) python sqlite3 backup() API (uses backend's bundled sqlite3 module)
rem    3) WAL checkpoint + copy of db / wal / shm 3 files (last resort)
rem ============================================================
setlocal enabledelayedexpansion

set "ROOT=%~dp0..\.."
set "DB=%ROOT%\backend\mes.db"
set "DEST_DIR=%ROOT%\backend\_backup"

if not exist "%DB%" (
    echo [BACKUP] mes.db not found: %DB%
    exit /b 1
)

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

rem timestamp via PowerShell so the format is locale-independent
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"`) do set "TS=%%i"
set "DEST=%DEST_DIR%\mes_%TS%.db"

rem ----- 1: sqlite3 CLI -----------------------------------------------------
where sqlite3 >nul 2>&1
if not errorlevel 1 (
    sqlite3 "%DB%" ".backup '%DEST%'"
    if not errorlevel 1 (
        echo [BACKUP] OK ^(sqlite3 .backup^)
        echo   from : %DB%
        echo   to   : %DEST%
        endlocal & exit /b 0
    )
    echo [BACKUP] sqlite3 .backup failed - trying python fallback
)

rem ----- 2: Python sqlite3 backup API --------------------------------------
where python >nul 2>&1
if not errorlevel 1 (
    python -c "import sqlite3,sys; src=sqlite3.connect(r'%DB%'); dst=sqlite3.connect(r'%DEST%'); src.backup(dst); dst.close(); src.close()"
    if not errorlevel 1 (
        echo [BACKUP] OK ^(python sqlite3.backup^)
        echo   from : %DB%
        echo   to   : %DEST%
        endlocal & exit /b 0
    )
    echo [BACKUP] python backup failed - trying file copy fallback
)

rem ----- 3: WAL checkpoint + copy 3 files ----------------------------------
```
