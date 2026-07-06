# scripts/dev/sync-to-employee.ps1
# 개발 서버(C:\ERP) 최신 코드를 직원 서버(C:\ERP-dev)에 동기화한다.
# 직원 실데이터(mes.db, data/, logs/, .env.local)는 절대 건드리지 않는다.
#
# 사용법:
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev\sync-to-employee.ps1              정상 동기화
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev\sync-to-employee.ps1 -DryRun       미리보기만 (변경 없음)
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev\sync-to-employee.ps1 -Force        접속자 가드 무시
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev\sync-to-employee.ps1 -AllowSchemaChange   스키마 변경 있어도 진행
#
# exit code: 0 성공 / 2 접속자 있음 / 3 스키마 변경 검수 필요 / 4 robocopy 실패 / 5 마이그레이션 실패 / 6 헬스체크 실패

param(
    [switch] $DryRun,
    [switch] $Force,
    [switch] $AllowSchemaChange
)

$ErrorActionPreference = "Stop"

$DevRoot      = "C:\ERP"
$EmpRoot      = "C:\ERP-dev"
$EmpBackend   = Join-Path $EmpRoot "backend"
$EmpFrontend  = Join-Path $EmpRoot "frontend"
$EmpLog       = Join-Path $EmpBackend "logs\mes.log"
$EmpDb        = Join-Path $EmpBackend "mes.db"

Write-Host "===================================================="
Write-Host " DEXCOWIN MES 직원 서버 동기화"
Write-Host " $DevRoot -> $EmpRoot"
Write-Host "===================================================="

# ---------------------------------------------------------------
# 1) 접속자 가드 - mes.log 마지막 활동이 10분 이내면 중단
# ---------------------------------------------------------------
if (-not $Force -and (Test-Path $EmpLog)) {
    $lastLine = Get-Content $EmpLog -Tail 1 -ErrorAction SilentlyContinue
    if ($lastLine -match '^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})') {
        $lastTs = [datetime]::ParseExact($Matches[1], "yyyy-MM-dd HH:mm:ss", $null)
        $elapsed = (Get-Date) - $lastTs
        if ($elapsed.TotalMinutes -lt 10) {
            Write-Host ""
            Write-Host "[guard] 직원 서버 최근 활동: $($lastTs.ToString('yyyy-MM-dd HH:mm:ss')) ($([int]$elapsed.TotalMinutes)분 전)"
            Write-Host "[guard] 10분 이내 활동이 있어 중단합니다. -Force 로 무시하고 진행할 수 있습니다."
            exit 2
        }
        Write-Host "[guard] 직원 서버 마지막 활동: $($lastTs.ToString('yyyy-MM-dd HH:mm:ss')) ($([int]$elapsed.TotalMinutes)분 전) - 진행"
    }
}
elseif ($Force) {
    Write-Host "[guard] -Force 지정됨 - 접속자 확인 생략"
}

# ---------------------------------------------------------------
# 2) 스키마 변경 감지 - robocopy 드라이런 결과에서 위험 경로 매치
# ---------------------------------------------------------------
$schemaPatterns = @('\\app\\models\\', '\\bootstrap\\', 'bootstrap_db\.py')

$backendDryRun = robocopy "$DevRoot\backend" $EmpBackend /L /MIR `
    /XF mes.db mes.db-shm mes.db-wal "mes.db.backup-*" "*.pyc" `
    /XD __pycache__ .git data logs .pytest_cache _backup `
    /NJH /NDL /NP /NC 2>&1 | Out-String -Stream

$schemaHits = $backendDryRun | Where-Object {
    $line = $_
    $schemaPatterns | Where-Object { $line -match $_ }
}

if ($schemaHits -and -not $AllowSchemaChange) {
    Write-Host ""
    Write-Host "[schema] DB 스키마 관련 파일 변경이 감지됐습니다:"
    $schemaHits | ForEach-Object { Write-Host "  $_" }
    Write-Host "[schema] 내용을 검토한 뒤 -AllowSchemaChange 로 재실행하세요."
    exit 3
}
if ($schemaHits) {
    Write-Host "[schema] 스키마 관련 변경 감지됨 (-AllowSchemaChange 로 진행):"
    $schemaHits | ForEach-Object { Write-Host "  $_" }
}
else {
    Write-Host "[schema] 스키마 관련 변경 없음"
}

if ($DryRun) {
    Write-Host ""
    Write-Host "[dry-run] 백엔드 변경 예정 파일:"
    $backendDryRun | Where-Object { $_ -match '^\s*(New File|newer|older|\*EXTRA)' } | ForEach-Object { Write-Host "  $_" }

    $frontendDryRun = robocopy "$DevRoot\frontend" $EmpFrontend /L /MIR `
        /XD .next .next-prod node_modules _archive coverage test-results `
        /XF .env.local `
        /NJH /NDL /NP /NC 2>&1 | Out-String -Stream
    Write-Host ""
    Write-Host "[dry-run] 프론트엔드 변경 예정 파일:"
    $frontendDryRun | Where-Object { $_ -match '^\s*(New File|newer|older|\*EXTRA)' } | ForEach-Object { Write-Host "  $_" }

    Write-Host ""
    Write-Host "[dry-run] 아무것도 변경하지 않았습니다."
    exit 0
}

# ---------------------------------------------------------------
# 3) DB 백업 (최신 10개만 유지)
# ---------------------------------------------------------------
$backupName = "mes.db.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$backupPath = Join-Path $EmpBackend $backupName
Copy-Item $EmpDb $backupPath
Write-Host "[backup] $backupName 생성"

$oldBackups = Get-ChildItem $EmpBackend -Filter "mes.db.backup-*" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 10
foreach ($old in $oldBackups) {
    Remove-Item $old.FullName -Force
    Write-Host "[backup] 오래된 백업 삭제: $($old.Name)"
}

