# scripts/dev/sync-from-employee-data.ps1
# 직원 업무 DB의 online snapshot을 현재 개발 코드로 migration/검증한 뒤 개발 DB에 반영한다.
# 기본값은 DryRun이며, C:\ERP\backend\mes.db 교체는 명시적인 -Apply에서만 수행한다.

[CmdletBinding()]
param(
    [switch] $DryRun,
    [switch] $Apply,
    [switch] $CrossSchemaDevelopmentSync,
    [string] $RollbackValidatorRoot,
    [string] $TrustedRollbackValidatorSha256,
    [string] $TrustedRollbackBackupToolSha256,
    [string] $PythonExecutable = "py.exe"
)

$ErrorActionPreference = "Stop"

$DevRoot = "C:\ERP"
$EmployeeRoot = "C:\ERP-dev"
$DevBackend = Join-Path $DevRoot "backend"
$EmployeeDb = Join-Path $EmployeeRoot "backend\mes.db"
$DevDb = Join-Path $DevBackend "mes.db"
$DevRuntimeRoot = Join-Path $DevRoot "_attic\runtime"
$StageRuntimeRoot = Join-Path $DevRuntimeRoot "employee-data-sync"
$BackupTool = Join-Path $DevRoot "scripts\ops\backup_db.py"
$RestoreTool = Join-Path $DevRoot "scripts\ops\restore_db.py"
$VerifyTool = Join-Path $DevRoot "scripts\ops\_verify_backup.py"
$InventoryTool = Join-Path $DevRoot "scripts\ops\check_inventory_integrity.py"
$CutoverTool = Join-Path $DevRoot "scripts\ops\friday_profile_cutover.py"
$BackendHealthAttempts = 6
$FrontendHealthAttempts = 240
$script:StagingCandidate = $null

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

