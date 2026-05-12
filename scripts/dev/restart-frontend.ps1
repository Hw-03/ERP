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

    Write-Host "    kill PID $($proc.Id) ($($proc.ProcessName))"
    Stop-Process -Id $proc.Id -Force
}

# 종료 확정 대기
$deadline = (Get-Date).AddSeconds(5)
while ((Get-Date) -lt $deadline) {
    $still = $null
    try { $still = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop } catch {}
    if (-not $still) { break }
    Start-Sleep -Milliseconds 200
}

# 2. .next 캐시 청소 (build 가 dev .next 를 덮어쓰던 상황 잔재 대비)
$NextCache = Join-Path $FrontendRoot ".next"
if (Test-Path $NextCache) {
    Write-Host "    clean $NextCache"
    try {
        Remove-Item -Recurse -Force $NextCache -ErrorAction Stop
    } catch {
        Write-Warning ".next 정리 실패 (다른 프로세스 lock 가능). 무시하고 진행: $($_.Exception.Message)"
    }
}

# .next-prod 는 production 빌드 결과 — 절대 건드리지 않음.

# 3. 새 창에서 npm run dev 기동
Write-Host ""
Write-Host "==> npm run dev (새 창)" -ForegroundColor Cyan
Start-Process -FilePath "powershell" `
    -ArgumentList @("-NoExit", "-Command", "npm run dev") `
    -WorkingDirectory $FrontendRoot

Write-Host ""
Write-Host "완료. 새 PowerShell 창에서 dev 서버가 기동 중입니다." -ForegroundColor Green
Write-Host "    http://localhost:3000/legacy"
