$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$PowerShellExe = Join-Path $PSHOME "powershell.exe"
$TestRoot = Join-Path $env:TEMP "mes-schema-readiness-$PID-$([guid]::NewGuid().ToString('N'))"

function Assert-True {
    param(
        [bool] $Condition,
        [string] $Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Assert-Match {
    param(
        [string] $Text,
        [string] $Pattern,
        [string] $Message
    )

    if ($Text -notmatch $Pattern) {
        throw "$Message`n--- output ---`n$Text"
    }
}

function ConvertTo-TestArgument {
    param([string] $Value)

    return '"' + $Value.Replace('"', '\"') + '"'
}

function Stop-TestProcessTree {
    param([System.Diagnostics.Process] $Process)

    if ($Process.HasExited) {
        return
    }

    if ($env:OS -eq "Windows_NT") {
        $taskkill = Join-Path $env:SystemRoot "System32\taskkill.exe"
        if (Test-Path -LiteralPath $taskkill -PathType Leaf) {
            try {
                & $taskkill /PID ([string] $Process.Id) /T /F 2>$null | Out-Null
            }
            catch {
                # The process can exit after HasExited and before taskkill. If it
                # is still alive, the .NET tree/single-process fallback below runs.
            }
        }
    }

    if ($Process.HasExited) {
        return
    }

    $killTreeMethod = $Process.GetType().GetMethod("Kill", [type[]] @([bool]))
    if ($killTreeMethod) {
        $null = $killTreeMethod.Invoke($Process, @($true))
        return
    }
    $Process.Kill()
}

function Invoke-TestProcess {
    param(
        [string] $FilePath,
        [string[]] $ArgumentList,
        [hashtable] $Environment = @{},
        [int] $TimeoutSeconds = 20
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = (($ArgumentList | ForEach-Object { ConvertTo-TestArgument ([string] $_) }) -join " ")
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true
    foreach ($key in $Environment.Keys) {
        $startInfo.EnvironmentVariables[[string] $key] = [string] $Environment[$key]
    }

    $process = [System.Diagnostics.Process]::new()
    try {
        $process.StartInfo = $startInfo
        $null = $process.Start()
        $process.StandardInput.Close()
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $timedOut = -not $process.WaitForExit($TimeoutSeconds * 1000)
        if ($timedOut) {
            Stop-TestProcessTree -Process $process
            if (-not $process.WaitForExit(5000)) {
                throw "Failed to terminate timed-out process tree: $FilePath $($startInfo.Arguments)"
            }
        }

        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        if ($timedOut) {
            throw "Timed out running $FilePath $($startInfo.Arguments)"
        }

        return [pscustomobject]@{
            ExitCode = [int] $process.ExitCode
            Stdout   = $stdout
            Stderr   = $stderr
            Output   = $stdout + $stderr
        }
    }
    finally {
        $process.Dispose()
    }
}

function Write-Utf8File {
    param(
        [string] $Path,
        [string] $Content
    )

    $parent = Split-Path -Parent $Path
    $null = New-Item -ItemType Directory -Force -Path $parent
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function New-SchemaSandbox {
    param([string] $Name)

    $root = Join-Path $TestRoot $Name
    $devDir = Join-Path $root "scripts\dev"
    $backendDir = Join-Path $root "backend"
    $null = New-Item -ItemType Directory -Force -Path $devDir, $backendDir
    Copy-Item -LiteralPath (Join-Path $RepoRoot "scripts\dev\ensure-schema-ready.ps1") -Destination $devDir
    Copy-Item -LiteralPath (Join-Path $RepoRoot "scripts\dev\checked-command.ps1") -Destination $devDir
    Copy-Item -LiteralPath (Join-Path $RepoRoot "scripts\dev\runtime-paths.ps1") -Destination $devDir

    Write-Utf8File (Join-Path $devDir "resolve-server-profile.ps1") @'
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$name = if ($env:SCHEMA_TEST_PROFILE) { $env:SCHEMA_TEST_PROFILE } else { "development" }
[pscustomobject]@{
    Name = $name
    Label = $name
    RepoRoot = $root
    FrontendPort = 1
    BackendPort = 1
    BackendInternalUrl = "http://127.0.0.1:1"
    PublicUrl = "http://127.0.0.1:1"
}
'@

    Write-Utf8File (Join-Path $backendDir "bootstrap_db.py") @'
from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse


event_path = Path(os.environ["SCHEMA_TEST_EVENTS"])
with event_path.open("a", encoding="utf-8") as handle:
    handle.write(" ".join(sys.argv[1:]) + "\n")

if sys.argv[1:] != ["--check"]:
    print("[schema-check] ERROR: unexpected command", file=sys.stderr)
    raise SystemExit(1)

scenario = os.environ.get("SCHEMA_TEST_SCENARIO", "ready")
if scenario == "check_error":
    print("[schema-check] ERROR: injected check failure", file=sys.stderr)
    raise SystemExit(1)
if scenario == "malformed_success":
    print("[check] missing readiness marker")
    raise SystemExit(0)
if scenario == "hang":
    import time
    time.sleep(30)

try:
    database_url = os.environ["DATABASE_URL"]
    parsed = urlparse(database_url)
    if parsed.scheme != "sqlite" or not parsed.path:
        raise ValueError("DATABASE_URL must identify SQLite")
    database_path = Path(unquote(parsed.path.lstrip("/") if os.name == "nt" else parsed.path))
    if os.name == "nt" and parsed.path.startswith("/"):
        database_path = Path(unquote(parsed.path[1:]))
    uri = f"file:{database_path.as_posix()}?mode=ro"
    with sqlite3.connect(uri, uri=True) as connection:
        state = connection.execute("SELECT state FROM schema_marker").fetchone()[0]
except Exception as exc:
    print(f"[schema-check] ERROR: {exc}", file=sys.stderr)
    raise SystemExit(1)

ready = scenario == "ready" and state == "ready"
print(f"[schema-check] state=versioned revision=test ready={ready} profile=test")
raise SystemExit(0 if ready else 1)
'@

    $targetPath = Join-Path $root "alternate-target.db"
    $initScript = Join-Path $root "init_sqlite.py"
    Write-Utf8File $initScript @'
import sqlite3
import sys

with sqlite3.connect(sys.argv[1]) as connection:
    connection.execute("CREATE TABLE schema_marker (state TEXT NOT NULL)")
    connection.execute("INSERT INTO schema_marker VALUES ('ready')")
'@
    $init = Invoke-TestProcess "py.exe" @($initScript, $targetPath)
    Assert-True ($init.ExitCode -eq 0) "Failed to initialize isolated SQLite: $($init.Output)"

    $sentinelPath = Join-Path $backendDir "mes.db"
    [System.IO.File]::WriteAllBytes($sentinelPath, [System.Text.Encoding]::UTF8.GetBytes("sentinel-default-database"))

    return [pscustomobject]@{
        Root = $root
        DevDir = $devDir
        BackendDir = $backendDir
        Helper = Join-Path $devDir "ensure-schema-ready.ps1"
        Target = $targetPath
        Sentinel = $sentinelPath
        Events = Join-Path $root "events.log"
    }
}

function Get-SandboxEnvironment {
    param(
        [pscustomobject] $Sandbox,
        [string] $Scenario = "ready",
        [string] $Profile = "development",
        [string] $DatabaseUrl
    )

    if (-not $DatabaseUrl) {
        $DatabaseUrl = "sqlite:///$($Sandbox.Target.Replace('\', '/'))"
    }
    return @{
        DATABASE_URL = $DatabaseUrl
        SCHEMA_TEST_EVENTS = $Sandbox.Events
        SCHEMA_TEST_PROFILE = $Profile
        SCHEMA_TEST_SCENARIO = $Scenario
        PYTHONDONTWRITEBYTECODE = "1"
    }
}

function Invoke-Helper {
    param(
        [pscustomobject] $Sandbox,
        [string] $Mode,
        [hashtable] $Environment,
        [int] $CheckTimeoutSeconds = 30
    )

    return Invoke-TestProcess $PowerShellExe @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $Sandbox.Helper,
        "-Mode", $Mode,
        "-CheckTimeoutSeconds", ([string] $CheckTimeoutSeconds)
    ) $Environment
}

function Add-CallerFakes {
    param([pscustomobject] $Sandbox)

    Write-Utf8File (Join-Path $Sandbox.DevDir "runtime-paths.ps1") @'
function Get-MesRuntimePath {
    param([string] $RepoRoot, [string] $RelativePath)
    $path = Join-Path $RepoRoot ("_runtime\" + $RelativePath)
    $null = New-Item -ItemType Directory -Force -Path $path
    return $path
}
'@
    Write-Utf8File (Join-Path $Sandbox.DevDir "runtime-control.ps1") @'
function Get-RuntimeState { return $null }
function Test-ProcessAlive { return $false }
function Get-ProcessCommandLine { return "" }
function Test-SupervisorProcessOwned { return $false }
function Test-StoredRuntimeProcessOwned { return $false }
function Get-ListeningPortPids { return @() }
function Get-LastRuntimeIncident { return $null }
'@
    Copy-Item -LiteralPath (Join-Path $RepoRoot "scripts\dev\status-servers.ps1") -Destination $Sandbox.DevDir
    Copy-Item -LiteralPath (Join-Path $RepoRoot "scripts\dev\watch-service.ps1") -Destination $Sandbox.DevDir

    $backendLogDir = Join-Path $Sandbox.Root "_runtime\logs\backend"
    $null = New-Item -ItemType Directory -Force -Path $backendLogDir
    foreach ($name in @("backend-dev.out.log", "backend-dev.err.log", "backend-runtime-events.jsonl")) {
        Write-Utf8File (Join-Path $backendLogDir $name) "test log`n"
    }
    Write-Utf8File (Join-Path $Sandbox.Root "run-watch.ps1") @"
function Start-Job { exit 0 }
& '$($Sandbox.DevDir)\watch-service.ps1' -Service backend
"@
}

function Invoke-Caller {
    param(
        [pscustomobject] $Sandbox,
        [ValidateSet("status", "watch")]
        [string] $Caller,
        [hashtable] $Environment
    )

    $scriptPath = if ($Caller -eq "status") {
        Join-Path $Sandbox.DevDir "status-servers.ps1"
    }
    else {
        Join-Path $Sandbox.Root "run-watch.ps1"
    }
    return Invoke-TestProcess $PowerShellExe @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath
    ) $Environment
}

function Get-FileFingerprint {
    param([string] $Path)

    $item = Get-Item -LiteralPath $Path
    $stream = [System.IO.File]::OpenRead($Path)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = [System.BitConverter]::ToString($sha256.ComputeHash($stream)).Replace("-", "")
    }
    finally {
        $sha256.Dispose()
        $stream.Dispose()
    }
    return [pscustomobject]@{
        Hash = $hash
        Mtime = $item.LastWriteTimeUtc.Ticks
    }
}

function Assert-FileFingerprintUnchanged {
    param(
        [string] $Path,
        [pscustomobject] $Before,
        [string] $Context
    )

    $after = Get-FileFingerprint -Path $Path
    Assert-True ($after.Hash -eq $Before.Hash) "$Context changed file hash: $Path"
    Assert-True ($after.Mtime -eq $Before.Mtime) "$Context changed file mtime: $Path"
}

function Get-SchemaTestEvents {
    param([string] $Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return @()
    }
    return @(Get-Content -LiteralPath $Path)
}

function Invoke-HelperContract {
    param(
        [pscustomobject] $Sandbox,
        [ValidateSet("Start", "Report")]
        [string] $Mode,
        [string] $Scenario,
        [int] $ExpectedExit,
        [string] $ExpectedLabel,
        [string] $Profile = "development",
        [string] $DatabaseUrl,
        [bool] $ExpectBootstrapInvocation = $true,
        [switch] $SimulateLaunchError,
        [string] $MissingPath,
        [int] $CheckTimeoutSeconds = 30
    )

    if (Test-Path -LiteralPath $Sandbox.Events) {
        Remove-Item -LiteralPath $Sandbox.Events -Force
    }
    $sentinelBefore = Get-FileFingerprint -Path $Sandbox.Sentinel
    $targetBefore = Get-FileFingerprint -Path $Sandbox.Target
    $environment = Get-SandboxEnvironment `
        -Sandbox $Sandbox `
        -Scenario $Scenario `
        -Profile $Profile `
        -DatabaseUrl $DatabaseUrl
    if ($SimulateLaunchError) {
        $emptyPath = Join-Path $Sandbox.Root "empty-path"
        $null = New-Item -ItemType Directory -Force -Path $emptyPath
        $environment["PATH"] = $emptyPath
    }

    $result = Invoke-Helper `
        -Sandbox $Sandbox `
        -Mode $Mode `
        -Environment $environment `
        -CheckTimeoutSeconds $CheckTimeoutSeconds
    $context = "$Mode/$Scenario"
    Assert-True ($result.ExitCode -eq $ExpectedExit) "$context must exit $ExpectedExit`: $($result.Output)"
    Assert-Match $result.Output "\[schema\]\s+$ExpectedLabel" "$context must report $ExpectedLabel"

    $events = @(Get-SchemaTestEvents -Path $Sandbox.Events)
    $expectedEvents = if ($ExpectBootstrapInvocation) { @("--check") } else { @() }
    Assert-True ($events.Count -eq $expectedEvents.Count) "$context must record exactly $($expectedEvents.Count) bootstrap invocation(s), got $($events.Count): $($events -join '|')"
    if ($expectedEvents.Count -gt 0) {
        Assert-True (($events -join "|") -eq ($expectedEvents -join "|")) "$context must invoke only bootstrap --check: $($events -join '|')"
    }

    Assert-FileFingerprintUnchanged -Path $Sandbox.Sentinel -Before $sentinelBefore -Context $context
    Assert-FileFingerprintUnchanged -Path $Sandbox.Target -Before $targetBefore -Context $context
    if ($MissingPath) {
        Assert-True (-not (Test-Path -LiteralPath $MissingPath)) "$context created missing SQLite target: $MissingPath"
    }
    return $result
}

function Test-ProcessTimeoutContract {
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $timedOut = $false
    try {
        $null = Invoke-TestProcess `
            -FilePath "py.exe" `
            -ArgumentList @("-c", "import time; time.sleep(1)") `
            -TimeoutSeconds 0
    }
    catch {
        if ($_.Exception.Message -notmatch '^Timed out running ') {
            throw
        }
        $timedOut = $true
    }
    finally {
        $timer.Stop()
    }

    Assert-True $timedOut "Invoke-TestProcess ignored its zero-second timeout and returned after $($timer.ElapsedMilliseconds) ms"
}

function Test-HelperContracts {
    $sandbox = New-SchemaSandbox "helper"

    foreach ($mode in @("Start", "Report")) {
        $null = Invoke-HelperContract `
            -Sandbox $sandbox `
            -Mode $mode `
            -Scenario "ready" `
            -ExpectedExit 0 `
            -ExpectedLabel "READY"
    }

    foreach ($mode in @("Start", "Report")) {
        $failureCases = @(
            @{ Scenario = "not_ready"; ExpectedExit = 2; ExpectedLabel = "NOT_READY" },
            @{ Scenario = "check_error"; ExpectedExit = 3; ExpectedLabel = "CHECK_ERROR" },
            @{ Scenario = "malformed_success"; ExpectedExit = 3; ExpectedLabel = "CHECK_ERROR" }
        )
        foreach ($case in $failureCases) {
            $null = Invoke-HelperContract `
                -Sandbox $sandbox `
                -Mode $mode `
                -Scenario $case.Scenario `
                -ExpectedExit $case.ExpectedExit `
                -ExpectedLabel $case.ExpectedLabel
        }

        $missingPath = Join-Path $sandbox.Root "missing-$($mode.ToLowerInvariant()).db"
        $null = Invoke-HelperContract `
            -Sandbox $sandbox `
            -Mode $mode `
            -Scenario "missing_path" `
            -ExpectedExit 3 `
            -ExpectedLabel "CHECK_ERROR" `
            -DatabaseUrl "sqlite:///$($missingPath.Replace('\', '/'))" `
            -MissingPath $missingPath

        $null = Invoke-HelperContract `
            -Sandbox $sandbox `
            -Mode $mode `
            -Scenario "wrong_path" `
            -ExpectedExit 3 `
            -ExpectedLabel "CHECK_ERROR" `
            -DatabaseUrl "wrong://target"

        $null = Invoke-HelperContract `
            -Sandbox $sandbox `
            -Mode $mode `
            -Scenario "launch_error" `
            -ExpectedExit 3 `
            -ExpectedLabel "CHECK_ERROR" `
            -ExpectBootstrapInvocation $false `
            -SimulateLaunchError

        $null = Invoke-HelperContract `
            -Sandbox $sandbox `
            -Mode $mode `
            -Scenario "hang" `
            -ExpectedExit 3 `
            -ExpectedLabel "CHECK_ERROR" `
            -CheckTimeoutSeconds 1
    }

    $development = Invoke-HelperContract `
        -Sandbox $sandbox `
        -Mode "Report" `
        -Scenario "not_ready" `
        -ExpectedExit 2 `
        -ExpectedLabel "NOT_READY"
    Assert-Match $development.Output 'cd\s+backend' "development guidance must explicitly cd backend"
    Assert-Match $development.Output 'python\s+bootstrap_db\.py\s+--all' "development guidance must show explicit bootstrap --all"

    $employee = Invoke-HelperContract `
        -Sandbox $sandbox `
        -Mode "Start" `
        -Scenario "not_ready" `
        -ExpectedExit 2 `
        -ExpectedLabel "NOT_READY" `
        -Profile "employee"
    Assert-Match $employee.Output 'approved-sync-deploy' "employee guidance must use the approved sync/deploy path"
    Assert-True ($employee.Output -notmatch 'bootstrap_db\.py\s+--all') "employee guidance must not suggest direct migration"
}

function Test-CallerContracts {
    $sandbox = New-SchemaSandbox "callers"
    Add-CallerFakes $sandbox

    foreach ($scenario in @("not_ready", "check_error")) {
        $expected = if ($scenario -eq "not_ready") { "NOT_READY" } else { "CHECK_ERROR" }
        foreach ($caller in @("status", "watch")) {
            $result = Invoke-Caller $sandbox $caller (Get-SandboxEnvironment $sandbox -Scenario $scenario)
            Assert-True ($result.ExitCode -eq 0) "$caller should remain a reporting command: $($result.Output)"
            Assert-Match $result.Output "\[$caller-database\]\s+$expected" "$caller must distinctly report $expected"
        }
    }
}

function Test-StartContract {
    foreach ($schemaExit in @(2, 3)) {
        $root = Join-Path $TestRoot "start-$schemaExit"
        $devDir = Join-Path $root "scripts\dev"
        $frontendDir = Join-Path $root "frontend"
        $backendDir = Join-Path $root "backend"
        $null = New-Item -ItemType Directory -Force -Path $devDir, $frontendDir, $backendDir
        Copy-Item -LiteralPath (Join-Path $RepoRoot "start.bat") -Destination $root
        $null = New-Item -ItemType Directory -Force -Path (Join-Path $frontendDir "node_modules")
        Write-Utf8File (Join-Path $frontendDir "node_modules\.package-lock.json") "{}"
        Write-Utf8File (Join-Path $devDir "ensure-schema-ready.ps1") @'
param([string] $Mode)
Add-Content -LiteralPath $env:SCHEMA_TEST_EVENTS -Value "schema-helper:$Mode"
Write-Host "[schema] injected failure"
exit [int] $env:SCHEMA_TEST_EXIT
'@
        foreach ($service in @("backend", "frontend")) {
            Write-Utf8File (Join-Path $devDir "start-$service.ps1") @"
Add-Content -LiteralPath `$env:SCHEMA_TEST_EVENTS -Value 'start-$service'
exit 0
"@
        }
        $wrapper = Join-Path $root "run-start.cmd"
        Write-Utf8File $wrapper "@echo off`r`ncall `"%~dp0start.bat`" ^<nul`r`nexit /b %ERRORLEVEL%`r`n"
        $events = Join-Path $root "events.log"
        $result = Invoke-TestProcess "cmd.exe" @("/d", "/c", $wrapper) @{
            SCHEMA_TEST_EVENTS = $events
            SCHEMA_TEST_EXIT = [string] $schemaExit
        }

        Assert-True ($result.ExitCode -eq $schemaExit) "start.bat must propagate schema exit ${schemaExit}: $($result.Output)"
        $eventLines = @(Get-Content -LiteralPath $events)
        Assert-True (($eventLines -join "|") -eq "schema-helper:Start") "start.bat must not start either server after schema exit $schemaExit"
    }
}

function Test-SourceContract {
    $helper = Get-Content -Raw (Join-Path $RepoRoot "scripts\dev\ensure-schema-ready.ps1")
    foreach ($forbidden in @(
        '--migrate',
        'stop-servers\.ps1',
        'backup_db\.py',
        'restore_db\.py',
        '_verify_backup\.py',
        'check_inventory_integrity\.py',
        'Read-Host',
        'mes\.db'
    )) {
        Assert-True ($helper -notmatch $forbidden) "schema helper still contains forbidden write/path behavior: $forbidden"
    }
    Assert-Match $helper 'bootstrap_db\.py.*--check' "schema helper must invoke only bootstrap --check"
}

try {
    $null = New-Item -ItemType Directory -Force -Path $TestRoot
    Test-ProcessTimeoutContract
    Test-HelperContracts
    Test-CallerContracts
    Test-StartContract
    Test-SourceContract
    Write-Host "schema readiness adapter behavior tests passed"
}
finally {
    if (Test-Path -LiteralPath $TestRoot) {
        $resolvedTestRoot = [System.IO.Path]::GetFullPath($TestRoot).TrimEnd('\')
        $resolvedTempRoot = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
        Assert-True ($resolvedTestRoot.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) "Refusing to delete test data outside the temp root: $resolvedTestRoot"
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
    }
}
