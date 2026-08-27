param(
    [ValidateSet("smart", "auto", "full", "frontend", "backend", "docs")]
    [string] $Mode = "smart",
    [ValidateSet("auto", "staged", "working")]
    [string] $ChangeSet = "auto",
    [switch] $PlanOnly,
    [string] $TimingOutput,
    [Parameter(DontShow = $true)]
    [string] $InternalGateFile,
    [switch] $DbReadOnlyCheck,
    # Playwright E2E 까지 포함(전용 DB·서버 기동 — 느림). 기본 게이트는 가볍게 유지하고 opt-in.
    [switch] $IncludeE2E
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$RepoRoot = git rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or -not $RepoRoot) {
    throw "Git repository root not found"
}
$RepoRoot = $RepoRoot.Trim()
$FrontendRoot = Join-Path $RepoRoot "frontend"
$BackendRoot = Join-Path $RepoRoot "backend"
$FrontendNextBin = Join-Path $FrontendRoot "node_modules\.bin\next.cmd"
$FrontendTscBin = Join-Path $FrontendRoot "node_modules\.bin\tsc.cmd"
$FrontendVitestBin = Join-Path $FrontendRoot "node_modules\.bin\vitest.cmd"
$VerifyE2EScript = Join-Path $RepoRoot "scripts\dev\verify_e2e.ps1"
$PolicyScript = Join-Path $RepoRoot "scripts\dev\verification_policy.py"
$ParallelCpuThreshold = 8
if ($env:DEXCOWIN_VERIFY_PARALLEL_CPU_THRESHOLD) {
    $ParallelCpuThreshold = [Math]::Max(
        1,
        [int] $env:DEXCOWIN_VERIFY_PARALLEL_CPU_THRESHOLD
    )
}
$HeartbeatSeconds = 15
$TotalWatch = [System.Diagnostics.Stopwatch]::StartNew()
$GateTimings = New-Object System.Collections.Generic.List[object]
$Plan = $null
$FailureMessage = $null
$PostgresTestEnvironmentNames = @(
    "TEST_POSTGRES_URL",
    "DATABASE_URL",
    "DEXCOWIN_POSTGRES_TEST_ACK"
)

function Invoke-Check {
    param(
        [Parameter(Mandatory = $true)]
        [string] $GateId,

        [Parameter(Mandatory = $true)]
        [string] $Name,

        [Parameter(Mandatory = $true)]
        [string] $WorkingDirectory,

        [Parameter(Mandatory = $true)]
        [scriptblock] $Command
    )

    Write-Host ""
    Write-Host "==> $Name"
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $status = "passed"
    $pushed = $false
    $ScopePostgresTestEnvironment = (
        $GateId.StartsWith("backend-") -and
        $GateId -ne "backend-postgres-concurrency"
    )
    $PreviousPostgresTestEnvironment = @{}
    try {
        if ($ScopePostgresTestEnvironment) {
            foreach ($EnvironmentName in $PostgresTestEnvironmentNames) {
                $PreviousPostgresTestEnvironment[$EnvironmentName] =
                    [Environment]::GetEnvironmentVariable($EnvironmentName, "Process")
                [Environment]::SetEnvironmentVariable($EnvironmentName, $null, "Process")
            }
        }
        Push-Location $WorkingDirectory
        $pushed = $true
        $global:LASTEXITCODE = 0
        & $Command
        if ($LASTEXITCODE -ne 0) {
            throw "$Name failed with exit code $LASTEXITCODE"
        }
    }
    catch {
        $status = "failed"
        throw
    }
    finally {
        if ($ScopePostgresTestEnvironment) {
            foreach ($EnvironmentName in $PostgresTestEnvironmentNames) {
                [Environment]::SetEnvironmentVariable(
                    $EnvironmentName,
                    $PreviousPostgresTestEnvironment[$EnvironmentName],
                    "Process"
                )
            }
        }
        if ($pushed) {
            Pop-Location
        }
        $watch.Stop()
        $GateTimings.Add([pscustomobject]@{
            id = $GateId
            name = $Name
            status = $status
            duration_ms = [Math]::Round($watch.Elapsed.TotalMilliseconds, 3)
        })
    }
}

