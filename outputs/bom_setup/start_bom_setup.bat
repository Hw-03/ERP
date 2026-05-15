@echo off
REM BOM Setup Tool - Local HTTP Server Launcher
REM Works around file:// limitation by serving via http://localhost
REM Supports NAS UNC paths via pushd auto drive mapping

setlocal
set PORT=8765

pushd "%~dp0"
if errorlevel 1 (
  echo [ERROR] Cannot access folder: %~dp0
  pause
  exit /b 1
)

python --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python not installed. Install from https://python.org
  pause
  popd
  exit /b 1
)

REM Kill any existing listener on PORT
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% "') do taskkill /F /PID %%a >nul 2>&1

REM Auto-open browser after short delay
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:%PORT%/bom_setup.html"

echo.
echo ============================================
echo  BOM Setup Tool Server
echo  URL    : http://localhost:%PORT%/bom_setup.html
echo  Folder : %CD%
echo  Stop   : close this window
echo ============================================
echo.

python -m http.server %PORT% --bind 127.0.0.1

popd
