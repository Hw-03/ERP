---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/make_handoff_bundle.ps1
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# make_handoff_bundle.ps1

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/make_handoff_bundle.ps1]]

## 원본 첫 줄 (또는 메타)

```
# Portable handoff bundle builder (target PC needs NO Python/Node).
#
# Output: Desktop\DEXCOWIN_MES_handoff_<date>.zip
#   Unzip and double-click RUN.bat. No install required.
#
# Contents: portable Python 3.12 + portable Node 20 + frontend prod build
#           + backend/erp.db (as-is) + RUN.bat + Korean readme.
#
# NOTE: This script is intentionally ASCII-only. Windows PowerShell 5.1
#       reads .ps1 as ANSI; non-ASCII here-strings break parsing.
#       Korean readme lives in scripts/dev/bundle_readme_ko.txt and is
#       copied byte-exact into the bundle.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ROOT   = (Resolve-Path "$PSScriptRoot\..\..").Path
$CACHE  = Join-Path $env:TEMP "mes_bundle_cache"
$STAGE  = Join-Path $env:TEMP "mes_bundle_stage"
$DATE   = Get-Date -Format "yyyyMMdd"
$OUTZIP = Join-Path ([Environment]::GetFolderPath("Desktop")) "DEXCOWIN_MES_handoff_$DATE.zip"
$README = Join-Path $PSScriptRoot "bundle_readme_ko.txt"

$NODE_VER = "v20.18.1"
$NODE_URL = "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-win-x64.zip"
$PY_URL   = "https://github.com/astral-sh/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-x86_64-pc-windows-msvc-install_only.tar.gz"
```