function Invoke-OpenApiDrift {
    Invoke-Check "backend-openapi" "OpenAPI drift" $BackendRoot {
        $TmpFile = Join-Path $env:TEMP "openapi-current-$PID.json"
        $BaselineFile = Join-Path $RepoRoot "_dev/baselines/openapi.json"
        try {
            $PyScript = @'
import json
import sys
sys.path.insert(0, ".")
from app.main import app
out = sys.argv[1]
with open(out, "w", encoding="utf-8") as f:
    json.dump(app.openapi(), f, indent=2, sort_keys=True, ensure_ascii=False)
    f.write("\n")
'@
            $PyScript | python - $TmpFile
            if ($LASTEXITCODE -ne 0) {
                throw "OpenAPI capture failed"
            }

            $current = Get-Content -LiteralPath $TmpFile -Raw
            $baseline = Get-Content -LiteralPath $BaselineFile -Raw
            if ($current -ne $baseline) {
                Write-Host ""
                Write-Host "OpenAPI drift detected. Update _dev/baselines/openapi.json."
                throw "OpenAPI drift"
            }
            Write-Host "OpenAPI spec matches baseline."
        }
        finally {
            if ([System.IO.File]::Exists($TmpFile)) {
                [System.IO.File]::Delete($TmpFile)
            }
        }
    }
}

function Invoke-DbReadOnlyGate {
    Invoke-Check "db-read-only" "DB read-only consistency" $RepoRoot {
        $DbPath = Join-Path $BackendRoot "mes.db"
        if (-not (Test-Path $DbPath)) {
            throw "DB file not found: $DbPath"
        }

        $PythonScript = @'
import json
import sqlite3
import sys
from pathlib import Path

db_path = Path(sys.argv[1]).resolve()
uri = f"file:{db_path.as_posix()}?mode=ro"
con = sqlite3.connect(uri, uri=True)
cur = con.cursor()

tables = [
    "items",
    "employees",
    "inventory",
    "inventory_locations",
    "transaction_logs",
    "stock_requests",
    "io_batches",
    "warehouse_box_items",
]
rows = {table: cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in tables}

mismatch_count = cur.execute("""
WITH loc AS (
    SELECT item_id, COALESCE(SUM(quantity), 0) AS location_sum
    FROM inventory_locations
    GROUP BY item_id
)
SELECT COUNT(*)
FROM inventory i
LEFT JOIN loc ON loc.item_id = i.item_id
WHERE COALESCE(i.quantity, 0) != COALESCE(i.warehouse_qty, 0) + COALESCE(loc.location_sum, 0)
""").fetchone()[0]

last_transaction_at = cur.execute("SELECT MAX(created_at) FROM transaction_logs").fetchone()[0]
print(json.dumps({
    "db": str(db_path),
    "rows": rows,
    "inventory_mismatch_count": mismatch_count,
    "last_transaction_at": last_transaction_at,
}, ensure_ascii=False, indent=2))
con.close()

if mismatch_count != 0:
    raise SystemExit(f"inventory_mismatch_count must be 0, got {mismatch_count}")
'@

        $PythonScript | python - $DbPath
        if ($LASTEXITCODE -ne 0) {
            throw "DB read-only consistency failed with exit code $LASTEXITCODE"
        }
    }
}

function Get-GateName {
    param([string] $GateId)
    switch ($GateId) {
        "docs-whitespace"          { return "Docs whitespace check" }
        "docs-link-tests"          { return "Maintained Markdown link checker tests" }
        "docs-links"               { return "Maintained Markdown links" }
        "frontend-lint-files"      { return "Frontend changed-file lint" }
        "frontend-tsc-incremental" { return "Frontend incremental type check" }
        "frontend-vitest-related"  { return "Frontend related tests" }
        "frontend-direct-tests"    { return "Frontend directly changed tests" }
        "frontend-lint"            { return "Frontend strict lint" }
        "frontend-typecheck"       { return "Frontend type check" }
        "frontend-test-typecheck"  { return "Frontend unit test type check" }
        "frontend-e2e-typecheck"   { return "Frontend E2E type check" }
        "frontend-coverage"        { return "Frontend tests + coverage" }
        "frontend-build"           { return "Frontend production build" }
        "frontend-bundle-size"     { return "Frontend bundle size" }
        "backend-testmon"          { return "Backend pytest-testmon" }
        "backend-ruff"             { return "Backend Ruff baseline" }
        "backend-mypy"             { return "Backend mypy baseline" }
        "backend-postgres-concurrency" { return "Backend PostgreSQL concurrency" }
        "backend-pytest-full"      { return "Backend full pytest" }
        "backend-openapi"          { return "OpenAPI drift" }
        "git-status"               { return "Git working tree status" }
        "db-read-only"             { return "DB read-only consistency" }
        "playwright-e2e"           { return "Playwright E2E (dedicated DB)" }
        default { return $GateId }
    }
}

