# Start or recover the supervised DEXCOWIN MES backend through Task Scheduler.

param(
    [switch] $NoReload,
    [switch] $RuntimeTaskHost
)

$ErrorActionPreference = "Stop"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
. (Join-Path $PSScriptRoot "runtime-paths.ps1")
. (Join-Path $PSScriptRoot "runtime-control.ps1")
. (Join-Path $PSScriptRoot "runtime-task-control.ps1")

$BackendDir = Join-Path $Profile.RepoRoot "backend"
$RuntimeRoot = Get-MesRuntimeRoot -RepoRoot $Profile.RepoRoot
$LogDir = Get-MesRuntimePath -RepoRoot $Profile.RepoRoot -RelativePath "logs\backend" -CreateDirectory
$StatePath = Join-Path $LogDir "backend-runtime.json"
$EventPath = Join-Path $LogDir "backend-runtime-events.jsonl"
$ControlPath = Join-Path $LogDir "backend-runtime-control.json"
$LaunchRequestPath = Join-Path $LogDir "backend-runtime-launch-request.json"
$StdoutLog = Join-Path $LogDir "backend-dev.out.log"
$StderrLog = Join-Path $LogDir "backend-dev.err.log"
$LiveUrl = "http://127.0.0.1:$($Profile.BackendPort)/health/live"
$ReadyUrl = "http://127.0.0.1:$($Profile.BackendPort)/health/ready"

if (-not (Test-Path $BackendDir)) {
    throw "Backend directory not found: $BackendDir"
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Start-BackendSupervisor {
    param([object] $Request)

    $effectiveNoReload = $false
    if ($null -ne $Request) {
        $effectiveNoReload = [bool] $Request.noReload
    }
    else {
        $previousState = Get-RuntimeState -Path $StatePath
        if ($previousState -and $previousState.command) {
            $effectiveNoReload = "--reload" -notin @($previousState.command)
        }
    }
    $childCommand = @(
        "py", "-m", "uvicorn", "app.main:app",
        "--host", "0.0.0.0",
        "--port", [string] $Profile.BackendPort,
        "--workers", "1",
        "--no-proxy-headers"
    )
    if (-not $effectiveNoReload) { $childCommand += "--reload" }

    $launch = Start-ServiceSupervisor `
        -Profile $Profile `
        -Service "backend" `
        -Port $Profile.BackendPort `
        -ServiceDir $BackendDir `
        -StatePath $StatePath `
        -EventPath $EventPath `
        -ControlPath $ControlPath `
        -StdoutLog $StdoutLog `
        -StderrLog $StderrLog `
        -ChildCommand $childCommand `
        -Environment @{ MES_RUNTIME_ROOT = $RuntimeRoot }

    if (-not (Wait-RuntimeHttp200 -Url $LiveUrl -Attempts 90)) {
        $state = Get-RuntimeState -Path $StatePath
        throw "[start-backend] Backend did not respond on $LiveUrl. status=$($state.status). Check $EventPath"
    }
    if (-not (Wait-RuntimeHttp200 -Url $ReadyUrl -Attempts 1)) {
        Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service "backend" `
            -Event "service_not_ready" `
            -Details @{ readyUrl = $ReadyUrl }
    }
    return $launch
}

if ($RuntimeTaskHost) {
    $hostExit = Invoke-RuntimeTaskHost `
        -Profile $Profile `
        -Service "backend" `
        -Port $Profile.BackendPort `
        -StatePath $StatePath `
        -EventPath $EventPath `
        -ControlPath $ControlPath `
        -LaunchRequestPath $LaunchRequestPath `
        -StartAction { param($Request) Start-BackendSupervisor -Request $Request | Out-Null }
    exit $hostExit
}

Assert-RuntimeTaskConfigured -RepoRoot $Profile.RepoRoot -Service "backend" | Out-Null
$request = Write-RuntimeTaskLaunchRequest `
    -Path $LaunchRequestPath `
    -Service "backend" `
    -NoReload:$NoReload
Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service "backend" `
    -Event "runtime_task_start_requested" `
    -Details @{ request = $request }
Request-RuntimeTaskStart -RepoRoot $Profile.RepoRoot -Service "backend" | Out-Null

if (-not (Wait-RuntimeHttp200 -Url $ReadyUrl -Attempts 120)) {
    $state = Get-RuntimeState -Path $StatePath
    $task = Get-RuntimeTaskRegistration -RepoRoot $Profile.RepoRoot -Service "backend"
    throw "[start-backend] Backend did not become ready on $ReadyUrl. task=$($task.Status) runtime=$($state.status). Check $EventPath"
}

Write-Host "[start-backend] OK - $($Profile.Label) backend ready on $ReadyUrl"
Write-Host "[start-backend] runtime owner: $((Get-RuntimeTaskSpecification -RepoRoot $Profile.RepoRoot -Service 'backend').TaskName)"
Write-Host "[start-backend] runtime events: $EventPath"
