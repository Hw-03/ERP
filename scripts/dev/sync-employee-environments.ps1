# Scheduled entry: persist outcomes and keep the code-to-data handoff in one process.
$ErrorActionPreference = "Stop"
$RepoRoot = "C:\ERP"
$RunRoot = Join-Path $RepoRoot "_attic\runtime\scheduled-sync"
$PowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$script:Receipt = $null
$script:ReceiptPath = $null
$lockHandle = $null
$exitCode = 1

function Save-SyncReceipt {
    # Replace atomically so a reader never mistakes a partial JSON file for a result.
    $temporaryPath = $script:ReceiptPath + ".tmp"
    $json = $script:Receipt | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($temporaryPath, $json, $Utf8)
    if (Test-Path -LiteralPath $script:ReceiptPath) {
        [System.IO.File]::Replace($temporaryPath, $script:ReceiptPath, [NullString]::Value)
    }
    else {
        [System.IO.File]::Move($temporaryPath, $script:ReceiptPath)
    }
}

function Invoke-SyncStage {
    param([string] $Stage, [string] $ScriptPath, [string[]] $Arguments = @())

    $state = $script:Receipt[$Stage]
    $state.status = "RUNNING"
    $state.startedAt = (Get-Date).ToString("o")
    $script:Receipt.result = ($Stage.ToUpperInvariant() + "_RUNNING")
    $child = $null
    try {
        if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) {
            throw "Sync entry not found: $ScriptPath"
        }
        $stream = [System.IO.File]::OpenRead($ScriptPath)
        $hasher = [System.Security.Cryptography.SHA256]::Create()
        try {
            $state.scriptSha256 = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace("-", "").ToLowerInvariant()
        }
        finally { $stream.Dispose(); $hasher.Dispose() }
        Save-SyncReceipt
        $child = Start-Process -FilePath $PowerShell -ArgumentList (@(
            "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"' + $ScriptPath + '"')
        ) + $Arguments) -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $state.stdout -RedirectStandardError $state.stderr
        $null = $child.Handle
        $state.pid = $child.Id
        Save-SyncReceipt
        $child.WaitForExit()
        $child.Refresh()
        $state.exitCode = $child.ExitCode
        if ($null -eq $state.exitCode) { throw "Child exit code unavailable: $Stage" }
        $state.status = if ($state.exitCode -eq 0) { "COMPLETED" } else { "FAILED" }
        $state.completedAt = (Get-Date).ToString("o")
        Save-SyncReceipt
        Write-Host "SCHEDULED_SYNC_$($Stage.ToUpperInvariant())_EXIT=$($state.exitCode)"
        return [int] $state.exitCode
    }
    catch {
        $stageError = $_
        # Never release the run lock while a child may still be changing a database.
        if ($null -ne $child) {
            $child.WaitForExit()
            $child.Refresh()
            $state.exitCode = $child.ExitCode
        }
        $state.status = "FAILED"
        $state.completedAt = (Get-Date).ToString("o")
        $state["error"] = $stageError.Exception.Message
        throw $stageError
    }
    finally {
        if ($null -ne $child) { $child.Dispose() }
    }
}

try {
    New-Item -ItemType Directory -Path $RunRoot -Force | Out-Null
    try {
        $lockHandle = [System.IO.File]::Open(
            (Join-Path $RunRoot "run.lock"), [System.IO.FileMode]::OpenOrCreate,
            [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None
        )
    }
    catch [System.IO.IOException] {
        if (($_.Exception.HResult -band 0xFFFF) -notin @(32, 33)) { throw }
        Write-Host "SCHEDULED_SYNC_RESULT=ALREADY_RUNNING"
        exit 20
    }
    $runId = (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + [guid]::NewGuid().ToString("N")
    $runDirectory = Join-Path $RunRoot $runId
    New-Item -ItemType Directory -Path $runDirectory | Out-Null
    $script:ReceiptPath = Join-Path $runDirectory "receipt.json"
    $script:Receipt = [ordered] @{
        runId = $runId; startedAt = (Get-Date).ToString("o"); completedAt = $null
        ownerPid = $PID; result = "STARTING"; exitCode = $null
    }
    foreach ($stage in @("code", "data")) {
        $script:Receipt[$stage] = [ordered] @{
            status = "NOT_STARTED"; pid = $null; exitCode = $null
            startedAt = $null; completedAt = $null; scriptSha256 = $null
            stdout = (Join-Path $runDirectory "$stage.stdout.log")
            stderr = (Join-Path $runDirectory "$stage.stderr.log")
        }
    }
    Save-SyncReceipt
    Write-Host "SCHEDULED_SYNC_RECEIPT=$($script:ReceiptPath)"
    $exitCode = Invoke-SyncStage -Stage "code" -ScriptPath (Join-Path $RepoRoot "scripts\dev\auto-sync-to-employee.ps1")
    if ($exitCode -ne 0) {
        $script:Receipt.result = "CODE_FAILED"
    }
    else {
        # NO_CHANGES is also exit 0: employee data still needs to reach development.
        $exitCode = Invoke-SyncStage -Stage "data" -ScriptPath (Join-Path $RepoRoot "scripts\dev\sync-from-employee-data.ps1") -Arguments @("-Apply")
        if ($exitCode -ne 0) {
            $script:Receipt.result = "DATA_FAILED"
        }
        elseif (-not (Select-String -LiteralPath $script:Receipt.data.stdout -Pattern '^SYNC_DATA_RESULT=APPLIED$' -Quiet)) {
            $exitCode = 21
            $script:Receipt.result = "DATA_RESULT_UNCONFIRMED"
        }
        else {
            $script:Receipt.result = "COMPLETED"
        }
    }
}
catch {
    $exitCode = 1
    if ($null -ne $script:Receipt) {
        $script:Receipt.result = "WRAPPER_FAILED"
        $script:Receipt["error"] = $_.Exception.Message
    }
    Write-Host "SCHEDULED_SYNC_ERROR=$($_.Exception.Message)"
}
finally {
    try {
        if ($null -ne $script:Receipt) {
            $script:Receipt.completedAt = (Get-Date).ToString("o")
            $script:Receipt.exitCode = $exitCode
            Save-SyncReceipt
            Write-Host "SCHEDULED_SYNC_RESULT=$($script:Receipt.result)"
            Write-Host "SCHEDULED_SYNC_RECEIPT=$($script:ReceiptPath)"
        }
    }
    finally {
        if ($null -ne $lockHandle) { $lockHandle.Dispose() }
    }
}
exit $exitCode
