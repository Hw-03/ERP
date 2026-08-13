# Report schema readiness without modifying or independently opening the configured database.

param(
    [ValidateSet("Start", "Report")]
    [string] $Mode = "Start",
    [ValidateRange(1, 300)]
    [int] $CheckTimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"

try {
    $Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
    $BackendDir = Join-Path $Profile.RepoRoot "backend"
}
catch {
    Write-Host "[schema] CHECK_ERROR"
    Write-Host "[schema] readiness adapter initialization failed: $($_.Exception.Message)"
    exit 3
}

function Write-NotReadyGuidance {
    param([string] $ProfileName)

    if ($ProfileName -eq "development") {
        Write-Host "[schema] Development database preparation is required:"
        Write-Host "  cd backend"
        Write-Host "  python bootstrap_db.py --all"
        return
    }

    Write-Host "[schema] action=approved-sync-deploy"
    Write-Host "[schema] Employee database preparation must use the approved sync/deploy procedure."
}

function Stop-SchemaCheckProcessTree {
    param([System.Diagnostics.Process] $Process)

    if ($Process.HasExited) {
        return
    }
    $taskkill = Join-Path $env:SystemRoot "System32\taskkill.exe"
    if (Test-Path -LiteralPath $taskkill -PathType Leaf) {
        & $taskkill /PID ([string] $Process.Id) /T /F 2>$null | Out-Null
    }
    if (-not $Process.HasExited) {
        $Process.Kill()
    }
}

function Invoke-BoundedSchemaCheck {
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = "py.exe"
    $startInfo.Arguments = '"bootstrap_db.py" "--check"'
    $startInfo.WorkingDirectory = $BackendDir
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = [System.Diagnostics.Process]::new()
    try {
        $process.StartInfo = $startInfo
        $null = $process.Start()
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($CheckTimeoutSeconds * 1000)) {
            Stop-SchemaCheckProcessTree -Process $process
            if (-not $process.WaitForExit(5000)) {
                throw "schema check process tree did not terminate after timeout"
            }
            return [pscustomobject]@{
                Success = $false
                ExitCode = $null
                LaunchError = "schema check timed out after $CheckTimeoutSeconds seconds"
                Output = @()
            }
        }

        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        $output = @($stdout, $stderr) | Where-Object { $_ } | ForEach-Object {
            $_ -split "`r?`n" | Where-Object { $_ }
        }
        return [pscustomobject]@{
            Success = ($process.ExitCode -eq 0)
            ExitCode = [int] $process.ExitCode
            LaunchError = $null
            Output = @($output)
        }
    }
    catch {
        return [pscustomobject]@{
            Success = $false
            ExitCode = $null
            LaunchError = $_.Exception.Message
            Output = @()
        }
    }
    finally {
        $process.Dispose()
    }
}

Write-Host "[schema] mode=$Mode profile=$($Profile.Name) read-only readiness check"
$schemaCheck = Invoke-BoundedSchemaCheck

foreach ($line in $schemaCheck.Output) {
    Write-Host ([string] $line)
}

if ($schemaCheck.LaunchError) {
    Write-Host "[schema] CHECK_ERROR"
    Write-Host "[schema] bootstrap check launch failed: $($schemaCheck.LaunchError)"
    exit 3
}

$output = ($schemaCheck.Output | ForEach-Object { [string] $_ }) -join [Environment]::NewLine
$hasReady = [regex]::IsMatch(
    $output,
    '(?m)^\[schema-check\]\s+state=\S+.*\bready=True\b'
)
$hasNotReady = [regex]::IsMatch(
    $output,
    '(?m)^\[schema-check\]\s+state=\S+.*\bready=False\b'
)
$hasCheckError = [regex]::IsMatch($output, '(?m)^\[schema-check\]\s+ERROR:')

if ($hasCheckError) {
    Write-Host "[schema] CHECK_ERROR"
    exit 3
}

if ($hasNotReady -and -not $hasReady) {
    Write-Host "[schema] NOT_READY"
    Write-NotReadyGuidance -ProfileName $Profile.Name
    exit 2
}

if ($schemaCheck.Success -and $hasReady -and -not $hasNotReady) {
    Write-Host "[schema] READY"
    exit 0
}

Write-Host "[schema] CHECK_ERROR"
Write-Host "[schema] bootstrap check returned no consistent readiness marker (exit $($schemaCheck.ExitCode))."
exit 3
