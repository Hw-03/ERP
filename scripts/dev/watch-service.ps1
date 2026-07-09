param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("backend", "frontend")]
    [string] $Service
)

# Stream one service log pane. This script never controls server lifetime.

$ErrorActionPreference = "Continue"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
$RepoRoot = $Profile.RepoRoot
$BackendLogDir = Join-Path $RepoRoot "backend\logs"
$FrontendLogDir = Join-Path $RepoRoot "frontend\logs"
$BackendOut = Join-Path $BackendLogDir "backend-dev.out.log"
$BackendErr = Join-Path $BackendLogDir "backend-dev.err.log"
$FrontendOut = Join-Path $FrontendLogDir "frontend-dev.out.log"
$FrontendErr = Join-Path $FrontendLogDir "frontend-dev.err.log"

$ServiceTitle = if ($Service -eq "backend") { "Backend" } else { "Frontend" }
try {
    $Host.UI.RawUI.WindowTitle = "DEXCOWIN MES $ServiceTitle Log"
}
catch {
    # Some hosts do not allow title updates.
}

function Test-LineMatchesAny {
    param(
        [string] $Line,
        [string[]] $Patterns
    )

    foreach ($pattern in $Patterns) {
        if ($Line -match $pattern) {
            return $true
        }
    }
    return $false
}

function Write-WatchLine {
    param(
        [string] $Line,
        [string[]] $ErrorPatterns
    )

    if (Test-LineMatchesAny -Line $Line -Patterns $ErrorPatterns) {
        Write-Host "[FRONTEND ERROR] $Line" -ForegroundColor Red
        return
    }

    Write-Host $Line
}

function Wait-LogPaths {
    param([string[]] $Paths)

    while ($true) {
        $existing = @($Paths | Where-Object { Test-Path $_ })
        if ($existing.Count -gt 0) {
            return $existing
        }

        Write-Host "Waiting for log files..."
        Start-Sleep -Seconds 2
    }
}

function Watch-LogFiles {
    param(
        [string] $Title,
        [string[]] $Paths,
        [string[]] $NoisePatterns,
        [string[]] $ErrorPatterns = @()
    )

    $existingPaths = Wait-LogPaths $Paths
    Write-Host "===== $Title ====="
    foreach ($path in $existingPaths) {
        Write-Host "[log] $path"
    }
    Write-Host ""

    Get-Content -Path $existingPaths -Tail 80 -Wait -ErrorAction SilentlyContinue |
        Where-Object { $_ -and -not (Test-LineMatchesAny -Line $_ -Patterns $NoisePatterns) } |
        ForEach-Object { Write-WatchLine -Line $_ -ErrorPatterns $ErrorPatterns }
}

$FrontendStdoutNoise = @()

$FrontendStderrNoise = @(
    "NO_COLOR.*FORCE_COLOR",
    "Use ``node --trace-warnings"
)

$FrontendErrorPatterns = @(
    "Failed to compile",
    "Syntax Error",
    "Import trace for requested module",
    "^\s*Error:",
    "Unexpected eof",
    "Expected a semicolon",
    "declarations must be initialized"
)

if ($Service -eq "backend") {
    Watch-LogFiles "Backend logs" @($BackendOut, $BackendErr) @()
}
else {
    Watch-LogFiles "Frontend logs" @($FrontendOut, $FrontendErr) ($FrontendStdoutNoise + $FrontendStderrNoise) $FrontendErrorPatterns
}
