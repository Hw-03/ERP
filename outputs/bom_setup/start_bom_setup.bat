@echo off
REM BOM 세팅 도구 로컬 서버 (file:// 회피 -> localhost 로 열어야 자동저장 작동)
REM NAS UNC 경로에서도 동작 (pushd 가 임시 드라이브 letter 로 매핑)

setlocal
set PORT=8765

REM 작업 디렉토리 (UNC 인 경우 자동 드라이브 매핑)
pushd "%~dp0"
if errorlevel 1 (
  echo [ERR] 경로 접근 실패: %~dp0
  pause
  exit /b 1
)

REM Python 확인
python --version >nul 2>&1
if errorlevel 1 (
  echo [ERR] Python 설치 필요 - https://python.org 에서 설치 후 재실행
  pause
  popd
  exit /b 1
)

REM 기존 PORT 서버 종료
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% .*LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)

REM 3초 후 브라우저 자동 열기
start "" /B cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:%PORT%/bom_setup.html"

echo.
echo  ============================================
echo   BOM 세팅 도구 서버 실행 중
echo   URL : http://localhost:%PORT%/bom_setup.html
echo   디렉토리 : %CD%
echo   종료 : 이 창 닫기 또는 Ctrl+C
echo  ============================================
echo.

python -m http.server %PORT% --bind 127.0.0.1

popd
