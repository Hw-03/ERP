---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/restart-frontend.ps1
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# restart-frontend.ps1

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/restart-frontend.ps1]]

## 원본 첫 줄 (또는 메타)

```
﻿# scripts/dev/restart-frontend.ps1
#
# Frontend dev 서버 (Next.js, port 3000) 재시작 헬퍼.
#
# 사용:
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev\restart-frontend.ps1
#
# 동작:
#   1. 3000 포트를 점유한 프로세스 종료 (없으면 통과)
#   2. .next-prod 와 충돌 가능성 있는 잔재 정리 (.next 의 일부 manifest)
#   3. 새 PowerShell 창에서 'npm run dev' 기동 → 콘솔 로그 직접 확인 가능
#
# 보호 규칙:
#   - 3000 포트의 LISTENING 프로세스만 죽인다. 다른 포트는 건드리지 않는다.
#   - node 가 아닌 프로세스가 잡혀 있으면 중단하고 안내.
#   - dev 서버의 build/start 결과물(.next-prod) 은 절대 건드리지 않는다.

$ErrorActionPreference = "Stop"

# Repo 루트 = 이 스크립트의 부모의 부모
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$FrontendRoot = Join-Path $RepoRoot "frontend"

if (-not (Test-Path $FrontendRoot)) {
```
