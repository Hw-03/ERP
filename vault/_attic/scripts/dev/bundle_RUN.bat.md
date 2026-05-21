---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/bundle_RUN.bat
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# bundle_RUN.bat

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/bundle_RUN.bat]]

## 원본 첫 줄 (또는 메타)

```
@echo off
rem DEXCOWIN MES launcher (space/Korean path safe)
start "MES Backend" "%~dp0_backend.bat"
start "MES Frontend" "%~dp0_frontend.bat"
echo Starting servers... a browser will open in about 15 seconds.
timeout /t 15 /nobreak >nul
start "" "http://localhost:3000/legacy?tab=admin"
```
