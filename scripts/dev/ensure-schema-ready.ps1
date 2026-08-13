# Check or interactively prepare the current profile database before server startup.

param(
    [ValidateSet("Start", "Report")]
    [string] $Mode = "Start"
)

$ErrorActionPreference = "Stop"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
$RepoRoot = $Profile.RepoRoot
$BackendDir = Join-Path $RepoRoot "backend"
$DatabasePath = Join-Path $BackendDir "mes.db"
$StopServersScript = Join-Path $RepoRoot "scripts\dev\stop-servers.ps1"
$BackupTool = Join-Path $RepoRoot "scripts\ops\backup_db.py"
$SchemaVerifyTool = Join-Path $RepoRoot "scripts\ops\_verify_backup.py"
$InventoryVerifyTool = Join-Path $RepoRoot "scripts\ops\check_inventory_integrity.py"
$RestoreTool = Join-Path $RepoRoot "scripts\ops\restore_db.py"

. (Join-Path $PSScriptRoot "checked-command.ps1")
. (Join-Path $PSScriptRoot "runtime-paths.ps1")

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

function Invoke-BackendBootstrap {
    param([string] $Command)

    return Invoke-CheckedExternalCommand `
        -FilePath "py.exe" `
        -ArgumentList @("bootstrap_db.py", $Command) `
        -WorkingDirectory $BackendDir
}

function Resolve-VerifiedBackupPath {
    param([pscustomobject] $BackupResult)

    $output = ($BackupResult.Output | ForEach-Object { [string] $_ }) -join [Environment]::NewLine
    $match = [regex]::Match($output, '(?m)^BACKUP_PATH=(?<path>.+?)\s*$')
    if (-not $match.Success) {
        return $null
    }

    $path = [System.IO.Path]::GetFullPath($match.Groups['path'].Value.Trim())
    $backupDir = Get-MesRuntimePath -RepoRoot $RepoRoot -RelativePath "backups\sqlite"
    $prefix = $backupDir.TrimEnd('\') + '\'
    if (-not $path.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-Path -LiteralPath $path -PathType Leaf)) {
        return $null
    }
    return $path
}

function Write-RecoveryInstructions {
    param(
        [string] $FailedStage,
        [string] $ValidatedBackupPath
    )

    Write-Host "[$FailedStage] 서버를 재기동하지 않습니다. DB를 자동 복원하지 않았습니다."
    if ([string]::IsNullOrWhiteSpace($ValidatedBackupPath)) {
        Write-Host "[$FailedStage] 검증된 새 백업 경로를 확인하지 못했습니다."
        return
    }
    Write-Host "[$FailedStage] 검증된 백업: $ValidatedBackupPath"
    Write-Host "[$FailedStage] 검토 후 다음 명령으로 수동 복원하세요:"
    Write-Host "  py `"$RestoreTool`" --sqlite `"$ValidatedBackupPath`" --target `"$DatabasePath`" --check"
}

function Exit-PreparationFailure {
    param(
        [string] $FailedStage,
        [string] $ValidatedBackupPath
    )

    Write-RecoveryInstructions -FailedStage $FailedStage -ValidatedBackupPath $ValidatedBackupPath
    exit 1
}

Write-Host "[schema] $($Profile.Label) DB 준비 상태 확인 중..."
$schemaCheck = Invoke-BackendBootstrap -Command "--check"
Write-CheckedCommandResult -Label "schema-check" -Result $schemaCheck
if ($schemaCheck.Success) {
    Write-Host "[schema] 최신 상태입니다."
    exit 0
}

if ($Mode -eq "Report") {
    Write-Host "[schema] 업데이트가 필요하거나 DB 상태를 확인할 수 없습니다. start.bat에서 준비를 실행하세요."
    exit 0
}

Write-Host ""
Write-Host "[schema] 서버 시작 전 DB 마이그레이션이 필요합니다."
Write-Host "[schema] Y를 입력하면 서버를 중지하고 검증 백업 후 업데이트합니다."
$confirmation = Read-Host "[schema] DB 업데이트를 진행할까요? (Y/N, 기본 N)"
if ($confirmation -notmatch '^[Yy]$') {
    Write-Host "[schema] 업데이트를 취소했습니다. 서버를 시작하지 않습니다."
    exit 1
}

Write-Host "[schema] 기존 서버 중지 중..."
$stopResult = Invoke-CheckedExternalCommand `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $StopServersScript) `
    -WorkingDirectory $RepoRoot
Write-CheckedCommandResult -Label "stop" -Result $stopResult
if (-not $stopResult.Success) {
    Exit-PreparationFailure -FailedStage "stop" -ValidatedBackupPath $null
}

Write-Host "[schema] DB 백업·검증 중..."
$backupResult = Invoke-CheckedExternalCommand `
    -FilePath "py.exe" `
    -ArgumentList @($BackupTool, "--sqlite", $DatabasePath, "--label", "startup-schema-migration") `
    -WorkingDirectory $RepoRoot
Write-CheckedCommandResult -Label "backup" -Result $backupResult
if (-not $backupResult.Success) {
    Exit-PreparationFailure -FailedStage "backup" -ValidatedBackupPath $null
}

$backupPath = Resolve-VerifiedBackupPath -BackupResult $backupResult
if (-not $backupPath) {
    Exit-PreparationFailure -FailedStage "backup" -ValidatedBackupPath $null
}
Write-Host "[schema] 검증된 백업: $backupPath"

Write-Host "[schema] 마이그레이션 실행 중..."
$migrateResult = Invoke-BackendBootstrap -Command "--migrate"
Write-CheckedCommandResult -Label "migrate" -Result $migrateResult
if (-not $migrateResult.Success) {
    Exit-PreparationFailure -FailedStage "migrate" -ValidatedBackupPath $backupPath
}

Write-Host "[schema] 마이그레이션 후 스키마 확인 중..."
$postCheck = Invoke-BackendBootstrap -Command "--check"
Write-CheckedCommandResult -Label "post-verify-alembic-head" -Result $postCheck
if (-not $postCheck.Success) {
    Exit-PreparationFailure -FailedStage "post-verify" -ValidatedBackupPath $backupPath
}

$schemaVerifyResult = Invoke-CheckedExternalCommand `
    -FilePath "py.exe" `
    -ArgumentList @($SchemaVerifyTool, $DatabasePath) `
    -WorkingDirectory $RepoRoot
Write-CheckedCommandResult -Label "post-verify-schema" -Result $schemaVerifyResult
if (-not $schemaVerifyResult.Success) {
    Exit-PreparationFailure -FailedStage "post-verify" -ValidatedBackupPath $backupPath
}

$databaseUrl = "sqlite:///$($DatabasePath.Replace('\', '/'))"
$inventoryVerifyResult = Invoke-CheckedExternalCommand `
    -FilePath "py.exe" `
    -ArgumentList @($InventoryVerifyTool, "--db-url", $databaseUrl) `
    -WorkingDirectory $RepoRoot
Write-CheckedCommandResult -Label "post-verify-inventory" -Result $inventoryVerifyResult
if (-not $inventoryVerifyResult.Success) {
    Exit-PreparationFailure -FailedStage "post-verify" -ValidatedBackupPath $backupPath
}

Write-Host "[schema] DB 준비 완료. 서버를 시작합니다."
exit 0