function Assert-Node20 {
    $nodeVersion = $null
    try {
        $nodeVersion = (& node --version 2>$null | Select-Object -First 1)
    }
    catch {
        $nodeVersion = $null
    }
    if (-not $nodeVersion -or $nodeVersion -notmatch '^v20\.') {
        throw "Frontend verification requires Node.js 20 (current: $nodeVersion)."
    }
}

function Get-BackendWorkerCount {
    $HalfCpu = [Math]::Floor([Environment]::ProcessorCount / 2)
    return [int] [Math]::Max(1, [Math]::Min(4, $HalfCpu))
}

function Get-FrontendParallelWorkerCount {
    $QuarterCpu = [Math]::Floor([Environment]::ProcessorCount / 4)
    return [int] [Math]::Max(1, [Math]::Min(2, $QuarterCpu))
}

function Test-ContainsGateIds {
    param(
        [object[]] $Gates,
        [string[]] $RequiredIds
    )

    $PresentIds = @($Gates | ForEach-Object { [string] $_.id })
    foreach ($RequiredId in $RequiredIds) {
        if ($RequiredId -notin $PresentIds) {
            return $false
        }
    }
    return $true
}

function Merge-ChildTimingReport {
    param([Parameter(Mandatory = $true)] [string] $Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }
    $ChildReport = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($Timing in @($ChildReport.gates)) {
        $GateTimings.Add([pscustomobject]@{
            id = [string] $Timing.id
            name = [string] $Timing.name
            status = [string] $Timing.status
            duration_ms = [double] $Timing.duration_ms
        })
    }
}

function New-ChildArtifactPath {
    param(
        [Parameter(Mandatory = $true)] [string] $Area,
        [Parameter(Mandatory = $true)] [string] $Kind
    )

    $Token = [Guid]::NewGuid().ToString("N")
    return Join-Path ([System.IO.Path]::GetTempPath()) "dexcowin-$Kind-$Area-$PID-$Token.log"
}

