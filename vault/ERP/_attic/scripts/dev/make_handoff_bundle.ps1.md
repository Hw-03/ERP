---
type: file-explanation
source_path: "_attic/scripts/dev/make_handoff_bundle.ps1"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# make_handoff_bundle.ps1 — make_handoff_bundle.ps1 설명

## 이 파일은 무엇을 책임지나

`make_handoff_bundle.ps1`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```powershell
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

if (-not (Test-Path $README)) { throw "missing $README" }
New-Item -ItemType Directory -Force -Path $CACHE | Out-Null
if (Test-Path $STAGE) { Remove-Item $STAGE -Recurse -Force }
New-Item -ItemType Directory -Force -Path $STAGE | Out-Null

function Get-Cached($url, $name) {
  $dst = Join-Path $CACHE $name
  if (-not (Test-Path $dst)) {
    Write-Host "[bundle] download $name ..."
    Invoke-WebRequest -Uri $url -OutFile $dst -UseBasicParsing
  } else {
    Write-Host "[bundle] cached $name"
  }
  return $dst
}

# 1) frontend production build (.next-prod)
Write-Host "[bundle] frontend build ..."
Push-Location (Join-Path $ROOT "frontend")
cmd /c "npm run build"
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm run build failed" }
Pop-Location

# 2) portable Node
$nodeZip = Get-Cached $NODE_URL "node.zip"
$nodeTmp = Join-Path $STAGE "_node_tmp"
Expand-Archive -Path $nodeZip -DestinationPath $nodeTmp -Force
$nodeInner = Get-ChildItem $nodeTmp -Directory | Select-Object -First 1
Move-Item $nodeInner.FullName (Join-Path $STAGE "node")
```
