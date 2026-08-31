# Start or recover the supervised DEXCOWIN MES frontend through Task Scheduler.

param([switch] $RuntimeTaskHost)

$ErrorActionPreference = "Stop"

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
. (Join-Path $PSScriptRoot "runtime-paths.ps1")
. (Join-Path $PSScriptRoot "runtime-control.ps1")
. (Join-Path $PSScriptRoot "runtime-task-control.ps1")

$FrontendDir = Join-Path $Profile.RepoRoot "frontend"
$RuntimeRoot = Get-MesRuntimeRoot -RepoRoot $Profile.RepoRoot
$LogDir = Get-MesRuntimePath -RepoRoot $Profile.RepoRoot -RelativePath "logs\frontend" -CreateDirectory
$StatePath = Join-Path $LogDir "frontend-runtime.json"
$EventPath = Join-Path $LogDir "frontend-runtime-events.jsonl"
$ControlPath = Join-Path $LogDir "frontend-runtime-control.json"
$LaunchRequestPath = Join-Path $LogDir "frontend-runtime-launch-request.json"
$StdoutLog = Join-Path $LogDir "frontend-dev.out.log"
$StderrLog = Join-Path $LogDir "frontend-dev.err.log"
$HealthUrl = "http://127.0.0.1:$($Profile.FrontendPort)/mes"

if (-not (Test-Path $FrontendDir)) {
    throw "Frontend directory not found: $FrontendDir"
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Start-FrontendSupervisor {
    param([object] $Request)

    $startup = Invoke-ProfileFrontendStartup `
        -Profile $Profile `
        -FrontendDir $FrontendDir `
        -RuntimeRoot $RuntimeRoot `
        -StatePath $StatePath `
        -EventPath $EventPath `
        -ControlPath $ControlPath `
        -StdoutLog $StdoutLog `
        -StderrLog $StderrLog
    return $startup.Launch
}

if ($RuntimeTaskHost) {
    $hostExit = Invoke-RuntimeTaskHost `
        -Profile $Profile `
        -Service "frontend" `
        -Port $Profile.FrontendPort `
        -StatePath $StatePath `
        -EventPath $EventPath `
        -ControlPath $ControlPath `
        -LaunchRequestPath $LaunchRequestPath `
        -StartAction { param($Request) Start-FrontendSupervisor -Request $Request | Out-Null }
    exit $hostExit
}

Assert-RuntimeTaskConfigured -RepoRoot $Profile.RepoRoot -Service "frontend" | Out-Null
$request = Write-RuntimeTaskLaunchRequest -Path $LaunchRequestPath -Service "frontend"
Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service "frontend" `
    -Event "runtime_task_start_requested" `
    -Details @{ request = $request }
Request-RuntimeTaskStart -RepoRoot $Profile.RepoRoot -Service "frontend" | Out-Null

if (-not (Wait-RuntimeHttp200 -Url $HealthUrl -Attempts 120)) {
    $state = Get-RuntimeState -Path $StatePath
    $task = Get-RuntimeTaskRegistration -RepoRoot $Profile.RepoRoot -Service "frontend"
    throw "[start-frontend] Frontend did not respond on $HealthUrl. task=$($task.Status) runtime=$($state.status). Check $EventPath"
}

Write-Host "[start-frontend] OK - $($Profile.Label) frontend ready on $HealthUrl"
Write-Host "[start-frontend] runtime owner: $((Get-RuntimeTaskSpecification -RepoRoot $Profile.RepoRoot -Service 'frontend').TaskName)"
Write-Host "[start-frontend] runtime events: $EventPath"
