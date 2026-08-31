$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "..\runtime-task-control.ps1")
. (Join-Path $PSScriptRoot "..\runtime-control.ps1")

function Assert-Equal {
    param(
        [object] $Actual,
        [object] $Expected,
        [string] $Message
    )

    if (-not [object]::Equals($Actual, $Expected)) {
        throw "$Message expected=[$Expected] actual=[$Actual]"
    }
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$developmentProfile = & (Join-Path $PSScriptRoot "..\resolve-server-profile.ps1") -TestRepoRoot $repoRoot
$developmentBackend = New-RuntimeTaskSpecification -Profile $developmentProfile -Service "backend"
Assert-Equal $developmentBackend.TaskName "DEXCOWIN MES Development Backend" "development backend task name"
Assert-Equal $developmentBackend.TriggerCount 0 "development backend trigger count"
Assert-Equal $developmentBackend.MultipleInstances "IgnoreNew" "multiple instance policy"
Assert-Equal $developmentBackend.ExecutionTimeLimit "PT0S" "execution time limit"
Assert-Equal $developmentBackend.RestartCount 3 "restart count"
Assert-Equal $developmentBackend.RestartInterval "PT1M" "restart interval"
Assert-Equal $developmentBackend.LogonType "Interactive" "logon type"
Assert-Equal $developmentBackend.RunLevel "Limited" "run level"
$developmentLauncher = Get-Content -Raw -LiteralPath $developmentBackend.LauncherPath
if ($developmentLauncher -notmatch '-RuntimeTaskHost') {
    throw "development backend launcher does not enter task host mode"
}
if ($developmentBackend.Execute -notmatch 'wscript\.exe$') {
    throw "development backend action does not use the independent launcher"
}
if ($developmentBackend.Arguments -notmatch [regex]::Escape((Join-Path $repoRoot 'scripts\dev\runtime-task-host.vbs'))) {
    throw "development backend action points to the wrong launcher"
}
if ($developmentBackend.Arguments -notmatch [regex]::Escape((Join-Path $repoRoot 'scripts\dev\start-backend.ps1'))) {
    throw "development backend action points to the wrong script"
}

$employeeProfile = & (Join-Path $PSScriptRoot "..\resolve-server-profile.ps1") -TestRepoRoot "C:\ERP-dev"
$employeeFrontend = New-RuntimeTaskSpecification -Profile $employeeProfile -Service "frontend"
Assert-Equal $employeeFrontend.TaskName "DEXCOWIN MES Employee Frontend" "employee frontend task name"
if ($employeeFrontend.Arguments -notmatch [regex]::Escape('C:\ERP-dev\scripts\dev\start-frontend.ps1')) {
    throw "employee frontend action points to the wrong script"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("dexcowin-runtime-task-test-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
    $requestPath = Join-Path $tempRoot "backend-launch-request.json"
    Write-RuntimeTaskLaunchRequest -Path $requestPath -Service "backend" -NoReload
    $request = Read-RuntimeTaskLaunchRequest -Path $requestPath
    Assert-Equal ([bool] $request.noReload) $true "NoReload request"
    Assert-Equal ([string] $request.service) "backend" "request service"
    if (Test-Path -LiteralPath $requestPath) {
        throw "launch request was not consumed atomically"
    }
}
finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

& {
    $probe = [pscustomobject]@{ Count = 0 }
    function Invoke-WebRequest {
        param(
            [string] $Uri,
            [int] $TimeoutSec,
            [switch] $UseBasicParsing,
            [string] $ErrorAction
        )
        $probe.Count += 1
        if ($probe.Count -eq 91) {
            return [pscustomobject]@{ StatusCode = 200 }
        }
        throw "frontend not ready"
    }
    function Start-Sleep { param([int] $Milliseconds) }

    $ready = Wait-RuntimeHttp200 -Url "http://127.0.0.1:3100/mes" -Attempts 120
    Assert-Equal $ready $true "external readiness after the internal 90-attempt window"
    Assert-Equal $probe.Count 91 "external readiness attempt count"
}

Write-Output "runtime task control contracts passed"