function Invoke-ParallelAreaGates {
    param([Parameter(Mandatory = $true)] [object[]] $Gates)

    $AreaRecords = New-Object System.Collections.Generic.List[object]
    $ParallelWatch = [System.Diagnostics.Stopwatch]::StartNew()
    $NextHeartbeat = $HeartbeatSeconds
    $PreviousFrontendMaxWorkers = [Environment]::GetEnvironmentVariable(
        "DEXCOWIN_FRONTEND_MAX_WORKERS",
        "Process"
    )
    try {
        [Environment]::SetEnvironmentVariable(
            "DEXCOWIN_FRONTEND_MAX_WORKERS",
            (Get-FrontendParallelWorkerCount).ToString(),
            "Process"
        )
        foreach ($Area in @("backend", "frontend")) {
            $StdoutPath = New-ChildArtifactPath -Area $Area -Kind "stdout"
            $StderrPath = New-ChildArtifactPath -Area $Area -Kind "stderr"
            $TimingPath = New-ChildArtifactPath -Area $Area -Kind "child_timing"
            $Arguments = (
                "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" " +
                "-Mode $Area -ChangeSet working -TimingOutput `"$TimingPath`""
            )
            $Process = Start-Process `
                -FilePath "powershell.exe" `
                -ArgumentList $Arguments `
                -PassThru `
                -WindowStyle Hidden `
                -RedirectStandardOutput $StdoutPath `
                -RedirectStandardError $StderrPath
            # Windows PowerShell 5.1은 프로세스가 빨리 끝나면 ExitCode를 비워 둔다.
            # 생성 직후 Handle을 열어 두면 종료 코드가 안정적으로 보존된다.
            $null = $Process.Handle
            $AreaRecords.Add([pscustomobject]@{
                Area = $Area
                Process = $Process
                StdoutPath = $StdoutPath
                StderrPath = $StderrPath
                TimingPath = $TimingPath
            })
        }
        [Environment]::SetEnvironmentVariable(
            "DEXCOWIN_FRONTEND_MAX_WORKERS",
            $PreviousFrontendMaxWorkers,
            "Process"
        )

        while (@($AreaRecords | Where-Object { -not $_.Process.HasExited }).Count -gt 0) {
            Start-Sleep -Milliseconds 250
            if ($ParallelWatch.Elapsed.TotalSeconds -ge $NextHeartbeat) {
                $States = @(
                    $AreaRecords | ForEach-Object {
                        "$($_.Area)=$(if ($_.Process.HasExited) { 'done' } else { 'running' })"
                    }
                )
                Write-Host "Parallel verification $([Math]::Floor($ParallelWatch.Elapsed.TotalSeconds))s: $($States -join ', ')"
                $NextHeartbeat += $HeartbeatSeconds
            }
        }

        $FailedAreas = New-Object System.Collections.Generic.List[string]
        foreach ($Record in $AreaRecords) {
            $Record.Process.WaitForExit()
            $Record.Process.Refresh()
            $ExitCode = $Record.Process.ExitCode
            if (Test-Path -LiteralPath $Record.StdoutPath) {
                $Stdout = Get-Content -LiteralPath $Record.StdoutPath -Raw -Encoding UTF8
                if ($Stdout) { Write-Host $Stdout.TrimEnd() }
            }
            if (Test-Path -LiteralPath $Record.StderrPath) {
                $Stderr = Get-Content -LiteralPath $Record.StderrPath -Raw -Encoding UTF8
                if ($Stderr) { [Console]::Error.WriteLine($Stderr.TrimEnd()) }
            }
            Merge-ChildTimingReport -Path $Record.TimingPath
            if ($ExitCode -ne 0) {
                $FailedAreas.Add("$($Record.Area)=$ExitCode")
            }
        }
        if ($FailedAreas.Count -gt 0) {
            throw "Parallel area verification failed: $($FailedAreas -join ', ')"
        }
    }
    finally {
        [Environment]::SetEnvironmentVariable(
            "DEXCOWIN_FRONTEND_MAX_WORKERS",
            $PreviousFrontendMaxWorkers,
            "Process"
        )
        $ParallelWatch.Stop()
        foreach ($Record in $AreaRecords) {
            if (-not $Record.Process.HasExited) {
                $Record.Process.WaitForExit()
            }
            foreach ($Path in @($Record.StdoutPath, $Record.StderrPath, $Record.TimingPath)) {
                if (Test-Path -LiteralPath $Path) {
                    Remove-Item -LiteralPath $Path -Force
                }
            }
            $Record.Process.Dispose()
        }
    }
}

function Invoke-ParallelTargetedGates {
    param([Parameter(Mandatory = $true)] [object[]] $Gates)

    $GateRecords = New-Object System.Collections.Generic.List[object]
    $ParallelWatch = [System.Diagnostics.Stopwatch]::StartNew()
    $NextHeartbeat = $HeartbeatSeconds
    try {
        foreach ($Gate in $Gates) {
            $GateId = [string] $Gate.id
            $StdoutPath = New-ChildArtifactPath -Area $GateId -Kind "stdout"
            $StderrPath = New-ChildArtifactPath -Area $GateId -Kind "stderr"
            $TimingPath = New-ChildArtifactPath -Area $GateId -Kind "child_timing"
            $GatePath = New-ChildArtifactPath -Area $GateId -Kind "gate"
            $Gate | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $GatePath -Encoding UTF8
            $Arguments = (
                "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" " +
                "-InternalGateFile `"$GatePath`" -TimingOutput `"$TimingPath`""
            )
            $Process = Start-Process `
                -FilePath "powershell.exe" `
                -ArgumentList $Arguments `
                -PassThru `
                -WindowStyle Hidden `
                -RedirectStandardOutput $StdoutPath `
                -RedirectStandardError $StderrPath
            # Windows PowerShell 5.1에서 빠르게 끝난 child의 종료 코드를 보존한다.
            $null = $Process.Handle
            $GateRecords.Add([pscustomobject]@{
                GateId = $GateId
                Process = $Process
                StdoutPath = $StdoutPath
                StderrPath = $StderrPath
                TimingPath = $TimingPath
                GatePath = $GatePath
            })
        }

        while (@($GateRecords | Where-Object { -not $_.Process.HasExited }).Count -gt 0) {
            Start-Sleep -Milliseconds 100
            if ($ParallelWatch.Elapsed.TotalSeconds -ge $NextHeartbeat) {
                $RunningCount = @($GateRecords | Where-Object { -not $_.Process.HasExited }).Count
                Write-Host (
                    "Smart parallel verification {0}s: {1}/{2} running" -f
                    [Math]::Floor($ParallelWatch.Elapsed.TotalSeconds),
                    $RunningCount,
                    $GateRecords.Count
                )
                $NextHeartbeat += $HeartbeatSeconds
            }
        }

        $FailedGates = New-Object System.Collections.Generic.List[string]
        foreach ($Record in $GateRecords) {
            $Record.Process.WaitForExit()
            $Record.Process.Refresh()
            $ExitCode = $Record.Process.ExitCode
            if (Test-Path -LiteralPath $Record.StdoutPath) {
                $Stdout = Get-Content -LiteralPath $Record.StdoutPath -Raw -Encoding UTF8
                if ($Stdout) { Write-Host $Stdout.TrimEnd() }
            }
            if (Test-Path -LiteralPath $Record.StderrPath) {
                $Stderr = Get-Content -LiteralPath $Record.StderrPath -Raw -Encoding UTF8
                if ($Stderr) { [Console]::Error.WriteLine($Stderr.TrimEnd()) }
            }
            Merge-ChildTimingReport -Path $Record.TimingPath
            if ($ExitCode -ne 0) {
                $FailedGates.Add("$($Record.GateId)=$ExitCode")
            }
        }
        if ($FailedGates.Count -gt 0) {
            throw "Parallel targeted verification failed: $($FailedGates -join ', ')"
        }
    }
    finally {
        $ParallelWatch.Stop()
        foreach ($Record in $GateRecords) {
            if (-not $Record.Process.HasExited) {
                $Record.Process.WaitForExit()
            }
            foreach ($Path in @(
                $Record.StdoutPath,
                $Record.StderrPath,
                $Record.TimingPath,
                $Record.GatePath
            )) {
                if (Test-Path -LiteralPath $Path) {
                    Remove-Item -LiteralPath $Path -Force
                }
            }
            $Record.Process.Dispose()
        }
    }
}

