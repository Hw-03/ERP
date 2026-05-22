---
type: file-explanation
source_path: "scripts/dev/verify_local.ps1"
importance: important
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# verify_local.ps1 — verify_local.ps1 설명

## 이 파일은 무엇을 책임지나

`verify_local.ps1`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

## 업무 흐름에서의 의미

개발자가 변경 전후 품질을 확인하거나 데이터 작업을 준비할 때 사용합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

큰 위험은 낮지만, 연결된 파일과 실행 위치를 확인한 뒤 수정하는 편이 안전합니다.

## 핵심 발췌

```powershell
param(
    [switch] $DbReadOnlyCheck
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# RepoRoot 을 git으로 정확히 계산 (스크립트 위치와 무관)
$RepoRoot = git rev-parse --show-toplevel
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
# OpenAPI drift check (Round-10A #5) — backend 라우터/스키마 변경 시 _dev/baselines/openapi.json 갱신 강제.
Invoke-Check "OpenAPI drift" $BackendRoot {
    $TmpFile = Join-Path $env:TEMP "openapi-current.json"
    $BaselineFile = Join-Path $RepoRoot "_dev/baselines/openapi.json"

    $PyScript = @'
import json
import sys
sys.path.insert(0, ".")
```
