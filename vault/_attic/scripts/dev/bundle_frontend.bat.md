---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/bundle_frontend.bat
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# bundle_frontend.bat

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/bundle_frontend.bat]]

## 원본 첫 줄 (또는 메타)

```
@echo off
title MES Frontend
cd /d "%~dp0app\frontend"
set "PATH=%~dp0node;%PATH%"
set "BACKEND_INTERNAL_URL=http://127.0.0.1:8010"
echo [MES] Frontend starting on http://localhost:3000
echo [MES] Do not close this window while using the program.
"%~dp0node\npm.cmd" run start
echo.
echo [MES] Frontend stopped. If this closed with an error, copy the text above.
pause
```