function Get-FrontendRelativeFiles {
    param([object[]] $Files)
    return @(
        $Files |
            Where-Object { $_ -is [string] -and $_.StartsWith("frontend/") } |
            ForEach-Object { $_.Substring("frontend/".Length) }
    )
}

function Assert-UntrackedFilesHaveNoWhitespaceErrors {
    param([string[]] $Files)

    $IssueCount = 0
    foreach ($File in $Files) {
        $Untracked = @(git --literal-pathspecs ls-files --others --exclude-standard -- $File)
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to inspect untracked file: $File"
        }
        if ($Untracked.Count -eq 0) {
            continue
        }
        $FullPath = Join-Path $RepoRoot $File
        if (-not (Test-Path -LiteralPath $FullPath -PathType Leaf)) {
            continue
        }
        $LineNumber = 0
        foreach ($Line in Get-Content -LiteralPath $FullPath -Encoding UTF8) {
            $LineNumber += 1
            if ($Line -match '[ \t]+$') {
                Write-Host ("{0}:{1}: trailing whitespace." -f $File, $LineNumber)
                $IssueCount += 1
            }
        }
    }
    if ($IssueCount -gt 0) {
        throw "Whitespace issues detected in untracked files"
    }
}

function Invoke-Gate {
    param([Parameter(Mandatory = $true)] $Gate)

    $GateId = [string] $Gate.id
    $GateFiles = @($Gate.files)
    if ([string] $Gate.area -eq "frontend") {
        Assert-Node20
    }
    switch ($GateId) {
        "docs-whitespace" {
            Invoke-Check $GateId (Get-GateName $GateId) $RepoRoot {
                if ($Plan.change_set -eq "staged") {
                    git diff --cached --check
                    if ($LASTEXITCODE -ne 0) { throw "Whitespace issues detected in staged changes" }
                }
                elseif ($Plan.change_set -eq "working") {
                    git diff --check
                    if ($LASTEXITCODE -ne 0) { throw "Whitespace issues detected in working changes" }
                    Assert-UntrackedFilesHaveNoWhitespaceErrors -Files $GateFiles
                }
                else {
                    git diff --cached --check
                    if ($LASTEXITCODE -ne 0) { throw "Whitespace issues detected in staged changes" }
                    git diff --check
                    if ($LASTEXITCODE -ne 0) { throw "Whitespace issues detected in working changes" }
                    Assert-UntrackedFilesHaveNoWhitespaceErrors -Files $GateFiles
                }
            }
        }
        "docs-link-tests" {
            Invoke-Check $GateId (Get-GateName $GateId) $RepoRoot {
                python -m unittest scripts.dev.tests.test_check_markdown_links scripts.dev.tests.test_verify_local_docs_scope -v
            }
        }
        "docs-links" {
            Invoke-Check $GateId (Get-GateName $GateId) $RepoRoot {
                python scripts/dev/check_markdown_links.py --root $RepoRoot
            }
        }
        "frontend-lint-files" {
            $SourceFiles = @(Get-FrontendRelativeFiles $GateFiles | Where-Object { $_ -match '\.[cm]?[jt]sx?$' })
            Invoke-Check $GateId (Get-GateName $GateId) $FrontendRoot {
                if ($SourceFiles.Count -eq 0) {
                    Write-Host "No lintable changed frontend files."
                    return
                }
                $FileArgs = @()
                foreach ($file in $SourceFiles) { $FileArgs += @("--file", $file) }
                & $FrontendNextBin lint --max-warnings=0 @FileArgs
            }
        }
        "frontend-tsc-incremental" {
            Invoke-Check $GateId (Get-GateName $GateId) $FrontendRoot {
                & $FrontendTscBin --noEmit --incremental
            }
        }
        "frontend-vitest-related" {
            $RelatedFiles = @(Get-FrontendRelativeFiles $GateFiles)
            Invoke-Check $GateId (Get-GateName $GateId) $FrontendRoot {
                & $FrontendVitestBin related @RelatedFiles --run --passWithNoTests --pool=threads
            }
        }
        "frontend-direct-tests" {
            $TestFiles = @(Get-FrontendRelativeFiles $GateFiles)
            Invoke-Check $GateId (Get-GateName $GateId) $FrontendRoot {
                & $FrontendVitestBin run @TestFiles --pool=threads
            }
        }
        "frontend-lint" {
            Invoke-Check $GateId (Get-GateName $GateId) $FrontendRoot { npm run lint:strict }
        }
        "frontend-typecheck" {
            Invoke-Check $GateId (Get-GateName $GateId) $FrontendRoot { npm run typecheck:app }
        }
        "frontend-test-typecheck" {
            Invoke-Check $GateId (Get-GateName $GateId) $FrontendRoot { npm run typecheck:tests }
        }
        "frontend-e2e-typecheck" {
            Invoke-Check $GateId (Get-GateName $GateId) $FrontendRoot { npm run typecheck:e2e }
        }
        "frontend-coverage" {
            if ($env:DEXCOWIN_FRONTEND_MAX_WORKERS) {
                [int] $FrontendMaxWorkers = $env:DEXCOWIN_FRONTEND_MAX_WORKERS
                Invoke-Check $GateId (Get-GateName $GateId) $FrontendRoot {
                    npm run test:coverage -- "--maxWorkers=$FrontendMaxWorkers" "--minWorkers=1"
                }
            }
            else {
                Invoke-Check $GateId (Get-GateName $GateId) $FrontendRoot { npm run test:coverage }
            }
        }
        "frontend-build" {
            Invoke-Check $GateId (Get-GateName $GateId) $FrontendRoot { npm run build }
        }
        "frontend-bundle-size" {
            Invoke-Check $GateId (Get-GateName $GateId) $FrontendRoot { npm run check:bundle-size }
        }
        "backend-testmon" {
            Invoke-Check $GateId (Get-GateName $GateId) $BackendRoot { python -m pytest -q --testmon }
        }
        "backend-ruff" {
            Invoke-Check $GateId (Get-GateName $GateId) $BackendRoot { python -m ruff check . }
        }
        "backend-mypy" {
            Invoke-Check $GateId (Get-GateName $GateId) $BackendRoot { python -m mypy }
        }
        "backend-postgres-concurrency" {
            Invoke-Check $GateId (Get-GateName $GateId) $BackendRoot { python scripts/verify_postgres_concurrency.py }
        }
        "backend-pytest-full" {
            $WorkerCount = Get-BackendWorkerCount
            Invoke-Check $GateId (Get-GateName $GateId) $BackendRoot {
                python -m pytest -q -n $WorkerCount --dist=loadfile --testmon-noselect
            }
        }
        "backend-openapi" {
            Invoke-OpenApiDrift
        }
        "git-status" {
            Invoke-Check $GateId (Get-GateName $GateId) $RepoRoot { git status --short --branch }
        }
        "db-read-only" {
            Invoke-DbReadOnlyGate
        }
        "playwright-e2e" {
            Invoke-Check $GateId (Get-GateName $GateId) $RepoRoot {
                & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $VerifyE2EScript
            }
        }
        default {
            throw "Unknown verification gate: $GateId"
        }
    }
}