# ---------------------------------------------------------------
# 4) 직원 실행 스크립트 동기화
# ---------------------------------------------------------------
Write-Host ""
Write-Host "[sync] 직원 실행 스크립트 갱신 중..."
$EmpScriptDir = Join-Path $EmpRoot "scripts\dev"
New-Item -ItemType Directory -Force -Path $EmpScriptDir | Out-Null
$runtimeScripts = @(
    "resolve-server-profile.ps1",
    "start-backend.ps1",
    "stop-backend.ps1",
    "start-frontend.ps1",
    "stop-frontend.ps1"
)
foreach ($scriptName in $runtimeScripts) {
    $sourceScript = Join-Path $DevRoot "scripts\dev\$scriptName"
    $targetScript = Join-Path $EmpScriptDir $scriptName
    Copy-Item $sourceScript $targetScript -Force
    Write-Host "[sync] script: $scriptName"
}

$sourceStartBat = Join-Path $DevRoot "start.bat"
$targetStartBat = Join-Path $EmpRoot "start.bat"
Copy-Item $sourceStartBat $targetStartBat -Force
Write-Host "[sync] script: start.bat"

# ---------------------------------------------------------------
# 5) 서버 정지
# ---------------------------------------------------------------
Write-Host ""
Write-Host "[stop] 직원 서버 정지 중..."
powershell -ExecutionPolicy Bypass -File (Join-Path $EmpRoot "scripts\dev\stop-backend.ps1")
powershell -ExecutionPolicy Bypass -File (Join-Path $EmpRoot "scripts\dev\stop-frontend.ps1")

# ---------------------------------------------------------------
# 6) robocopy /MIR 실사행
# ---------------------------------------------------------------
Write-Host ""
Write-Host "[sync] 백엔드 동기화 중..."
robocopy "$DevRoot\backend" $EmpBackend /MIR `
    /XF mes.db mes.db-shm mes.db-wal "mes.db.backup-*" "*.pyc" `
    /XD __pycache__ .git data logs .pytest_cache _backup `
    /NJH /NDL /NP /NS /NC | Out-Null
$backendExit = $LASTEXITCODE
if ($backendExit -ge 8) {
    Write-Host "[sync] 백엔드 robocopy 실패 (exit $backendExit)"
    exit 4
}
Write-Host "[sync] 백엔드 robocopy exit $backendExit (정상)"

Write-Host "[sync] 프론트엔드 동기화 중..."
robocopy "$DevRoot\frontend" $EmpFrontend /MIR `
    /XD .next .next-prod node_modules _archive coverage test-results `
    /XF .env.local `
    /NJH /NDL /NP /NS /NC | Out-Null
$frontendExit = $LASTEXITCODE
if ($frontendExit -ge 8) {
    Write-Host "[sync] 프론트엔드 robocopy 실패 (exit $frontendExit)"
    exit 4
}
Write-Host "[sync] 프론트엔드 robocopy exit $frontendExit (정상)"

# ---------------------------------------------------------------
# 7) .next 캐시 삭제
# ---------------------------------------------------------------
Remove-Item (Join-Path $EmpFrontend ".next") -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "[sync] .next 캐시 삭제 완료"

# ---------------------------------------------------------------
# 8) DB 마이그레이션
# ---------------------------------------------------------------
Write-Host ""
Write-Host "[migrate] 실행 중..."
Push-Location $EmpBackend
$migrateOutput = & py bootstrap_db.py --schema --migrate 2>&1 | Out-String
$migrateExit = $LASTEXITCODE
Pop-Location

Write-Host $migrateOutput.TrimEnd()

if ($migrateExit -ne 0) {
    Write-Host "[migrate] 실패 (exit $migrateExit)"
    exit 5
}

$failedCount = 0
if ($migrateOutput -match 'failed=(\d+)') {
    $failedCount = [int]$Matches[1]
}
if ($failedCount -gt 0) {
    Write-Host "[migrate] failed=$failedCount - 중단"
    exit 5
}
Write-Host "[migrate] 완료"

# ---------------------------------------------------------------
# 9) 재기동
# ---------------------------------------------------------------
Write-Host ""
Write-Host "[start] 직원 서버 재기동 중..."
Start-Process cmd -ArgumentList "/k", "cd /d `"$EmpBackend`" && py -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload" -WindowStyle Normal
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Join-Path $EmpRoot "scripts\dev\start-frontend.ps1")
) -WindowStyle Normal

# ---------------------------------------------------------------
# 10) 헬스체크
# ---------------------------------------------------------------
Write-Host "[health] 백엔드(8010) 확인 중..."
$backendOk = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8010/health/live" -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $backendOk = $true; break }
    } catch {}
}

Write-Host "[health] 프론트(3000) 확인 중..."
$frontendOk = $false
for ($i = 0; $i -lt 240; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $frontendOk = $true; break }
    } catch {}
}

if (-not $backendOk -or -not $frontendOk) {
    Write-Host ""
    Write-Host "[health] 실패 - backend=$backendOk frontend=$frontendOk"
    exit 6
}

# ---------------------------------------------------------------
# 11) 요약
# ---------------------------------------------------------------
Write-Host ""
Write-Host "===================================================="
Write-Host " 동기화 완료"
Write-Host " 백엔드 robocopy exit  : $backendExit"
Write-Host " 프론트 robocopy exit  : $frontendExit"
Write-Host " 마이그레이션          : 성공"
Write-Host " 헬스체크 8010         : OK"
Write-Host " 헬스체크 3000         : OK"
Write-Host " DB 백업               : $backupName"
Write-Host " 접속 주소             : http://192.168.0.63:3000"
Write-Host "===================================================="
exit 0
