# Cache ownership is separate from immutable installation and verification records.
if (-not (Get-Command Invoke-CheckedExternalCommand -ErrorAction SilentlyContinue)) {
    . (Join-Path $PSScriptRoot 'checked-command.ps1')
}

function Invoke-FrontendCacheCommand {
    param(
        [Parameter(Mandatory = $true)][string] $RepoRoot,
        [string] $EmployeeRoot = 'C:\ERP-dev',
        [Parameter(Mandatory = $true)][string] $Command,
        [string[]] $Arguments = @()
    )
    $tool = Join-Path $RepoRoot 'scripts\ops\frontend_preparation_cache.py'
    return Invoke-CheckedExternalCommand -FilePath 'py.exe' -ArgumentList (@(
        $tool, $Command, '--repo-root', $RepoRoot, '--employee-root', $EmployeeRoot
    ) + $Arguments)
}

function Start-FrontendCacheSession {
    param([string] $RepoRoot, [string] $EmployeeRoot)
    $result = Invoke-FrontendCacheCommand -RepoRoot $RepoRoot -EmployeeRoot $EmployeeRoot `
        -Command 'session-begin' -Arguments @('--owner-pid', [string] $PID)
    $match = [regex]::Match(($result.Output -join [Environment]::NewLine), '(?m)^FRONTEND_CACHE_SESSION=([0-9a-f]{32})\s*$')
    if (-not $result.Success -or -not $match.Success) {
        $result.Output | Out-Host
        throw 'Frontend preparation session could not be acquired before deployment.'
    }
    return $match.Groups[1].Value
}

function Stop-FrontendCacheSession {
    param([string] $RepoRoot, [string] $EmployeeRoot, [string] $Session)
    $result = Invoke-FrontendCacheCommand -RepoRoot $RepoRoot -EmployeeRoot $EmployeeRoot `
        -Command 'session-end' -Arguments @('--session', $Session)
    if (-not $result.Success) {
        $result.Output | Out-Host
        Write-Warning 'Frontend cache session release failed; cleanup must be skipped.'
    }
    return $result.Success
}

function Save-FrontendInstalledCache {
    param([string] $RepoRoot, [string] $EmployeeRoot, [string] $Release, [string] $Record)
    try {
        $result = Invoke-FrontendCacheCommand -RepoRoot $RepoRoot -EmployeeRoot $EmployeeRoot `
            -Command 'installed' -Arguments @('--release', $Release, '--record', $Record)
        $result.Output | Out-Host
        if (-not $result.Success) {
            Write-Warning 'Installed cache identity could not be saved; deployment remains confirmed and cleanup is skipped.'
        }
        return $result.Success
    }
    catch {
        Write-Warning "Installed cache identity could not be saved: $($_.Exception.Message)"
        return $false
    }
}

function Invoke-FrontendPreparationCleanup {
    param([string] $RepoRoot, [string] $EmployeeRoot = 'C:\ERP-dev')
    try {
        $result = Invoke-FrontendCacheCommand -RepoRoot $RepoRoot -EmployeeRoot $EmployeeRoot `
            -Command 'cleanup' -Arguments @('--apply')
        $result.Output | Out-Host
        $status = [regex]::Match(($result.Output -join [Environment]::NewLine), '(?m)^FRONTEND_CACHE_RESULT=(PREVIEW|COMPLETED|SKIPPED|WARNING)\s*$')
        $report = [regex]::Match(($result.Output -join [Environment]::NewLine), '(?m)^FRONTEND_CACHE_REPORT=(.+?)\s*$')
        return [pscustomobject] @{
            Status = $(if ($result.Success -and $status.Success) { $status.Groups[1].Value } else { 'WARNING' })
            Report = $(if ($report.Success) { $report.Groups[1].Value } else { $null })
        }
    }
    catch {
        Write-Warning "Frontend cache cleanup skipped: $($_.Exception.Message)"
        return [pscustomobject] @{ Status = 'WARNING'; Report = $null }
    }
}
