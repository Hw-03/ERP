# scripts/dev/sync-to-employee.ps1
# 개발 서버(C:\ERP) 최신 코드를 직원 서버(C:\ERP-dev)에 안전하게 동기화한다.
# 직원 실데이터(mes.db, data/, 기존 logs/, .env.local)는 코드 동기화로 건드리지 않는다.
#
# 사용법:
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev\sync-to-employee.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev\sync-to-employee.ps1 -DryRun
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev\sync-to-employee.ps1 -Force
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev\sync-to-employee.ps1 -AllowSchemaChange
#
# exit code: 0 성공 / 2 접속자 있음 / 3 스키마 검수 필요 / 4 동기화 실패 /
#            5 마이그레이션 실패 / 6 헬스체크 실패 / 7 백업 실패 / 8 사후 검증 실패

param(
    [switch] $DryRun,
    [switch] $Force,
    [switch] $AllowSchemaChange
)

$ErrorActionPreference = "Stop"

$DevRoot = "C:\ERP"
$EmpRoot = "C:\ERP-dev"
$EmpBackend = Join-Path $EmpRoot "backend"
$EmpFrontend = Join-Path $EmpRoot "frontend"
$EmpRuntimeRoot = Join-Path $EmpRoot "_attic\runtime"
$EmpBackupDir = Join-Path $EmpRoot "_attic\runtime\backups\sqlite"
$EmpLog = Join-Path $EmpRoot "_attic\runtime\logs\backend\mes.log"
$EmpLegacyLog = Join-Path $EmpBackend "logs\mes.log"
$EmpDb = Join-Path $EmpBackend "mes.db"

. (Join-Path $DevRoot "scripts\dev\checked-command.ps1")

function Write-CheckedCommandResult {
    param(
        [string] $Label,
        [pscustomobject] $Result
    )

    foreach ($line in $Result.Output) {
        Write-Host $line
    }
    if ($Result.LaunchError) {
        Write-Host "[$Label] 실행 오류: $($Result.LaunchError)"
    }
    elseif (-not $Result.Success) {
        Write-Host "[$Label] 실패 (exit $($Result.ExitCode))"
    }
}

function Invoke-EmployeeServiceScript {
    param([string] $ScriptName)

    return Invoke-CheckedExternalCommand `
        -FilePath "powershell.exe" `
        -ArgumentList @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", (Join-Path $EmpRoot "scripts\dev\$ScriptName")
        )
}

function Restart-EmployeeServices {
    $backendStart = Invoke-EmployeeServiceScript -ScriptName "start-backend.ps1"
    Write-CheckedCommandResult -Label "restart-backend" -Result $backendStart
    $frontendStart = Invoke-EmployeeServiceScript -ScriptName "start-frontend.ps1"
    Write-CheckedCommandResult -Label "restart-frontend" -Result $frontendStart
    return [pscustomobject] @{
        Success = ($backendStart.Success -and $frontendStart.Success)
        Backend = $backendStart
        Frontend = $frontendStart
    }
}

function Write-RecoveryInstructions {
    param(
        [string] $FailedStage,
        [string] $ValidatedBackupPath
    )

    Write-Host "[$FailedStage] 서버를 재기동하지 않습니다. DB를 자동 복원하지 않았습니다."
    Write-Host "[$FailedStage] 검증된 백업: $ValidatedBackupPath"
    Write-Host "[$FailedStage] 검토 후 다음 명령으로 수동 복원하세요:"
    Write-Host "  py `"$EmpRoot\scripts\ops\restore_db.py`" --sqlite `"$ValidatedBackupPath`" --target `"$EmpDb`" --check"
}

Write-Host "===================================================="
Write-Host " DEXCOWIN MES 직원 서버 동기화"
Write-Host " $DevRoot -> $EmpRoot"
Write-Host "===================================================="

# ---------------------------------------------------------------
# 1) 접속자 가드
# ---------------------------------------------------------------
Write-Host "[guard] 최근 접속 활동 확인 중..."
$activityLog = @($EmpLog, $EmpLegacyLog) |
    Where-Object { Test-Path -LiteralPath $_ } |
    Sort-Object { (Get-Item -LiteralPath $_).LastWriteTime } -Descending |
    Select-Object -First 1