function Test-ChildPath {
    param(
        [string] $Path,
        [string] $Parent
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $fullParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    return $fullPath.StartsWith($fullParent, [System.StringComparison]::OrdinalIgnoreCase)
}

function Set-EnvironmentValue {
    param(
        [string] $Name,
        [AllowNull()]
        [string] $Value
    )

    if ($null -eq $Value) {
        Remove-Item -LiteralPath "Env:$Name" -ErrorAction SilentlyContinue
    }
    else {
        [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
    }
}

function Invoke-DatabaseBackup {
    param(
        [string] $Database,
        [string] $RuntimeRoot,
        [string] $Label,
        [switch] $IntegrityOnly,
        [string] $ToolPath = $BackupTool
    )

    $previousRuntimeRoot = [Environment]::GetEnvironmentVariable("MES_RUNTIME_ROOT", "Process")
    try {
        $env:MES_RUNTIME_ROOT = $RuntimeRoot
        $arguments = @($ToolPath, "--sqlite", $Database)
        if ($IntegrityOnly) {
            $arguments += "--integrity-only"
        }
        $result = Invoke-CheckedExternalCommand `
            -FilePath $PythonExecutable `
            -ArgumentList $arguments
    }
    finally {
        Set-EnvironmentValue -Name "MES_RUNTIME_ROOT" -Value $previousRuntimeRoot
    }
    Write-CheckedCommandResult -Label "backup-$Label" -Result $result
    if (-not $result.Success) {
        return [pscustomobject] @{ Success = $false; Path = $null }
    }

    $output = ($result.Output | ForEach-Object { [string] $_ }) -join [Environment]::NewLine
    $match = [regex]::Match($output, '(?m)^BACKUP_PATH=(?<path>.+?)\s*$')
    if (-not $match.Success) {
        Write-Host "[backup-$Label] BACKUP_PATH 출력을 찾지 못했습니다."
        return [pscustomobject] @{ Success = $false; Path = $null }
    }

    $path = [System.IO.Path]::GetFullPath($match.Groups['path'].Value.Trim())
    $expectedRoot = Join-Path $RuntimeRoot "backups\sqlite"
    if (-not (Test-ChildPath -Path $path -Parent $expectedRoot) -or
        -not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Write-Host "[backup-$Label] 허용되지 않은 백업 경로: $path"
        return [pscustomobject] @{ Success = $false; Path = $null }
    }
    return [pscustomobject] @{ Success = $true; Path = $path }
}

function Invoke-DevelopmentSyncAdmission {
    param(
        [string] $Candidate,
        [string] $Rollback,
        [pscustomobject] $PinEvidence
    )

    $admissionDirectory = Join-Path $StageRuntimeRoot "admissions"
    New-Item -ItemType Directory -Force -Path $admissionDirectory | Out-Null
    $output = Join-Path $admissionDirectory "development-sync-$([guid]::NewGuid().ToString('N')).json"
    $arguments = @(
        $CutoverTool,
        "prepare-development-sync",
        "--candidate", $Candidate,
        "--rollback", $Rollback,
        "--target", $DevDb,
        "--rollback-validator-root", $PinEvidence.Root,
        "--candidate-validator-root", $DevRoot,
        "--trusted-rollback-validator-sha256", $PinEvidence.RollbackValidatorSha256,
        "--trusted-candidate-validator-sha256", $PinEvidence.CandidateValidatorSha256,
        "--output", $output
    )
    $result = Invoke-CheckedExternalCommand -FilePath $PythonExecutable -ArgumentList $arguments
    Write-CheckedCommandResult -Label "development-sync-admission" -Result $result
    if (-not $result.Success) {
        return [pscustomobject] @{ Success = $false; Path = $null; Sha256 = $null }
    }
    $receipt = Get-CheckedJsonOutput -Result $result
    $expectedPath = [System.IO.Path]::GetFullPath($output)
    if ($null -eq $receipt -or
        [string] $receipt.status -ne "ADMITTED" -or
        [System.IO.Path]::GetFullPath([string] $receipt.receipt) -ne $expectedPath -or
        [string] $receipt.receipt_sha256 -notmatch '^[0-9a-f]{64}$' -or
        -not (Test-Path -LiteralPath $expectedPath -PathType Leaf)) {
        Write-Host "[admission] 유효한 development sync receipt를 받지 못했습니다."
        return [pscustomobject] @{ Success = $false; Path = $null; Sha256 = $null }
    }
    return [pscustomobject] @{
        Success = $true
        Path = $expectedPath
        Sha256 = [string] $receipt.receipt_sha256
    }
}

function Remove-StagingDatabase {
    param([string] $Database)

    if (-not $Database -or -not (Test-ChildPath -Path $Database -Parent $StageRuntimeRoot)) {
        return
    }
    foreach ($suffix in @("", "-wal", "-shm", "-journal")) {
        Remove-Item -LiteralPath "$Database$suffix" -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-RestoreDatabase {
    param(
        [string] $Source,
        [string] $Target,
        [string] $PreverifiedRollback,
        [switch] $SourceIntegrityOnly,
        [switch] $Check,
        [string] $DevelopmentSyncAdmission,
        [string] $DevelopmentSyncAdmissionSha256,
        [switch] $DevelopmentSyncRecovery
    )

    $arguments = @($RestoreTool, "--sqlite", $Source, "--target", $Target)
    if ($PreverifiedRollback) {
        $arguments += @("--preverified-rollback", $PreverifiedRollback)
    }
    if ($SourceIntegrityOnly) {
        $arguments += "--source-integrity-only"
    }
    if ($Check) {
        $arguments += "--check"
    }
    if ($DevelopmentSyncAdmission -and $DevelopmentSyncAdmissionSha256) {
        $arguments += @(
            "--development-sync-admission", $DevelopmentSyncAdmission,
            "--development-sync-admission-sha256", $DevelopmentSyncAdmissionSha256
        )
    }
    if ($DevelopmentSyncRecovery) {
        $arguments += "--development-sync-recovery"
    }
    $result = Invoke-CheckedExternalCommand -FilePath $PythonExecutable -ArgumentList $arguments
    Write-CheckedCommandResult -Label "restore" -Result $result
    return $result
}

function Invoke-Bootstrap {
    param(
        [string] $Database,
        [ValidateSet("--migrate", "--check")]
        [string] $Mode,
        [string] $Label,
        [string] $RuntimeRoot
    )

    $previousDatabaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL", "Process")
    $previousRuntimeRoot = [Environment]::GetEnvironmentVariable("MES_RUNTIME_ROOT", "Process")
    try {
        $env:DATABASE_URL = "sqlite:///$($Database.Replace('\', '/'))"
        $env:MES_RUNTIME_ROOT = $RuntimeRoot
        $result = Invoke-CheckedExternalCommand `
            -FilePath $PythonExecutable `
            -ArgumentList @("bootstrap_db.py", $Mode) `
            -WorkingDirectory $DevBackend
    }
    finally {
        Set-EnvironmentValue -Name "DATABASE_URL" -Value $previousDatabaseUrl
        Set-EnvironmentValue -Name "MES_RUNTIME_ROOT" -Value $previousRuntimeRoot
    }
    Write-CheckedCommandResult -Label $Label -Result $result
    return $result
}

function Invoke-DatabaseVerification {
    param(
        [string] $Database,
        [string] $Phase,
        [string] $RuntimeRoot
    )

    $bootstrap = Invoke-Bootstrap `
        -Database $Database `
        -Mode "--check" `
        -Label "$Phase-bootstrap" `
        -RuntimeRoot $RuntimeRoot
    if (-not $bootstrap.Success) {
        return $false
    }

    $sqlite = Invoke-CheckedExternalCommand -FilePath $PythonExecutable -ArgumentList @($VerifyTool, "--database", $Database)
    Write-CheckedCommandResult -Label "$Phase-sqlite-fk" -Result $sqlite
    if (-not $sqlite.Success) {
        return $false
    }

    $databaseUrl = "sqlite:///$($Database.Replace('\', '/'))"
    $inventory = Invoke-CheckedExternalCommand `
        -FilePath $PythonExecutable `
        -ArgumentList @($InventoryTool, "--db-url", $databaseUrl)
    Write-CheckedCommandResult -Label "$Phase-inventory" -Result $inventory
    return [bool] $inventory.Success
}

function Invoke-DevelopmentServiceScript {
    param([string] $ScriptName)

    return Invoke-CheckedExternalCommand `
        -FilePath "powershell.exe" `
        -ArgumentList @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", (Join-Path $DevRoot "scripts\dev\$ScriptName")
        )
}

function Stop-DevelopmentServices {
    $backend = Invoke-DevelopmentServiceScript -ScriptName "stop-backend.ps1"
    Write-CheckedCommandResult -Label "stop-backend" -Result $backend
    $frontend = Invoke-DevelopmentServiceScript -ScriptName "stop-frontend.ps1"
    Write-CheckedCommandResult -Label "stop-frontend" -Result $frontend
    $portsFree = $false
    if ($backend.Success -and $frontend.Success) {
        $portsFree = (Test-TcpPortFree -Port 8011) -and (Test-TcpPortFree -Port 3001)
    }
    return [pscustomobject] @{
        Success = ($backend.Success -and $frontend.Success -and $portsFree)
        Backend = $backend
        Frontend = $frontend
        PortsFree = $portsFree
    }
}

function Start-DevelopmentServices {
    $backend = Invoke-DevelopmentServiceScript -ScriptName "start-backend.ps1"
    Write-CheckedCommandResult -Label "start-backend" -Result $backend
    $frontend = Invoke-DevelopmentServiceScript -ScriptName "start-frontend.ps1"
    Write-CheckedCommandResult -Label "start-frontend" -Result $frontend
    return [pscustomobject] @{
        Success = ($backend.Success -and $frontend.Success)
        Backend = $backend
        Frontend = $frontend
    }
}

function Test-HttpEndpoint {
    param(
        [string] $Uri,
        [int] $Attempts,
        [int] $TimeoutSec
    )

    $lastFailure = "no successful response"
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            $response = Invoke-WebRequest `
                -Uri $Uri `
                -TimeoutSec $TimeoutSec `
                -UseBasicParsing `
                -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                return $true
            }
            $lastFailure = "HTTP $($response.StatusCode)"
        }
        catch { $lastFailure = $_.Exception.GetType().FullName }
    }
    Write-Host "[health] endpoint=$Uri attempts=$Attempts error=$lastFailure"
    return $false
}

function Get-CheckedJsonOutput {
    param([pscustomobject] $Result)

    for ($index = $Result.Output.Count - 1; $index -ge 0; $index--) {
        try {
            return ([string] $Result.Output[$index] | ConvertFrom-Json -ErrorAction Stop)
        }
        catch { }
    }
    return $null
}

function Get-Sha256 {
    param([string] $Path)

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
        }
        finally {
            $sha256.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Invoke-ValidatorBundleHash {
    param([string] $Root)

    $result = Invoke-CheckedExternalCommand `
        -FilePath $PythonExecutable `
        -ArgumentList @($CutoverTool, "hash-validator", "--root", $Root)
    Write-CheckedCommandResult -Label "validator-hash" -Result $result
    if (-not $result.Success) {
        return $null
    }
    return Get-CheckedJsonOutput -Result $result
}

function Test-DevelopmentSyncPins {
    $root = [System.IO.Path]::GetFullPath($RollbackValidatorRoot)
    $employee = [System.IO.Path]::GetFullPath($EmployeeRoot)
    if ($root.Equals($employee, [System.StringComparison]::OrdinalIgnoreCase) -or
        (Test-ChildPath -Path $root -Parent $employee)) {
        Write-Host "[pin] 직원 코드 경로는 rollback validator로 사용할 수 없습니다: $root"
        return $null
    }
    $backupTool = Join-Path $root "scripts\ops\backup_db.py"
    if (-not (Test-Path -LiteralPath $backupTool -PathType Leaf)) {
        Write-Host "[pin] rollback backup tool을 찾을 수 없습니다: $backupTool"
        return $null
    }
    if ($TrustedRollbackBackupToolSha256 -notmatch '^[0-9a-fA-F]{64}$' -or
        $TrustedRollbackValidatorSha256 -notmatch '^[0-9a-fA-F]{64}$') {
        Write-Host "[pin] 신뢰 SHA-256 형식이 잘못되었습니다."
        return $null
    }
    $actualBackupToolHash = Get-Sha256 -Path $backupTool
    if ($actualBackupToolHash -ne $TrustedRollbackBackupToolSha256.ToLowerInvariant()) {
        Write-Host "[pin] rollback backup tool SHA-256 불일치"
        return $null
    }
    $rollbackBundle = Invoke-ValidatorBundleHash -Root $root
    if ($null -eq $rollbackBundle -or
        [string] $rollbackBundle.root -ne $root -or
        [string] $rollbackBundle.validator_bundle_sha256 -ne $TrustedRollbackValidatorSha256.ToLowerInvariant()) {
        Write-Host "[pin] rollback validator bundle SHA-256 불일치"
        return $null
    }
    $candidateBundle = Invoke-ValidatorBundleHash -Root $DevRoot
    if ($null -eq $candidateBundle -or
        [string] $candidateBundle.root -ne [System.IO.Path]::GetFullPath($DevRoot) -or
        [string] $candidateBundle.validator_bundle_sha256 -notmatch '^[0-9a-f]{64}$') {
        Write-Host "[pin] candidate validator bundle 확인 실패"
        return $null
    }
    return [pscustomobject] @{
        Root = $root
        BackupTool = $backupTool
        RollbackValidatorSha256 = $TrustedRollbackValidatorSha256.ToLowerInvariant()
        CandidateValidatorSha256 = [string] $candidateBundle.validator_bundle_sha256
    }
}

function Confirm-DevelopmentSyncPins {
    param([pscustomobject] $Expected)

    $current = Test-DevelopmentSyncPins
    if ($null -eq $current -or
        $current.Root -ne $Expected.Root -or
        $current.BackupTool -ne $Expected.BackupTool -or
        $current.RollbackValidatorSha256 -ne $Expected.RollbackValidatorSha256 -or
        $current.CandidateValidatorSha256 -ne $Expected.CandidateValidatorSha256) {
        Write-Host "[pin] 작업 중 validator 또는 backup tool 핀이 변경되었습니다."
        return $false
    }
    return $true
}

function Test-DevelopmentHealth {
    # Readiness includes a full integrity diagnostic. A short client timeout
    # leaves that work running while retries queue more copies of the same work.
    $backend = Test-HttpEndpoint `
        -Uri "http://127.0.0.1:8011/health/ready" `
        -Attempts $BackendHealthAttempts `
        -TimeoutSec 10
    $frontend = Test-HttpEndpoint `
        -Uri "http://127.0.0.1:3001/mes" `
        -Attempts $FrontendHealthAttempts `
        -TimeoutSec 2
    Write-Host "SYNC_DATA_HEALTH_BACKEND=$(if ($backend) { 'OK' } else { 'FAILED' })"
    Write-Host "SYNC_DATA_HEALTH_FRONTEND=$(if ($frontend) { 'OK' } else { 'FAILED' })"
    return [pscustomobject] @{
        Success = ($backend -and $frontend)
        Backend = $backend
        Frontend = $frontend
    }
}

function Invoke-DevelopmentSchemaPreparation {
    param([bool] $ApplyChanges)

    $tool = Join-Path $DevRoot "scripts\ops\development_schema_prepare.py"
    Write-Host "SYNC_DEV_PREP_PHASE=PRE_STOP"
    $probe = Invoke-CheckedExternalCommand -FilePath $PythonExecutable `
        -ArgumentList @($tool, "probe", "--root", $DevRoot)
    Write-CheckedCommandResult -Label "development-schema-probe" -Result $probe
    $state = Get-CheckedJsonOutput -Result $probe
    if (-not $probe.Success -or $null -eq $state) { return $false }
    if (-not $state.needs_migration) { return $true }

    $rehearsal = Invoke-CheckedExternalCommand -FilePath $PythonExecutable `
        -ArgumentList @($tool, "rehearse", "--root", $DevRoot)
    Write-CheckedCommandResult -Label "development-schema-rehearsal" -Result $rehearsal
    if (-not $rehearsal.Success) { return $false }
    if (-not $ApplyChanges) { return $true }

    $stop = Stop-DevelopmentServices
    if (-not $stop.Success) {
        Write-Host "SYNC_DEV_PREP_RESULT=STOP_FAILED"
        return $false
    }
    Write-Host "SYNC_DEV_PREP_PHASE=POST_STOP"
    $apply = Invoke-CheckedExternalCommand -FilePath $PythonExecutable `
        -ArgumentList @($tool, "apply-stopped", "--root", $DevRoot)
    Write-CheckedCommandResult -Label "development-schema-apply" -Result $apply
    if (-not $apply.Success) {
        Write-Host "SYNC_DEV_PREP_RESULT=APPLY_FAILED"
        Write-Host "SYNC_DATA_RECOVERY=NOT_ATTEMPTED"
        Write-Host "SYNC_DATA_RECOVERY_HEALTH=STOPPED"
        return $false
    }
    $start = Start-DevelopmentServices
    if (-not $start.Success) { return $false }
    $health = Test-DevelopmentHealth
    if (-not $health.Success) { return $false }
    Write-Host "SYNC_DEV_PREP_RESULT=APPLIED"
    return $true
}

function Invoke-DevelopmentRecovery {
    param(
        [string] $BackupPath,
        [bool] $StopBeforeRestore,
        [string] $DevelopmentSyncAdmission,
        [string] $DevelopmentSyncAdmissionSha256,
        [switch] $KeepStopped
    )

    $stopSuccess = $true
    if ($StopBeforeRestore) {
        $stop = Stop-DevelopmentServices
        $stopSuccess = $stop.Success
    }

    $restoreSuccess = $false
    if ($stopSuccess) {
        $previousRuntimeRoot = [Environment]::GetEnvironmentVariable("MES_RUNTIME_ROOT", "Process")
        try {
            $env:MES_RUNTIME_ROOT = $DevRuntimeRoot
            if ($DevelopmentSyncAdmission) {
                $restore = Invoke-RestoreDatabase `
                    -Source $BackupPath `
                    -Target $DevDb `
                    -PreverifiedRollback $BackupPath `
                    -DevelopmentSyncAdmission $DevelopmentSyncAdmission `
                    -DevelopmentSyncAdmissionSha256 $DevelopmentSyncAdmissionSha256 `
                    -DevelopmentSyncRecovery
            }
            else {
                $restore = Invoke-RestoreDatabase `
                    -Source $BackupPath `
                    -Target $DevDb `
                    -PreverifiedRollback $BackupPath `
                    -Check
            }
            $restoreSuccess = $restore.Success
        }
        finally {
            Set-EnvironmentValue -Name "MES_RUNTIME_ROOT" -Value $previousRuntimeRoot
        }
    }

    if ($KeepStopped) {
        $start = [pscustomobject] @{ Success = $true }
        $health = [pscustomobject] @{ Success = $true; Backend = $false; Frontend = $false }
    }
    else {
        $start = Start-DevelopmentServices
        $health = if ($start.Success) {
            Test-DevelopmentHealth
        }
        else {
            [pscustomobject] @{ Success = $false; Backend = $false; Frontend = $false }
        }
    }
    $success = $stopSuccess -and $restoreSuccess -and $start.Success -and $health.Success
    Write-Host "SYNC_DATA_RECOVERY=$(if ($success) { 'SUCCESS' } else { 'FAILED' })"
    $recoveryHealth = if ($KeepStopped) {
        if ($stopSuccess) { "STOPPED" } else { "FAILED" }
    }
    elseif ($health.Success) {
        "OK"
    }
    else {
        "FAILED"
    }
    Write-Host "SYNC_DATA_RECOVERY_HEALTH=$recoveryHealth"
    Write-Host "SYNC_DATA_BACKUP=$BackupPath"
    return [pscustomobject] @{
        Success = $success
        Restore = $restoreSuccess
        Start = $start.Success
        Health = $health.Success
    }
}

function Invoke-EmployeeDataSync {
    if ($Apply -and $DryRun) {
        Write-Host "[args] -Apply와 -DryRun은 함께 사용할 수 없습니다."
        Write-Host "SYNC_DATA_RESULT=INVALID_ARGUMENTS"
        return 2
    }

    $hasDevelopmentSyncPins = [bool] (
        $RollbackValidatorRoot -or
        $TrustedRollbackValidatorSha256 -or
        $TrustedRollbackBackupToolSha256
    )
    if ($CrossSchemaDevelopmentSync) {
        if (-not $Apply -or
            -not $RollbackValidatorRoot -or
            -not $TrustedRollbackValidatorSha256 -or
            -not $TrustedRollbackBackupToolSha256) {
            Write-Host "[args] cross-schema development sync는 -Apply와 세 개의 rollback 핀이 모두 필요합니다."
            Write-Host "SYNC_DATA_RESULT=INVALID_ARGUMENTS"
            return 2
        }
        $pinEvidence = Test-DevelopmentSyncPins
        if ($null -eq $pinEvidence) {
            Write-Host "SYNC_DATA_RESULT=ROLLBACK_PIN_FAILED"
            return 2
        }
        Write-Host "SYNC_DATA_PROFILE=CROSS_SCHEMA_DEVELOPMENT_SYNC"
    }
    elseif ($hasDevelopmentSyncPins) {
        Write-Host "[args] rollback 핀은 -CrossSchemaDevelopmentSync와 함께 사용해야 합니다."
        Write-Host "SYNC_DATA_RESULT=INVALID_ARGUMENTS"
        return 2
    }

    $isApply = [bool] $Apply
    Write-Host "SYNC_DATA_MODE=$(if ($isApply) { 'APPLY' } else { 'DRY_RUN' })"
    if (-not (Test-Path -LiteralPath $EmployeeDb -PathType Leaf)) {
        Write-Host "[source] 직원 DB를 찾을 수 없습니다: $EmployeeDb"
        Write-Host "SYNC_DATA_RESULT=SOURCE_SNAPSHOT_FAILED"
        return 10
    }
    if ($isApply -and -not (Test-Path -LiteralPath $DevDb -PathType Leaf)) {
        Write-Host "[target] 개발 DB를 찾을 수 없습니다: $DevDb"
        Write-Host "SYNC_DATA_RESULT=TARGET_BACKUP_FAILED"
        return 13
    }

    New-Item -ItemType Directory -Force -Path $StageRuntimeRoot | Out-Null
    Write-Host "[snapshot] 직원 DB online backup 생성 중..."
    $sourceSnapshot = Invoke-DatabaseBackup `
        -Database $EmployeeDb `
        -RuntimeRoot $StageRuntimeRoot `
        -Label "employee-data-source" `
        -IntegrityOnly
    if (-not $sourceSnapshot.Success) {
        Write-Host "SYNC_DATA_RESULT=SOURCE_SNAPSHOT_FAILED"
        return 10
    }

    $candidateDirectory = Join-Path $StageRuntimeRoot "staging"
    New-Item -ItemType Directory -Force -Path $candidateDirectory | Out-Null
    $candidate = Join-Path $candidateDirectory "mes_candidate_$([guid]::NewGuid().ToString('N')).db"
    $script:StagingCandidate = $candidate
    $prepare = Invoke-RestoreDatabase `
        -Source $sourceSnapshot.Path `
        -Target $candidate `
        -SourceIntegrityOnly
    if (-not $prepare.Success) {
        Write-Host "SYNC_DATA_RESULT=STAGING_PREPARE_FAILED"
        return 10
    }

    Write-Host "[staging] 현재 개발 코드 migration 적용 중..."
    $migration = Invoke-Bootstrap `
        -Database $candidate `
        -Mode "--migrate" `
        -Label "staging-migrate" `
        -RuntimeRoot $StageRuntimeRoot
    if (-not $migration.Success) {
        Write-Host "SYNC_DATA_RESULT=STAGING_MIGRATION_FAILED"
        return 11
    }
    if (-not (Invoke-DatabaseVerification -Database $candidate -Phase "staging" -RuntimeRoot $StageRuntimeRoot)) {
        Write-Host "SYNC_DATA_RESULT=STAGING_VERIFICATION_FAILED"
        return 12
    }

    Write-Host "[staging] 검증된 후보 DB backup-manifest/v1 발행 중..."
    $verifiedCandidate = Invoke-DatabaseBackup `
        -Database $candidate `
        -RuntimeRoot $StageRuntimeRoot `
        -Label "employee-data-candidate"
    if (-not $verifiedCandidate.Success) {
        Write-Host "SYNC_DATA_RESULT=STAGING_VERIFICATION_FAILED"
        return 12
    }

    Write-Host "SYNC_DATA_SOURCE_SNAPSHOT=$($sourceSnapshot.Path)"
    Write-Host "SYNC_DATA_STAGING=$($verifiedCandidate.Path)"
    Write-Host "SYNC_DATA_SOURCE_MUTATION=NONE"
    if (-not $CrossSchemaDevelopmentSync) {
        if (-not (Invoke-DevelopmentSchemaPreparation -ApplyChanges $isApply)) {
            Write-Host "SYNC_DATA_RESULT=TARGET_SCHEMA_PREPARATION_FAILED"
            return 13
        }
    }
    if (-not $isApply) {
        Write-Host "[dry-run] 개발 DB와 8011/3001 서비스를 변경하지 않았습니다."
        Write-Host "SYNC_DATA_RESULT=VERIFIED"
        return 0
    }

    Write-Host "[backup] 현재 개발 DB online backup 생성 중..."
    if ($CrossSchemaDevelopmentSync -and -not (Confirm-DevelopmentSyncPins -Expected $pinEvidence)) {
        Write-Host "SYNC_DATA_RESULT=ROLLBACK_PIN_CHANGED"
        return 13
    }
    $targetBackupTool = if ($CrossSchemaDevelopmentSync) { $pinEvidence.BackupTool } else { $BackupTool }
    $targetBackup = Invoke-DatabaseBackup `
        -Database $DevDb `
        -RuntimeRoot $DevRuntimeRoot `
        -Label "employee-data-rollback" `
        -ToolPath $targetBackupTool
    if (-not $targetBackup.Success) {
        Write-Host "SYNC_DATA_RESULT=TARGET_BACKUP_FAILED"
        return 13
    }
    Write-Host "SYNC_DATA_BACKUP_BEFORE_STOP=$($targetBackup.Path)"

    Write-Host "[stop] 개발 서비스 8011/3001 정지 중..."
    $stop = Stop-DevelopmentServices
    if (-not $stop.Success) {
        Write-Host "[stop] 개발 서비스 정지 확인 실패 - DB는 교체하지 않습니다."
        if ($CrossSchemaDevelopmentSync) {
            $health = [pscustomobject] @{ Success = $true }
        }
        else {
            $restart = Start-DevelopmentServices
            $health = if ($restart.Success) {
                Test-DevelopmentHealth
            }
            else {
                [pscustomobject] @{ Success = $false; Backend = $false; Frontend = $false }
            }
        }
        Write-Host "SYNC_DATA_RECOVERY=NOT_NEEDED"
        Write-Host "SYNC_DATA_RECOVERY_HEALTH=$(if ($CrossSchemaDevelopmentSync) { 'FAILED' } elseif ($health.Success) { 'OK' } else { 'FAILED' })"
        Write-Host "SYNC_DATA_RESULT=STOP_FAILED"
        return 14
    }

    # Shutdown may checkpoint/delete WAL without changing logical data. Keep the
    # online backup, but bind the restore guard and recovery to the stopped DB.
    Write-Host "[backup] 정지된 개발 DB의 교체·복구 기준 백업 검증 중..."
    try {
        if ($CrossSchemaDevelopmentSync -and -not (Confirm-DevelopmentSyncPins -Expected $pinEvidence)) {
            throw "stopped backup 직전 rollback pin 재검증 실패"
        }
        $cutoverBackup = Invoke-DatabaseBackup `
            -Database $DevDb `
            -RuntimeRoot $DevRuntimeRoot `
            -Label "employee-data-cutover" `
            -ToolPath $targetBackupTool
    }
    catch {
        Write-Host "[backup] 정지 후 백업 실패: $($_.Exception.Message)"
        $cutoverBackup = [pscustomobject] @{ Success = $false; Path = $null }
    }
    if (-not $cutoverBackup.Success) {
        if ($CrossSchemaDevelopmentSync) {
            $health = [pscustomobject] @{ Success = $true }
        }
        else {
            $restart = Start-DevelopmentServices
            $health = if ($restart.Success) {
                Test-DevelopmentHealth
            }
            else {
                [pscustomobject] @{ Success = $false; Backend = $false; Frontend = $false }
            }
        }
        Write-Host "SYNC_DATA_RECOVERY=NOT_NEEDED"
        Write-Host "SYNC_DATA_RECOVERY_HEALTH=$(if ($CrossSchemaDevelopmentSync) { 'STOPPED' } elseif ($health.Success) { 'OK' } else { 'FAILED' })"
        Write-Host "SYNC_DATA_RESULT=TARGET_CUTOVER_BACKUP_FAILED"
        return 13
    }
    $targetBackup = $cutoverBackup
    Write-Host "SYNC_DATA_CUTOVER_BACKUP=$($targetBackup.Path)"
    Write-Host "SYNC_DATA_BACKUP=$($targetBackup.Path)"

    $developmentAdmissionPath = $null
    $developmentAdmissionSha256 = $null
    if ($CrossSchemaDevelopmentSync) {
        $developmentAdmission = Invoke-DevelopmentSyncAdmission `
            -Candidate $verifiedCandidate.Path `
            -Rollback $targetBackup.Path `
            -PinEvidence $pinEvidence
        if (-not $developmentAdmission.Success) {
            Write-Host "SYNC_DATA_RECOVERY=NOT_NEEDED"
            Write-Host "SYNC_DATA_RECOVERY_HEALTH=STOPPED"
            Write-Host "SYNC_DATA_RESULT=ADMISSION_FAILED"
            return 13
        }
        $developmentAdmissionPath = $developmentAdmission.Path
        $developmentAdmissionSha256 = $developmentAdmission.Sha256
        Write-Host "SYNC_DATA_ADMISSION=$developmentAdmissionPath"
        Write-Host "SYNC_DATA_ADMISSION_SHA256=$developmentAdmissionSha256"
    }

    try {
        $previousRuntimeRoot = [Environment]::GetEnvironmentVariable("MES_RUNTIME_ROOT", "Process")
        try {
            $env:MES_RUNTIME_ROOT = $DevRuntimeRoot
            $install = Invoke-RestoreDatabase `
                -Source $verifiedCandidate.Path `
                -Target $DevDb `
                -PreverifiedRollback $targetBackup.Path `
                -DevelopmentSyncAdmission $developmentAdmissionPath `
                -DevelopmentSyncAdmissionSha256 $developmentAdmissionSha256
        }
        finally {
            Set-EnvironmentValue -Name "MES_RUNTIME_ROOT" -Value $previousRuntimeRoot
        }
        if (-not $install.Success) {
            if ($install.ExitCode -eq 3) {
                if ($CrossSchemaDevelopmentSync) {
                    $restartHealth = [pscustomobject] @{ Success = $true }
                }
                else {
                    $restart = Start-DevelopmentServices
                    $restartHealth = if ($restart.Success) {
                        Test-DevelopmentHealth
                    }
                    else {
                        [pscustomobject] @{ Success = $false; Backend = $false; Frontend = $false }
                    }
                }
                Write-Host "SYNC_DATA_RECOVERY=NOT_NEEDED"
                Write-Host "SYNC_DATA_RECOVERY_HEALTH=$(if ($CrossSchemaDevelopmentSync) { 'STOPPED' } elseif ($restartHealth.Success) { 'OK' } else { 'FAILED' })"
                Write-Host "SYNC_DATA_RESULT=TARGET_CHANGED_AFTER_BACKUP"
                return 15
            }
            Invoke-DevelopmentRecovery `
                -BackupPath $targetBackup.Path `
                -StopBeforeRestore $false `
                -DevelopmentSyncAdmission $developmentAdmissionPath `
                -DevelopmentSyncAdmissionSha256 $developmentAdmissionSha256 `
                -KeepStopped:$CrossSchemaDevelopmentSync | Out-Null
            Write-Host "SYNC_DATA_RESULT=INSTALL_FAILED"
            return 15
        }

        if (-not (Invoke-DatabaseVerification -Database $DevDb -Phase "post" -RuntimeRoot $DevRuntimeRoot)) {
            Invoke-DevelopmentRecovery `
                -BackupPath $targetBackup.Path `
                -StopBeforeRestore $false `
                -DevelopmentSyncAdmission $developmentAdmissionPath `
                -DevelopmentSyncAdmissionSha256 $developmentAdmissionSha256 `
                -KeepStopped:$CrossSchemaDevelopmentSync | Out-Null
            Write-Host "SYNC_DATA_RESULT=POSTCHECK_FAILED"
            return 16
        }

        $start = Start-DevelopmentServices
        if (-not $start.Success) {
            Invoke-DevelopmentRecovery `
                -BackupPath $targetBackup.Path `
                -StopBeforeRestore $true `
                -DevelopmentSyncAdmission $developmentAdmissionPath `
                -DevelopmentSyncAdmissionSha256 $developmentAdmissionSha256 `
                -KeepStopped:$CrossSchemaDevelopmentSync | Out-Null
            Write-Host "SYNC_DATA_RESULT=START_FAILED"
            return 17
        }
        $health = Test-DevelopmentHealth
        if (-not $health.Success) {
            Write-Host "[health] 실패 - backend=$($health.Backend) frontend=$($health.Frontend)"
            Invoke-DevelopmentRecovery `
                -BackupPath $targetBackup.Path `
                -StopBeforeRestore $true `
                -DevelopmentSyncAdmission $developmentAdmissionPath `
                -DevelopmentSyncAdmissionSha256 $developmentAdmissionSha256 `
                -KeepStopped:$CrossSchemaDevelopmentSync | Out-Null
            Write-Host "SYNC_DATA_RESULT=HEALTH_FAILED"
            return 17
        }
    }
    catch {
        Write-Host "[apply] 예외: $($_.Exception.Message)"
        Invoke-DevelopmentRecovery `
            -BackupPath $targetBackup.Path `
            -StopBeforeRestore $true `
            -DevelopmentSyncAdmission $developmentAdmissionPath `
            -DevelopmentSyncAdmissionSha256 $developmentAdmissionSha256 `
            -KeepStopped:$CrossSchemaDevelopmentSync | Out-Null
        Write-Host "SYNC_DATA_RESULT=APPLY_FAILED"
        return 18
    }

    Write-Host "SYNC_DATA_HEALTH=OK"
    Write-Host "SYNC_DATA_RESULT=APPLIED"
    Write-Host "SYNC_DATA_BACKUP=$($targetBackup.Path)"
    return 0
}

try {
    $exitCode = Invoke-EmployeeDataSync
}
catch {
    Write-Host "[fatal] $($_.Exception.Message)"
    Write-Host "SYNC_DATA_RESULT=FAILED"
    $exitCode = 18
}
finally {
    Remove-StagingDatabase -Database $script:StagingCandidate
}
exit $exitCode
