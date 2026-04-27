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
