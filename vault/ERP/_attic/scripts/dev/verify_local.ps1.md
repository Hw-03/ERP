---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/verify_local.ps1
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# verify_local.ps1

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/verify_local.ps1]]

## 원본 첫 줄 (또는 메타)

```
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
```
