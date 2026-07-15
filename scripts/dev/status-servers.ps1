# Report supervised DEXCOWIN MES runtime state for the current repo profile.

$ErrorActionPreference = "Continue"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
. (Join-Path $PSScriptRoot "runtime-paths.ps1")
. (Join-Path $PSScriptRoot "runtime-control.ps1")
$BackendLogDir = Get-MesRuntimePath -RepoRoot $Profile.RepoRoot -RelativePath "logs\backend"
$FrontendLogDir = Get-MesRuntimePath -RepoRoot $Profile.RepoRoot -RelativePath "logs\frontend"

function Test-HttpReady {
    param([string] $Url)

    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Show-ServiceStatus {
    param(
        [string] $Service,
        [int] $Port,
        [string] $StatePath,
        [string] $EventPath,
        [string] $HealthUrl
    )

    $state = Get-RuntimeState -Path $StatePath
    $supervisorPid = if ($state -and $state.supervisorPid) { [int] $state.supervisorPid } else { $null }
    $supervisorAlive = $false
    if ($supervisorPid -and (Test-ProcessAlive -ProcessId $supervisorPid)) {
        $supervisorCommand = Get-ProcessCommandLine -ProcessId $supervisorPid
        $supervisorAlive = Test-SupervisorProcessOwned `
            -ProcessId $supervisorPid `
            -ExpectedStartedAt ([string] $state.startedAt) `
            -RepoRoot $Profile.RepoRoot `
            -Service $Service `
            -StatePath $StatePath `
            -CommandLine $supervisorCommand
    }
    $childPid = if ($state -and $state.childPid) {
        [int] $state.childPid
    }
    elseif ($state -and $state.pid) {
        [int] $state.pid
    }
    else {
        $null
    }
    $childStartedAt = if ($state -and $state.childStartedAt) {
        [string] $state.childStartedAt
    }
    elseif ($state) {
        [string] $state.startedAt
    }
    else {
        ""
    }
    $childToleranceSeconds = if ($state -and $state.childPid) { 0.01 } else { 0.25 }
    $childAlive = $false
    if ($childPid -and (Test-ProcessAlive -ProcessId $childPid)) {
        $childCommand = Get-ProcessCommandLine -ProcessId $childPid
        $childAlive = Test-StoredRuntimeProcessOwned `
            -ProcessId $childPid `
            -ExpectedStartedAt $childStartedAt `
            -Service $Service `
            -Port $Port `
            -RepoRoot $Profile.RepoRoot `
            -StoredCwd ([string] $state.cwd) `
            -CommandLine $childCommand `
            -ToleranceSeconds $childToleranceSeconds
    }
    $listeners = @(Get-ListeningPortPids -Port $Port)
    $ready = Test-HttpReady -Url $HealthUrl
    $displayStatus = if ($supervisorAlive) {
        [string] $state.status
    }
    elseif ($listeners.Count -gt 0) {
        "unmanaged"
    }
    elseif ($state -and $state.status -notin @("stopped", "supervisor_error")) {
        "stale_supervisor"
    }
    else {
        "stopped"
    }
    $lastEvent = Get-LastRuntimeIncident -Path $EventPath
    $lastReason = if ($lastEvent) {
        [string] $lastEvent.event
    }
    elseif ($state -and $state.lastExit) {
        [string] $state.lastExit.reason
    }
    else {
        "-"
    }

    Write-Host "[$Service]"
    Write-Host "  status      : $displayStatus"
    Write-Host "  supervisor  : $supervisorPid (alive=$supervisorAlive)"
    Write-Host "  child       : $childPid (alive=$childAlive)"
    Write-Host "  port        : $Port (listening=$($listeners.Count -gt 0))"
    Write-Host "  health      : $HealthUrl (ready=$ready)"
    Write-Host "  restarts    : $($state.restartFailures)"
    Write-Host "  last reason : $lastReason"
    Write-Host "  events      : $EventPath"
    Write-Host ""
}

Write-Host "DEXCOWIN MES runtime status"
Write-Host "profile : $($Profile.Label)"
Write-Host "root    : $($Profile.RepoRoot)"
Write-Host "url     : $($Profile.PublicUrl)"
Write-Host ""

Show-ServiceStatus `
    -Service "backend" `
    -Port $Profile.BackendPort `
    -StatePath (Join-Path $BackendLogDir "backend-runtime.json") `
    -EventPath (Join-Path $BackendLogDir "backend-runtime-events.jsonl") `
    -HealthUrl "http://127.0.0.1:$($Profile.BackendPort)/health/live"

Show-ServiceStatus `
    -Service "frontend" `
    -Port $Profile.FrontendPort `
    -StatePath (Join-Path $FrontendLogDir "frontend-runtime.json") `
    -EventPath (Join-Path $FrontendLogDir "frontend-runtime-events.jsonl") `
    -HealthUrl "http://127.0.0.1:$($Profile.FrontendPort)/mes"
