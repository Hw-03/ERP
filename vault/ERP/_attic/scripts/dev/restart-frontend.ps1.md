---
type: file-explanation
source_path: "_attic/scripts/dev/restart-frontend.ps1"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# restart-frontend.ps1 — restart-frontend.ps1 설명

## 이 파일은 무엇을 책임지나

`restart-frontend.ps1`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

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
# scripts/dev/restart-frontend.ps1
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
    Write-Error "frontend 폴더를 찾을 수 없습니다: $FrontendRoot"
    exit 1
}

Write-Host "==> Frontend dev 서버 재시작" -ForegroundColor Cyan
Write-Host "    repo: $RepoRoot"
Write-Host ""

# 1. 3000 포트 점유 프로세스 종료
$conns = @()
try {
    $conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop
} catch {
    Write-Host "[skip] 3000 포트에 LISTENING 프로세스 없음. 그대로 새로 띄웁니다."
}

foreach ($c in $conns) {
    $proc = $null
    try {
        $proc = Get-Process -Id $c.OwningProcess -ErrorAction Stop
    } catch {
        continue
    }

    if ($proc.ProcessName -notmatch "^(node|npm)$") {
        Write-Warning "포트 3000 을 '$($proc.ProcessName)' (PID $($proc.Id)) 가 점유 중입니다."
        Write-Warning "node/npm 이 아니라 중단합니다. 수동으로 확인해 주세요."
        exit 1
    }
```
