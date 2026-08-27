# scripts/dev/sync-from-employee-data.ps1
# 직원 업무 DB의 online snapshot을 현재 개발 코드로 migration/검증한 뒤 개발 DB에 반영한다.
# 기본값은 DryRun이며, C:\ERP\backend\mes.db 교체는 명시적인 -Apply에서만 수행한다.

[CmdletBinding()]
param(
    [switch] $DryRun,
    [switch] $Apply
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
$BackendHealthAttempts = 60
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
        [switch] $IntegrityOnly
    )

    $previousRuntimeRoot = [Environment]::GetEnvironmentVariable("MES_RUNTIME_ROOT", "Process")
    try {
        $env:MES_RUNTIME_ROOT = $RuntimeRoot
        $arguments = @($BackupTool, "--sqlite", $Database)
        if ($IntegrityOnly) {
            $arguments += "--integrity-only"
        }
        $result = Invoke-CheckedExternalCommand `
            -FilePath "py.exe" `
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
        [switch] $Check
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
    $result = Invoke-CheckedExternalCommand -FilePath "py.exe" -ArgumentList $arguments
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
            -FilePath "py.exe" `
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

    $sqlite = Invoke-CheckedExternalCommand -FilePath "py.exe" -ArgumentList @($VerifyTool, $Database)
    Write-CheckedCommandResult -Label "$Phase-sqlite-fk" -Result $sqlite
    if (-not $sqlite.Success) {
        return $false
    }

    $databaseUrl = "sqlite:///$($Database.Replace('\', '/'))"
    $inventory = Invoke-CheckedExternalCommand `
        -FilePath "py.exe" `
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
        [int] $Attempts
    )

    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            $response = Invoke-WebRequest `
                -Uri $Uri `
                -TimeoutSec 1 `
                -UseBasicParsing `
                -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                return $true
            }
        }
        catch {}
    }
    return $false
}

function Test-DevelopmentHealth {
    $backend = Test-HttpEndpoint `
        -Uri "http://127.0.0.1:8011/health/live" `
        -Attempts $BackendHealthAttempts
    $frontend = Test-HttpEndpoint `
        -Uri "http://127.0.0.1:3001" `
        -Attempts $FrontendHealthAttempts
    return [pscustomobject] @{
        Success = ($backend -and $frontend)
        Backend = $backend
        Frontend = $frontend
    }
}

function Invoke-DevelopmentRecovery {
    param(
        [string] $BackupPath,
        [bool] $StopBeforeRestore
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
            $restore = Invoke-RestoreDatabase `
                -Source $BackupPath `
                -Target $DevDb `
                -PreverifiedRollback $BackupPath `
                -Check
            $restoreSuccess = $restore.Success
        }
        finally {
            Set-EnvironmentValue -Name "MES_RUNTIME_ROOT" -Value $previousRuntimeRoot
        }
    }

    $start = Start-DevelopmentServices
    $health = if ($start.Success) {
        Test-DevelopmentHealth
    }
    else {
        [pscustomobject] @{ Success = $false; Backend = $false; Frontend = $false }
    }
    $success = $stopSuccess -and $restoreSuccess -and $start.Success -and $health.Success
    Write-Host "SYNC_DATA_RECOVERY=$(if ($success) { 'SUCCESS' } else { 'FAILED' })"
    Write-Host "SYNC_DATA_RECOVERY_HEALTH=$(if ($health.Success) { 'OK' } else { 'FAILED' })"
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

    Write-Host "SYNC_DATA_SOURCE_SNAPSHOT=$($sourceSnapshot.Path)"
    Write-Host "SYNC_DATA_STAGING=$candidate"
    Write-Host "SYNC_DATA_SOURCE_MUTATION=NONE"
    if (-not $isApply) {
        Write-Host "[dry-run] 개발 DB와 8011/3001 서비스를 변경하지 않았습니다."
        Write-Host "SYNC_DATA_RESULT=VERIFIED"
        return 0
    }

    Write-Host "[backup] 현재 개발 DB online backup 생성 중..."
    $targetBackup = Invoke-DatabaseBackup `
        -Database $DevDb `
        -RuntimeRoot $DevRuntimeRoot `
        -Label "employee-data-rollback"
    if (-not $targetBackup.Success) {
        Write-Host "SYNC_DATA_RESULT=TARGET_BACKUP_FAILED"
        return 13
    }
    Write-Host "SYNC_DATA_BACKUP=$($targetBackup.Path)"

    Write-Host "[stop] 개발 서비스 8011/3001 정지 중..."
    $stop = Stop-DevelopmentServices
    if (-not $stop.Success) {
        Write-Host "[stop] 개발 서비스 정지 확인 실패 - DB는 교체하지 않습니다."
        $restart = Start-DevelopmentServices
        $health = if ($restart.Success) {
            Test-DevelopmentHealth
        }
        else {
            [pscustomobject] @{ Success = $false; Backend = $false; Frontend = $false }
        }
        Write-Host "SYNC_DATA_RECOVERY=NOT_NEEDED"
        Write-Host "SYNC_DATA_RECOVERY_HEALTH=$(if ($health.Success) { 'OK' } else { 'FAILED' })"
        Write-Host "SYNC_DATA_RESULT=STOP_FAILED"
        return 14
    }

    try {
        $previousRuntimeRoot = [Environment]::GetEnvironmentVariable("MES_RUNTIME_ROOT", "Process")
        try {
            $env:MES_RUNTIME_ROOT = $DevRuntimeRoot
            $install = Invoke-RestoreDatabase `
                -Source $candidate `
                -Target $DevDb `
                -PreverifiedRollback $targetBackup.Path
        }
        finally {
            Set-EnvironmentValue -Name "MES_RUNTIME_ROOT" -Value $previousRuntimeRoot
        }
        if (-not $install.Success) {
            if ($install.ExitCode -eq 3) {
                $restart = Start-DevelopmentServices
                $restartHealth = if ($restart.Success) {
                    Test-DevelopmentHealth
                }
                else {
                    [pscustomobject] @{ Success = $false; Backend = $false; Frontend = $false }
                }
                Write-Host "SYNC_DATA_RECOVERY=NOT_NEEDED"
                Write-Host "SYNC_DATA_RECOVERY_HEALTH=$(if ($restartHealth.Success) { 'OK' } else { 'FAILED' })"
                Write-Host "SYNC_DATA_RESULT=TARGET_CHANGED_AFTER_BACKUP"
                return 15
            }
            Invoke-DevelopmentRecovery -BackupPath $targetBackup.Path -StopBeforeRestore $false | Out-Null
            Write-Host "SYNC_DATA_RESULT=INSTALL_FAILED"
            return 15
        }

        if (-not (Invoke-DatabaseVerification -Database $DevDb -Phase "post" -RuntimeRoot $DevRuntimeRoot)) {
            Invoke-DevelopmentRecovery -BackupPath $targetBackup.Path -StopBeforeRestore $false | Out-Null
            Write-Host "SYNC_DATA_RESULT=POSTCHECK_FAILED"
            return 16
        }

        $start = Start-DevelopmentServices
        if (-not $start.Success) {
            Invoke-DevelopmentRecovery -BackupPath $targetBackup.Path -StopBeforeRestore $true | Out-Null
            Write-Host "SYNC_DATA_RESULT=START_FAILED"
            return 17
        }
        $health = Test-DevelopmentHealth
        if (-not $health.Success) {
            Write-Host "[health] 실패 - backend=$($health.Backend) frontend=$($health.Frontend)"
            Invoke-DevelopmentRecovery -BackupPath $targetBackup.Path -StopBeforeRestore $true | Out-Null
            Write-Host "SYNC_DATA_RESULT=HEALTH_FAILED"
            return 17
        }
    }
    catch {
        Write-Host "[apply] 예외: $($_.Exception.Message)"
        Invoke-DevelopmentRecovery -BackupPath $targetBackup.Path -StopBeforeRestore $true | Out-Null
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