if (-not $Force -and $activityLog) {
    $lastLine = Get-Content -LiteralPath $activityLog -Tail 1 -ErrorAction SilentlyContinue
    if ($lastLine -match '^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})') {
        $lastTs = [datetime]::ParseExact($Matches[1], "yyyy-MM-dd HH:mm:ss", $null)
        $elapsed = (Get-Date) - $lastTs
        if ($elapsed.TotalMinutes -lt 10) {
            Write-Host "[guard] 직원 서버 최근 활동: $($lastTs.ToString('yyyy-MM-dd HH:mm:ss')) ($([int]$elapsed.TotalMinutes)분 전)"
            Write-Host "[guard] 10분 이내 활동이 있어 중단합니다. -Force 로 무시할 수 있습니다."
            exit 2
        }
        Write-Host "[guard] 마지막 활동 $([int]$elapsed.TotalMinutes)분 전 - 진행"
    }
}
elseif ($Force) {
    Write-Host "[guard] -Force 지정됨 - 접속자 확인 생략"
}

# ---------------------------------------------------------------
# 2) 스키마 변경 가드
# ---------------------------------------------------------------
$schemaPatterns = @(
    '\\app\\models\\',
    '\\bootstrap\\',
    '\\alembic\\',
    'alembic\.ini',
    'migration_type_compare\.py',
    'bootstrap_db\.py'
)
$backendDryRun = robocopy "$DevRoot\backend" $EmpBackend /L /MIR `
    /XF mes.db mes.db-shm mes.db-wal "mes.db.backup-*" "*.pyc" `
    /XD __pycache__ .git data logs .pytest_cache _backup `
    /NJH /NDL /NP /NC 2>&1 | Out-String -Stream
$schemaHits = $backendDryRun | Where-Object {
    $line = $_
    $schemaPatterns | Where-Object { $line -match $_ }
}

if ($schemaHits -and -not $AllowSchemaChange) {
    Write-Host "[schema] DB 스키마 관련 파일 변경이 감지됐습니다:"
    $schemaHits | ForEach-Object { Write-Host "  $_" }
    Write-Host "[schema] 검토 후 -AllowSchemaChange 로 재실행하세요."
    exit 3
}
if ($schemaHits) {
    Write-Host "[schema] 스키마 관련 변경 감지됨 (-AllowSchemaChange 로 진행)"
}
else {
    Write-Host "[schema] 스키마 관련 변경 없음"
}

if ($DryRun) {
    Write-Host "[dry-run] 백엔드 변경 예정 파일:"
    $backendDryRun | Where-Object { $_ -match '^\s*(New File|newer|older|\*EXTRA)' } | ForEach-Object { Write-Host "  $_" }
    $frontendDryRun = robocopy "$DevRoot\frontend" $EmpFrontend /L /MIR `
        /XD .next .next-prod node_modules _archive coverage test-results logs `
        /XF .env.local `
        /NJH /NDL /NP /NC 2>&1 | Out-String -Stream
    Write-Host "[dry-run] 프론트엔드 변경 예정 파일:"
    $frontendDryRun | Where-Object { $_ -match '^\s*(New File|newer|older|\*EXTRA)' } | ForEach-Object { Write-Host "  $_" }
    Write-Host "[dry-run] 아무것도 변경하지 않았습니다."
    exit 0
}

$env:MES_RUNTIME_ROOT = $EmpRuntimeRoot

# ---------------------------------------------------------------
# 3) 서버 정지
# ---------------------------------------------------------------
Write-Host "[stop] 직원 서버 정지 중..."
$backendStop = Invoke-EmployeeServiceScript -ScriptName "stop-backend.ps1"
Write-CheckedCommandResult -Label "stop-backend" -Result $backendStop
$frontendStop = Invoke-EmployeeServiceScript -ScriptName "stop-frontend.ps1"
Write-CheckedCommandResult -Label "stop-frontend" -Result $frontendStop
if (-not $backendStop.Success -or -not $frontendStop.Success) {
    Write-Host "[stop] 정지 명령 실패 - 배포를 중단하고 서버 재기동을 시도합니다."
    $restartAfterStopFailure = Restart-EmployeeServices
    if (-not $restartAfterStopFailure.Success) {
        Write-Host "[stop] 재기동도 실패했습니다. backend=$($restartAfterStopFailure.Backend.Success) frontend=$($restartAfterStopFailure.Frontend.Success)"
    }
    exit 7
}

$backendPortFree = Test-TcpPortFree -Port 8010
$frontendPortFree = Test-TcpPortFree -Port 3000
if (-not $backendPortFree -or -not $frontendPortFree) {
    Write-Host "[stop] 실제 포트 정지 확인 실패 - backend8010Free=$backendPortFree frontend3000Free=$frontendPortFree"
    $restartAfterPortFailure = Restart-EmployeeServices
    if (-not $restartAfterPortFailure.Success) {
        Write-Host "[stop] 재기동 실패: backend=$($restartAfterPortFailure.Backend.Success) frontend=$($restartAfterPortFailure.Frontend.Success)"
    }
    exit 7
}
Write-Host "[stop] 정지 명령 및 8010/3000 포트 확인 완료"