function Write-VerificationPlan {
    param([Parameter(Mandatory = $true)] $VerificationPlan, [object[]] $Gates)

    Write-Host ""
    Write-Host "==> Verification plan"
    Write-Host "Mode: $($VerificationPlan.mode)"
    Write-Host "Change set: $($VerificationPlan.change_set)"
    $Selected = @($VerificationPlan.selected_files)
    if ($Selected.Count -eq 0) {
        Write-Host "Selected changes: none"
    }
    else {
        Write-Host "Selected changes:"
        foreach ($file in $Selected) { Write-Host "   - $file" }
    }
    $Ignored = @($VerificationPlan.ignored_files)
    if ($Ignored.Count -gt 0) {
        Write-Host "Ignored changes:"
        foreach ($file in $Ignored) { Write-Host "   - $file" }
        Write-Warning "Ignored changes affect only impact planning."
        Write-Warning "Gates still run against the current working tree."
        Write-Warning "For an exact staged snapshot, use a clean dedicated worktree."
    }
    foreach ($item in @($VerificationPlan.escalations)) {
        Write-Host "Escalation [$($item.area)]: $($item.reason)"
    }
    if ($Gates.Count -eq 0) {
        Write-Host "Gates: none"
    }
    else {
        Write-Host "Gates:"
        foreach ($gate in $Gates) {
            Write-Host "   - $($gate.id) [$($gate.area)]: $($gate.reason)"
        }
    }
}

