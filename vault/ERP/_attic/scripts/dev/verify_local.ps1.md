---
type: file-explanation
source_path: "_attic/scripts/dev/verify_local.ps1"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# verify_local.ps1 — verify_local.ps1 설명

## 이 파일은 무엇을 책임지나

`verify_local.ps1`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

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
param(
    [switch] $DbReadOnlyCheck
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# 격리: 이 스크립트는 _attic/scripts/dev/ 에 위치 → 실제 RepoRoot 는 세 단계 상위.
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$FrontendRoot = Join-Path $RepoRoot "frontend"
$BackendRoot = Join-Path $RepoRoot "backend"

function Invoke-Check {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,

        [Parameter(Mandatory = $true)]
        [string] $WorkingDirectory,

        [Parameter(Mandatory = $true)]
        [scriptblock] $Command
    )

    Write-Host ""
    Write-Host "==> $Name"
    Push-Location $WorkingDirectory
    try {
        & $Command
        if ($LASTEXITCODE -ne 0) {
            throw "$Name failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

Invoke-Check "Backend pytest" $BackendRoot { python -m pytest -q }
Invoke-Check "Frontend strict lint" $FrontendRoot { npm run lint:strict }
Invoke-Check "Frontend type check" $FrontendRoot { npx tsc --noEmit }
# coverage gate (Round-10A #5) — CI 와 동일한 threshold 50/50/50/50.
Invoke-Check "Frontend tests + coverage" $FrontendRoot { npm run test:coverage }
Invoke-Check "Frontend production build" $FrontendRoot { npm run build }
# Round-16 #4 — bundle size gate (.next-prod/static/chunks 합산 ≤ 2.0 MB).
Invoke-Check "Frontend bundle size" $FrontendRoot { npm run check:bundle-size }
# OpenAPI drift check (Round-10A #5) — backend 라우터/스키마 변경 시 docs/openapi.json 갱신 강제.
Invoke-Check "OpenAPI drift" $BackendRoot {
    $TmpFile = Join-Path $env:TEMP "openapi-current.json"
    $BaselineFile = Join-Path $RepoRoot "_attic/docs/openapi.json"

    $PyScript = @'
import json
import sys
sys.path.insert(0, ".")
```