# ---------------------------------------------------------------
# 4) sqlite3.backup 기반 백업 및 검증
# ---------------------------------------------------------------
Write-Host "[backup] 직원 DB 백업·검증 중..."
$backupTool = Join-Path $DevRoot "scripts\ops\backup_db.py"
$backupResult = Invoke-CheckedExternalCommand -FilePath "py.exe" -ArgumentList @($backupTool, "--sqlite", $EmpDb)
Write-CheckedCommandResult -Label "backup" -Result $backupResult
if (-not $backupResult.Success) {
    Write-Host "[backup] 실패 - 기존 서버를 재기동하고 배포를 중단합니다."
    $restartAfterBackupFailure = Restart-EmployeeServices
    if (-not $restartAfterBackupFailure.Success) {
        Write-Host "[backup] 재기동 실패: backend=$($restartAfterBackupFailure.Backend.Success) frontend=$($restartAfterBackupFailure.Frontend.Success)"
    }
    exit 7
}

$backupOutput = ($backupResult.Output | ForEach-Object { [string] $_ }) -join [Environment]::NewLine
$backupPathMatch = [regex]::Match($backupOutput, '(?m)^BACKUP_PATH=(?<path>.+?)\s*$')
if (-not $backupPathMatch.Success) {
    Write-Host "[backup] BACKUP_PATH 출력을 찾지 못했습니다. 기존 서버를 재기동합니다."
    $restartAfterPathFailure = Restart-EmployeeServices
    if (-not $restartAfterPathFailure.Success) {
        Write-Host "[backup] 재기동 실패: backend=$($restartAfterPathFailure.Backend.Success) frontend=$($restartAfterPathFailure.Frontend.Success)"
    }
    exit 7
}
$backupPath = [System.IO.Path]::GetFullPath($backupPathMatch.Groups['path'].Value.Trim())
$expectedBackupPrefix = [System.IO.Path]::GetFullPath($EmpBackupDir).TrimEnd('\') + '\'
if (-not $backupPath.StartsWith($expectedBackupPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
    Write-Host "[backup] 반환 경로가 직원 런타임 백업 파일이 아닙니다: $backupPath"
    $restartAfterInvalidPath = Restart-EmployeeServices
    if (-not $restartAfterInvalidPath.Success) {
        Write-Host "[backup] 재기동 실패: backend=$($restartAfterInvalidPath.Backend.Success) frontend=$($restartAfterInvalidPath.Frontend.Success)"
    }
    exit 7
}
Write-Host "[backup] 검증된 백업: $backupPath"

# ---------------------------------------------------------------
# 5) 코드 동기화
# ---------------------------------------------------------------
Write-Host "[sync] 직원 실행·운영 스크립트 갱신 중..."
$EmpDevScriptDir = Join-Path $EmpRoot "scripts\dev"
New-Item -ItemType Directory -Force -Path $EmpDevScriptDir | Out-Null
$runtimeScripts = @(
    "resolve-server-profile.ps1",
    "checked-command.ps1",
    "runtime-paths.ps1",
    "runtime-control.ps1",
    "service_supervisor.py",
    "start-backend.ps1",
    "stop-backend.ps1",
    "start-frontend.ps1",
    "stop-frontend.ps1",
    "stop-servers.ps1",
    "open-watch.ps1",
    "watch-service.ps1",
    "watch-servers.ps1",
    "status-servers.ps1"
)
foreach ($scriptName in $runtimeScripts) {
    Copy-Item (Join-Path $DevRoot "scripts\dev\$scriptName") (Join-Path $EmpDevScriptDir $scriptName) -Force
}

New-Item -ItemType Directory -Force -Path (Join-Path $EmpRoot "scripts") | Out-Null
Copy-Item (Join-Path $DevRoot "scripts\runtime_paths.py") (Join-Path $EmpRoot "scripts\runtime_paths.py") -Force
robocopy (Join-Path $DevRoot "scripts\ops") (Join-Path $EmpRoot "scripts\ops") /MIR `
    /XD __pycache__ /XF "*.pyc" /NJH /NDL /NP /NS /NC | Out-Null
$opsExit = $LASTEXITCODE
if ($opsExit -ge 8) {
    Write-Host "[sync] 운영 스크립트 robocopy 실패 (exit $opsExit)"
    exit 4
}

foreach ($batName in @("start.bat", "watch.bat", "stop.bat", "status.bat")) {
    Copy-Item (Join-Path $DevRoot $batName) (Join-Path $EmpRoot $batName) -Force
}

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

Write-Host "[sync] 프론트엔드 동기화 중..."
robocopy "$DevRoot\frontend" $EmpFrontend /MIR `
    /XD .next .next-prod node_modules _archive coverage test-results logs `
    /XF .env.local `
    /NJH /NDL /NP /NS /NC | Out-Null
$frontendExit = $LASTEXITCODE
if ($frontendExit -ge 8) {
    Write-Host "[sync] 프론트엔드 robocopy 실패 (exit $frontendExit)"
    exit 4
}
Remove-Item (Join-Path $EmpFrontend ".next") -Recurse -Force -ErrorAction SilentlyContinue

# ---------------------------------------------------------------
# 6) DB 마이그레이션
# ---------------------------------------------------------------
Write-Host "[migrate] 실행 중..."
$migrateResult = Invoke-CheckedExternalCommand `
    -FilePath "py.exe" `
    -ArgumentList @("bootstrap_db.py", "--migrate") `
    -WorkingDirectory $EmpBackend
Write-CheckedCommandResult -Label "migrate" -Result $migrateResult
if (-not $migrateResult.Success) {
    Write-RecoveryInstructions -FailedStage "migrate" -ValidatedBackupPath $backupPath
    exit 5
}
Write-Host "[migrate] 완료"

# ---------------------------------------------------------------
# 7) 사후 DB 검증
# ---------------------------------------------------------------
Write-Host "[post-verify] 마이그레이션 후 DB 검증 중..."
$schemaCheckResult = Invoke-CheckedExternalCommand `
    -FilePath "py.exe" `
    -ArgumentList @("bootstrap_db.py", "--check") `
    -WorkingDirectory $EmpBackend
Write-CheckedCommandResult -Label "post-verify-alembic-head" -Result $schemaCheckResult
if (-not $schemaCheckResult.Success) {
    Write-Host "[post-verify] Alembic head 상태 검사 실패"
    Write-RecoveryInstructions -FailedStage "post-verify" -ValidatedBackupPath $backupPath
    exit 8
}

$verifyTool = Join-Path $EmpRoot "scripts\ops\_verify_backup.py"
$verifyResult = Invoke-CheckedExternalCommand -FilePath "py.exe" -ArgumentList @($verifyTool, $EmpDb)
Write-CheckedCommandResult -Label "post-verify-schema" -Result $verifyResult
if (-not $verifyResult.Success) {
    Write-Host "[post-verify] 스키마·SQLite 검증 실패"
    Write-RecoveryInstructions -FailedStage "post-verify" -ValidatedBackupPath $backupPath
    exit 8
}

$inventoryVerifyTool = Join-Path $EmpRoot "scripts\ops\check_inventory_integrity.py"
$inventoryDbUrl = "sqlite:///$($EmpDb.Replace('\', '/'))"
$inventoryVerifyResult = Invoke-CheckedExternalCommand `
    -FilePath "py.exe" `
    -ArgumentList @($inventoryVerifyTool, "--db-url", $inventoryDbUrl)
Write-CheckedCommandResult -Label "post-verify-inventory" -Result $inventoryVerifyResult
if (-not $inventoryVerifyResult.Success) {
    Write-Host "[post-verify] 재고 무결성 검증 실패"
    Write-RecoveryInstructions -FailedStage "post-verify" -ValidatedBackupPath $backupPath
    exit 8
}
Write-Host "[post-verify] 완료"

# ---------------------------------------------------------------
# 8) 서버 시작
# ---------------------------------------------------------------
Write-Host "[start] 직원 서버 재기동 중..."
$startResult = Restart-EmployeeServices
if (-not $startResult.Success) {
    Write-Host "[start] 실패: backend=$($startResult.Backend.Success) frontend=$($startResult.Frontend.Success)"
    exit 6
}

# ---------------------------------------------------------------
# 9) 헬스체크
# ---------------------------------------------------------------
Write-Host "[health] 백엔드(8010) 확인 중..."
$backendOk = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8010/health/live" -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $backendOk = $true; break }
    }
    catch {}
}

Write-Host "[health] 프론트(3000) 확인 중..."
$frontendOk = $false
for ($i = 0; $i -lt 240; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $frontendOk = $true; break }
    }
    catch {}
}

if (-not $backendOk -or -not $frontendOk) {
    Write-Host "[health] 실패 - backend=$backendOk frontend=$frontendOk"
    exit 6
}
Start-Process -FilePath (Join-Path $EmpRoot "watch.bat") -WindowStyle Normal

Write-Host "===================================================="
Write-Host " 동기화 완료"
Write-Host " 백엔드 robocopy exit  : $backendExit"
Write-Host " 프론트 robocopy exit  : $frontendExit"
Write-Host " 마이그레이션          : 성공"
Write-Host " 사후 검증             : 성공"
Write-Host " 헬스체크 8010/3000    : OK"
Write-Host " DB 백업               : $backupPath"
Write-Host " 접속 주소             : http://192.168.0.63:3000"
Write-Host "===================================================="
exit 0