function Write-TimingReport {
    $TotalWatch.Stop()
    Write-Host ""
    Write-Host "==> Timing summary"
    if ($GateTimings.Count -eq 0) {
        Write-Host "   - no gates executed"
    }
    else {
        foreach ($timing in $GateTimings) {
            Write-Host "   - $($timing.id): $($timing.status), $($timing.duration_ms) ms"
        }
    }
    Write-Host "   - total: $([Math]::Round($TotalWatch.Elapsed.TotalMilliseconds, 3)) ms"

    if ($TimingOutput) {
        $TimingPath = if ([System.IO.Path]::IsPathRooted($TimingOutput)) {
            [System.IO.Path]::GetFullPath($TimingOutput)
        }
        else {
            [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $TimingOutput))
        }
        $TimingParent = Split-Path -Parent $TimingPath
        if (-not (Test-Path -LiteralPath $TimingParent)) {
            [System.IO.Directory]::CreateDirectory($TimingParent) | Out-Null
        }
        $Report = [ordered]@{
            mode = if ($Plan) { [string]($Plan.mode) } else { $Mode }
            change_set = if ($Plan) { [string]($Plan.change_set) } else { $ChangeSet }
            plan_only = [bool] $PlanOnly
            total_ms = [Math]::Round($TotalWatch.Elapsed.TotalMilliseconds, 3)
            gates = $GateTimings.ToArray()
        }
        $Report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $TimingPath -Encoding UTF8
    }
}

