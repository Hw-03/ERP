---
type: file-explanation
source_path: "start.bat"
importance: important
layer: meta
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# start.bat — Windows 통합 실행 버튼

## 이 파일은 무엇을 책임지나

백엔드와 프론트엔드를 한 번에 켜고 브라우저를 열기 위한 Windows 실행 파일입니다.

## 업무 흐름에서의 의미

현장에서 데모나 로컬 운영 확인을 할 때 가장 먼저 누르는 파일입니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/📁_ERP]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

포트, Python/Node 경로, LAN IP 처리와 연결되므로 수정 후 실제 실행 확인이 필요합니다.

## 핵심 발췌

```bat
@echo off
setlocal

rem ====== Prerequisites: Python + Node.js ======
set "MISSING_PY=0"
set "MISSING_NODE=0"
where py >nul 2>&1
if errorlevel 1 set "MISSING_PY=1"
where node >nul 2>&1
if errorlevel 1 set "MISSING_NODE=1"
if "%MISSING_PY%%MISSING_NODE%"=="00" goto :prereq_ok

echo.
echo ================================================================
echo  [MES] 필수 프로그램이 설치되어 있지 않습니다
echo ================================================================
if "%MISSING_PY%"=="1"   echo   [ ] Python 3.13+    ^(미설치^)
if "%MISSING_PY%"=="0"   echo   [O] Python          ^(설치됨^)
if "%MISSING_NODE%"=="1" echo   [ ] Node.js LTS     ^(미설치^)
if "%MISSING_NODE%"=="0" echo   [O] Node.js         ^(설치됨^)
echo.
echo ----------------------------------------------------------------
echo  [수동 설치 - 권장]
echo    Python : https://www.python.org/downloads/
echo             ^(설치 화면에서 "Add python.exe to PATH" 반드시 체크^)
echo    Node.js: https://nodejs.org/  ^(LTS 버전 다운로드^)
echo.
echo  [자동 설치] Windows 10/11 + winget + 관리자 권한 필요
echo ----------------------------------------------------------------
echo.
set "USE_WINGET=N"
set /p USE_WINGET="자동 설치를 시도할까요? (Y/N, 기본 N): "
if /i not "%USE_WINGET%"=="Y" goto :prereq_exit

where winget >nul 2>&1
if errorlevel 1 (
    echo.
    echo [MES] winget 을 찾을 수 없습니다. 위 링크로 수동 설치 후 다시 실행하세요.
    goto :prereq_exit
)

if "%MISSING_PY%"=="1" (
    echo.
    echo [MES] Python 3.13 설치 중... ^(UAC 창이 뜨면 "예" 클릭^)
    winget install -e --id Python.Python.3.13 --accept-source-agreements --accept-package-agreements --override "/quiet PrependPath=1"
)
if "%MISSING_NODE%"=="1" (
    echo.
    echo [MES] Node.js LTS 설치 중... ^(UAC 창이 뜨면 "예" 클릭^)
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
)

echo.
echo ================================================================
echo  설치 완료. 변경된 PATH 를 반영하려면
```
