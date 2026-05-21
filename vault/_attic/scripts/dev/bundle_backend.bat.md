---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/bundle_backend.bat
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# bundle_backend.bat

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/bundle_backend.bat]]

## 원본 첫 줄 (또는 메타)

```
@echo off
title MES Backend
cd /d "%~dp0app\backend"
set "PATH=%~dp0python;%~dp0python\Scripts;%PATH%"
echo [MES] Backend starting on http://127.0.0.1:8010
echo [MES] Do not close this window while using the program.
"%~dp0python\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8010
echo.
echo [MES] Backend stopped. If this closed with an error, copy the text above.
pause
```