try {
    if ($InternalGateFile) {
        if (-not (Test-Path -LiteralPath $InternalGateFile -PathType Leaf)) {
            throw "Internal gate file not found: $InternalGateFile"
        }
        $InternalGate = Get-Content -LiteralPath $InternalGateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        Invoke-Gate $InternalGate
    }
    else {
        if (-not (Test-Path $PolicyScript)) {
            throw "Verification policy script not found: $PolicyScript"
        }
        $PolicyJson = (& python $PolicyScript --repo-root $RepoRoot --mode $Mode --change-set $ChangeSet | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) {
            throw "Verification policy failed with exit code $LASTEXITCODE"
        }
        $Plan = $PolicyJson | ConvertFrom-Json
        $Conflicts = @($Plan.conflicts)
        if ($Conflicts.Count -gt 0) {
            throw "Staged/working conflict: $($Conflicts -join ', ')"
        }

        $PlannedGates = @($Plan.gates)
        if ($DbReadOnlyCheck) {
            $PlannedGates += [pscustomobject]@{
                id = "db-read-only"
                area = "backend"
                kind = "optional"
                reason = "requested by -DbReadOnlyCheck"
                files = @()
            }
        }
        if ($IncludeE2E) {
            $PlannedGates += [pscustomobject]@{
                id = "playwright-e2e"
                area = "frontend"
                kind = "optional"
                reason = "requested by -IncludeE2E"
                files = @()
                runtime_guard = $VerifyE2EScript
            }
        }

        Write-VerificationPlan $Plan $PlannedGates
        if (-not $PlanOnly) {
            $BackendFullIds = @("backend-ruff", "backend-mypy", "backend-postgres-concurrency", "backend-pytest-full", "backend-openapi")
            $FrontendFullIds = @(
                "frontend-lint",
                "frontend-typecheck",
                "frontend-test-typecheck",
                "frontend-e2e-typecheck",
                "frontend-coverage",
                "frontend-build",
                "frontend-bundle-size"
            )
            $ParallelGateIds = @($BackendFullIds + $FrontendFullIds)
            $CanRunFullAreasInParallel = (
                [Environment]::ProcessorCount -ge $ParallelCpuThreshold -and
                (Test-ContainsGateIds -Gates $PlannedGates -RequiredIds $BackendFullIds) -and
                (Test-ContainsGateIds -Gates $PlannedGates -RequiredIds $FrontendFullIds)
            )
            if ($CanRunFullAreasInParallel) {
                Write-Host ""
                Write-Host "==> Running backend and frontend gates in parallel"
                Invoke-ParallelAreaGates -Gates $PlannedGates
                $PlannedGates = @(
                    $PlannedGates | Where-Object { [string] $_.id -notin $ParallelGateIds }
                )
            }

            $SmartParallelGateIds = @(
                "backend-testmon",
                "backend-ruff",
                "backend-mypy",
                "backend-openapi",
                "frontend-lint-files",
                "frontend-tsc-incremental",
                "frontend-vitest-related",
                "frontend-direct-tests"
            )
            $EscalatedAreas = @($Plan.escalations | ForEach-Object { [string] $_.area })
            $SmartParallelGates = @(
                $PlannedGates | Where-Object {
                    [string] $_.id -in $SmartParallelGateIds -and
                    (
                        [string] $_.kind -in @("targeted", "static") -or
                        (
                            [string] $_.id -eq "backend-openapi" -and
                            "backend" -notin $EscalatedAreas
                        )
                    )
                }
            )
            $CanRunSmartGatesInParallel = (
                $Mode -eq "smart" -and
                [Environment]::ProcessorCount -ge $ParallelCpuThreshold -and
                $SmartParallelGates.Count -ge 2
            )
            if ($CanRunSmartGatesInParallel) {
                Write-Host ""
                Write-Host "==> Running $($SmartParallelGates.Count) smart targeted gates in parallel"
                Invoke-ParallelTargetedGates -Gates $SmartParallelGates
                $ExecutedSmartIds = @($SmartParallelGates | ForEach-Object { [string] $_.id })
                $PlannedGates = @(
                    $PlannedGates | Where-Object { [string] $_.id -notin $ExecutedSmartIds }
                )
            }
            foreach ($gate in $PlannedGates) {
                Invoke-Gate $gate
            }
        }
    }
}
catch {
    $FailureMessage = $_.Exception.Message
    [Console]::Error.WriteLine("Verification failed: $FailureMessage")
}
finally {
    Write-TimingReport
}

if ($FailureMessage) {
    exit 1
}
if ($PlanOnly) {
    Write-Host ""
    Write-Host "Plan only - no gates executed."
}
else {
    Write-Host ""
    Write-Host "All local verification checks passed."
}
exit 0
