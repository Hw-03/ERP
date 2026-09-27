# Read-only dependency probe: fail before changing services or databases.
param([string] $RepoRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-paths.ps1")
. (Join-Path $PSScriptRoot "runtime-control.ps1")
. (Join-Path $PSScriptRoot "checked-command.ps1")
try {
    $runtime = Get-MesRuntimeRoot -RepoRoot $RepoRoot
    $node = Resolve-ProfileFrontendNodeCommand -Profile ([pscustomobject]@{Name='development'}) -RuntimeRoot $runtime
    $frontend = Join-Path $RepoRoot "frontend"
    $cli = Join-Path $frontend "node_modules\next\dist\bin\next"
    $check = Invoke-CheckedExternalCommand -FilePath $node -ArgumentList @($cli, "--help") -WorkingDirectory $frontend
    if (-not $check.Success) {
        $check.Output | Out-Host
        throw "Next.js CLI dependencies unavailable (exit $($check.ExitCode)): $($check.LaunchError)"
    }
    Write-Host "FRONTEND_RUNTIME_CHECK=PASS"
    exit 0
}
catch {
    Write-Host "FRONTEND_RUNTIME_CHECK=FAILED"
    Write-Host $_.Exception.Message
    exit 1
}
