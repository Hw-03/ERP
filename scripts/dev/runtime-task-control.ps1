# Shared on-demand Task Scheduler control for DEXCOWIN MES runtimes.

$script:RuntimeTaskUtf8NoBom = New-Object System.Text.UTF8Encoding($false)

function New-RuntimeTaskSpecification {
    param(
        [Parameter(Mandatory = $true)][object] $Profile,
        [Parameter(Mandatory = $true)][ValidateSet("backend", "frontend")][string] $Service
    )

    $resolvedRoot = [System.IO.Path]::GetFullPath([string] $Profile.RepoRoot).TrimEnd('\')
    $profileTitle = if ($Profile.Name -eq "employee") { "Employee" } else { "Development" }
    $serviceTitle = if ($Service -eq "backend") { "Backend" } else { "Frontend" }
    $scriptPath = Join-Path $resolvedRoot "scripts\dev\start-$Service.ps1"
    $launcherPath = Join-Path $resolvedRoot "scripts\dev\runtime-task-host.vbs"
    $windowsScriptHost = (Get-Command wscript.exe -ErrorAction Stop).Source
    $powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()

    return [pscustomobject]@{
        TaskName = "DEXCOWIN MES $profileTitle $serviceTitle"
        Profile = $Profile.Name
        Service = $Service
        RepoRoot = $resolvedRoot
        Execute = [System.IO.Path]::GetFullPath($windowsScriptHost)
        Arguments = "`"$launcherPath`" `"$powerShell`" `"$scriptPath`""
        LauncherPath = $launcherPath
        PowerShellPath = [System.IO.Path]::GetFullPath($powerShell)
        EntryScript = $scriptPath
        WorkingDirectory = $resolvedRoot
        UserId = $identity.Name
        UserSid = $identity.User.Value
        LogonType = "Interactive"
        RunLevel = "Limited"
        MultipleInstances = "IgnoreNew"
        ExecutionTimeLimit = "PT0S"
        RestartCount = 3
        RestartInterval = "PT1M"
        UseUnifiedSchedulingEngine = $false
        TaskSchemaVersion = "1.2"
        TriggerCount = 0
    }
}

function Get-RuntimeTaskSpecification {
    param(
        [Parameter(Mandatory = $true)][string] $RepoRoot,
        [Parameter(Mandatory = $true)][ValidateSet("backend", "frontend")][string] $Service
    )

    $resolvedRoot = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\')
    $profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1") -RuntimeRepoRoot $resolvedRoot
    return New-RuntimeTaskSpecification -Profile $profile -Service $Service
}

function Write-RuntimeTaskLaunchRequest {
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][ValidateSet("backend", "frontend")][string] $Service,
        [switch] $NoReload
    )

    $directory = Split-Path -Parent $Path
    if ($directory) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
    $request = [ordered]@{
        schemaVersion = 1
        requestId = [guid]::NewGuid().ToString("N")
        requestedAt = (Get-Date).ToString("o")
        requestedBy = [Environment]::UserName
        requesterPid = $PID
        service = $Service
        noReload = [bool] $NoReload
    }
    $temporaryPath = "$Path.$PID.$([guid]::NewGuid().ToString('N')).tmp"
    try {
        $json = $request | ConvertTo-Json -Depth 5
        [System.IO.File]::WriteAllText($temporaryPath, "$json`n", $script:RuntimeTaskUtf8NoBom)
        Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
    }
    finally {
        Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
    }
    return [pscustomobject] $request
}

function Read-RuntimeTaskLaunchRequest {
    param([Parameter(Mandatory = $true)][string] $Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    $claimedPath = "$Path.$PID.$([guid]::NewGuid().ToString('N')).claimed"
    try {
        Move-Item -LiteralPath $Path -Destination $claimedPath -ErrorAction Stop
        return Get-Content -Raw -LiteralPath $claimedPath | ConvertFrom-Json
    }
    catch [System.IO.IOException] {
        return $null
    }
    finally {
        Remove-Item -LiteralPath $claimedPath -Force -ErrorAction SilentlyContinue
    }
}

function Test-RuntimeTaskIdentity {
    param(
        [string] $Actual,
        [object] $Specification
    )

    if ([string]::IsNullOrWhiteSpace($Actual)) { return $false }
    if ([string]::Equals($Actual, $Specification.UserId, [System.StringComparison]::OrdinalIgnoreCase) -or
        [string]::Equals($Actual, $Specification.UserSid, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }
    try {
        $sid = [System.Security.Principal.NTAccount]::new($Actual).Translate(
            [System.Security.Principal.SecurityIdentifier]
        ).Value
        return [string]::Equals($sid, $Specification.UserSid, [System.StringComparison]::OrdinalIgnoreCase)
    }
    catch {
        return $false
    }
}

function Get-RuntimeTaskXmlValue {
    param(
        [xml] $Xml,
        [System.Xml.XmlNamespaceManager] $Namespace,
        [string] $XPath
    )

    $node = $Xml.SelectSingleNode($XPath, $Namespace)
    if ($null -eq $node) { return $null }
    return [string] $node.InnerText
}

function Test-RuntimeTaskXmlConfiguration {
    param(
        [Parameter(Mandatory = $true)][object] $Specification,
        [Parameter(Mandatory = $true)][xml] $Xml
    )

    $namespace = New-Object System.Xml.XmlNamespaceManager($Xml.NameTable)
    $namespace.AddNamespace("t", $Xml.DocumentElement.NamespaceURI)
    $errors = [System.Collections.Generic.List[string]]::new()
    $actualCommand = Get-RuntimeTaskXmlValue $Xml $namespace "/t:Task/t:Actions/t:Exec/t:Command"
    $actualArguments = Get-RuntimeTaskXmlValue $Xml $namespace "/t:Task/t:Actions/t:Exec/t:Arguments"
    $actualWorkingDirectory = Get-RuntimeTaskXmlValue $Xml $namespace "/t:Task/t:Actions/t:Exec/t:WorkingDirectory"
    $actualUserId = Get-RuntimeTaskXmlValue $Xml $namespace "/t:Task/t:Principals/t:Principal/t:UserId"
    $actualLogonType = Get-RuntimeTaskXmlValue $Xml $namespace "/t:Task/t:Principals/t:Principal/t:LogonType"
    $actualRunLevel = Get-RuntimeTaskXmlValue $Xml $namespace "/t:Task/t:Principals/t:Principal/t:RunLevel"
    $multipleInstances = Get-RuntimeTaskXmlValue $Xml $namespace "/t:Task/t:Settings/t:MultipleInstancesPolicy"
    $executionTimeLimit = Get-RuntimeTaskXmlValue $Xml $namespace "/t:Task/t:Settings/t:ExecutionTimeLimit"
    $restartCount = Get-RuntimeTaskXmlValue $Xml $namespace "/t:Task/t:Settings/t:RestartOnFailure/t:Count"
    $restartInterval = Get-RuntimeTaskXmlValue $Xml $namespace "/t:Task/t:Settings/t:RestartOnFailure/t:Interval"
    $useUnifiedSchedulingEngine = Get-RuntimeTaskXmlValue $Xml $namespace "/t:Task/t:Settings/t:UseUnifiedSchedulingEngine"
    $triggerCount = $Xml.SelectNodes("/t:Task/t:Triggers/*", $namespace).Count

    try { $normalizedCommand = [System.IO.Path]::GetFullPath($actualCommand.Trim('"')) }
    catch { $normalizedCommand = "" }
    try { $normalizedWorkingDirectory = [System.IO.Path]::GetFullPath($actualWorkingDirectory).TrimEnd('\') }
    catch { $normalizedWorkingDirectory = "" }

    if (-not [string]::Equals($normalizedCommand, $Specification.Execute, [System.StringComparison]::OrdinalIgnoreCase)) {
        $errors.Add("executable mismatch")
    }
    if (-not [string]::Equals($actualArguments, $Specification.Arguments, [System.StringComparison]::OrdinalIgnoreCase)) {
        $errors.Add("arguments mismatch")
    }
    if (-not [string]::Equals($normalizedWorkingDirectory, $Specification.WorkingDirectory, [System.StringComparison]::OrdinalIgnoreCase)) {
        $errors.Add("working directory mismatch")
    }
    if (-not (Test-RuntimeTaskIdentity -Actual $actualUserId -Specification $Specification)) {
        $errors.Add("task user mismatch")
    }
    if ($actualLogonType -ne "InteractiveToken") { $errors.Add("logon type mismatch") }
    # Task Scheduler omits RunLevel when the principal uses the default Limited/LeastPrivilege level.
    if ($actualRunLevel -and $actualRunLevel -ne "LeastPrivilege") { $errors.Add("run level mismatch") }
    if ($multipleInstances -ne $Specification.MultipleInstances) { $errors.Add("multiple instance policy mismatch") }
    if ($executionTimeLimit -ne $Specification.ExecutionTimeLimit) { $errors.Add("execution time limit mismatch") }
    if ([int] $restartCount -ne $Specification.RestartCount) { $errors.Add("restart count mismatch") }
    if ($restartInterval -ne $Specification.RestartInterval) { $errors.Add("restart interval mismatch") }
    if ($useUnifiedSchedulingEngine -eq "true") { $errors.Add("unified scheduling engine must be disabled") }
    if ([string] $Xml.Task.version -ne $Specification.TaskSchemaVersion) { $errors.Add("task schema version mismatch") }
    if ($triggerCount -ne 0) { $errors.Add("unexpected trigger") }

    return [pscustomobject]@{
        Valid = $errors.Count -eq 0
        Errors = @($errors)
    }
}

function Get-RuntimeTaskRegistration {
    param(
        [Parameter(Mandatory = $true)][string] $RepoRoot,
        [Parameter(Mandatory = $true)][ValidateSet("backend", "frontend")][string] $Service
    )

    $specification = Get-RuntimeTaskSpecification -RepoRoot $RepoRoot -Service $Service
    $task = Get-ScheduledTask -TaskName $specification.TaskName -ErrorAction SilentlyContinue
    if (-not $task) {
        return [pscustomobject]@{
            TaskName = $specification.TaskName
            Status = "missing"
            State = "Missing"
            Valid = $false
            Errors = @("scheduled task missing")
            Specification = $specification
        }
    }
    try {
        [xml] $xml = Export-ScheduledTask -TaskName $specification.TaskName -ErrorAction Stop
        $validation = Test-RuntimeTaskXmlConfiguration -Specification $specification -Xml $xml
    }
    catch {
        $validation = [pscustomobject]@{ Valid = $false; Errors = @($_.Exception.Message) }
    }
    $status = if (-not $validation.Valid) { "misconfigured" } elseif ([string] $task.State -eq "Running") { "running" } else { "ready" }
    return [pscustomobject]@{
        TaskName = $specification.TaskName
        Status = $status
        State = [string] $task.State
        Valid = [bool] $validation.Valid
        Errors = @($validation.Errors)
        Specification = $specification
    }
}

function Assert-RuntimeTaskConfigured {
    param(
        [Parameter(Mandatory = $true)][string] $RepoRoot,
        [Parameter(Mandatory = $true)][ValidateSet("backend", "frontend")][string] $Service
    )

    $registration = Get-RuntimeTaskRegistration -RepoRoot $RepoRoot -Service $Service
    if (-not $registration.Valid) {
        $reason = $registration.Errors -join "; "
        $registerScript = Join-Path $RepoRoot "scripts\dev\register-runtime-tasks.ps1"
        throw "[$Service] Runtime task '$($registration.TaskName)' is $($registration.Status): $reason. Re-register: powershell -ExecutionPolicy Bypass -File `"$registerScript`" -RepoRoot `"$RepoRoot`""
    }
    return $registration
}

function Assert-RuntimeTasksConfigured {
    param([Parameter(Mandatory = $true)][string] $RepoRoot)

    foreach ($service in @("backend", "frontend")) {
        Assert-RuntimeTaskConfigured -RepoRoot $RepoRoot -Service $service | Out-Null
    }
}

function Request-RuntimeTaskStart {
    param(
        [Parameter(Mandatory = $true)][string] $RepoRoot,
        [Parameter(Mandatory = $true)][ValidateSet("backend", "frontend")][string] $Service
    )

    $registration = Assert-RuntimeTaskConfigured -RepoRoot $RepoRoot -Service $Service
    Start-ScheduledTask -TaskName $registration.TaskName -ErrorAction Stop
    return $registration
}

function Stop-RuntimeScheduledTask {
    param(
        [Parameter(Mandatory = $true)][string] $RepoRoot,
        [Parameter(Mandatory = $true)][ValidateSet("backend", "frontend")][string] $Service,
        [string] $LaunchRequestPath
    )

    if ($LaunchRequestPath) {
        Remove-Item -LiteralPath $LaunchRequestPath -Force -ErrorAction SilentlyContinue
    }
    $specification = Get-RuntimeTaskSpecification -RepoRoot $RepoRoot -Service $Service
    $task = Get-ScheduledTask -TaskName $specification.TaskName -ErrorAction SilentlyContinue
    if ($task -and [string] $task.State -in @("Running", "Queued")) {
        Stop-ScheduledTask -TaskName $specification.TaskName -ErrorAction Stop
    }
}

function Test-RuntimeTaskSupervisorOwned {
    param(
        [Parameter(Mandatory = $true)][object] $Profile,
        [Parameter(Mandatory = $true)][ValidateSet("backend", "frontend")][string] $Service,
        [Parameter(Mandatory = $true)][string] $StatePath,
        [object] $State
    )

    if (-not $State -or -not $State.supervisorPid -or
        -not (Test-ProcessAlive -ProcessId $State.supervisorPid)) {
        return $false
    }
    $commandLine = ""
    for ($commandAttempt = 0; $commandAttempt -lt 5; $commandAttempt++) {
        $commandLine = Get-ProcessCommandLine -ProcessId ([int] $State.supervisorPid)
        if (-not [string]::IsNullOrWhiteSpace($commandLine)) { break }
        Start-Sleep -Milliseconds 200
    }
    if ([string]::IsNullOrWhiteSpace($commandLine)) { return $false }
    return Test-SupervisorProcessOwned `
        -ProcessId ([int] $State.supervisorPid) `
        -ExpectedStartedAt ([string] $State.startedAt) `
        -RepoRoot $Profile.RepoRoot `
        -Service $Service `
        -StatePath $StatePath `
        -CommandLine $commandLine
}

function Repair-RuntimeTaskOrphans {
    param(
        [Parameter(Mandatory = $true)][object] $Profile,
        [Parameter(Mandatory = $true)][ValidateSet("backend", "frontend")][string] $Service,
        [Parameter(Mandatory = $true)][int] $Port,
        [Parameter(Mandatory = $true)][string] $StatePath,
        [Parameter(Mandatory = $true)][string] $EventPath,
        [Parameter(Mandatory = $true)][string] $ControlPath,
        [Parameter(Mandatory = $true)][string] $Source
    )

    $state = Get-RuntimeState -Path $StatePath
    if (Test-RuntimeTaskSupervisorOwned `
        -Profile $Profile -Service $Service -StatePath $StatePath -State $state) {
        return
    }
    $listeners = @(Get-ListeningPortPids -Port $Port)
    if ($listeners.Count -eq 0 -and
        (-not $state -or $state.status -in @("stopped", "supervisor_error"))) {
        return
    }
    Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
        -Event "runtime_task_host_recovering" `
        -Details @{ taskHostPid = $PID; listeners = $listeners; previousState = $state; source = $Source }
    Stop-SupervisedService `
        -Profile $Profile -Service $Service -Port $Port `
        -StatePath $StatePath -EventPath $EventPath -ControlPath $ControlPath `
        -Source $Source
}

function Invoke-RuntimeTaskHost {
    param(
        [Parameter(Mandatory = $true)][object] $Profile,
        [Parameter(Mandatory = $true)][ValidateSet("backend", "frontend")][string] $Service,
        [Parameter(Mandatory = $true)][int] $Port,
        [Parameter(Mandatory = $true)][string] $StatePath,
        [Parameter(Mandatory = $true)][string] $EventPath,
        [Parameter(Mandatory = $true)][string] $ControlPath,
        [Parameter(Mandatory = $true)][string] $LaunchRequestPath,
        [Parameter(Mandatory = $true)][scriptblock] $StartAction
    )

    try {
        Repair-RuntimeTaskOrphans `
            -Profile $Profile -Service $Service -Port $Port `
            -StatePath $StatePath -EventPath $EventPath -ControlPath $ControlPath `
            -Source "runtime-task-host-recovery"

        $request = Read-RuntimeTaskLaunchRequest -Path $LaunchRequestPath
        if ($request -and [string] $request.service -ne $Service) {
            throw "[$Service] Launch request service mismatch: $($request.service)"
        }
        Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
            -Event "runtime_task_host_started" `
            -Details @{ taskHostPid = $PID; request = $request; launcher = "wscript" }
        & $StartAction $request

        while ($true) {
            $nextRequest = Read-RuntimeTaskLaunchRequest -Path $LaunchRequestPath
            if ($nextRequest) {
                if ([string] $nextRequest.service -ne $Service) {
                    throw "[$Service] Launch request service mismatch: $($nextRequest.service)"
                }
                & $StartAction $nextRequest
            }

            $state = Get-RuntimeState -Path $StatePath
            if ($state -and $state.status -eq "stopped") {
                Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                    -Event "runtime_task_host_exited" `
                    -Details @{ taskHostPid = $PID; planned = $true }
                return 0
            }
            $supervisorOwned = Test-RuntimeTaskSupervisorOwned `
                -Profile $Profile -Service $Service -StatePath $StatePath -State $state
            if (-not $supervisorOwned) {
                Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                    -Event "runtime_task_host_supervisor_lost" `
                    -Details @{ taskHostPid = $PID; planned = $false; previousState = $state }
                $recovered = $false
                for ($retryAttempt = 1; $retryAttempt -le 3; $retryAttempt++) {
                    Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                        -Event "runtime_task_host_retry_scheduled" `
                        -Details @{ taskHostPid = $PID; attempt = $retryAttempt; delaySeconds = 60 }
                    Start-Sleep -Seconds 60
                    try {
                        Repair-RuntimeTaskOrphans `
                            -Profile $Profile -Service $Service -Port $Port `
                            -StatePath $StatePath -EventPath $EventPath -ControlPath $ControlPath `
                            -Source "runtime-task-host-retry-$retryAttempt"
                        & $StartAction $null
                        $recoveredState = Get-RuntimeState -Path $StatePath
                        if (-not (Test-RuntimeTaskSupervisorOwned `
                            -Profile $Profile -Service $Service -StatePath $StatePath -State $recoveredState)) {
                            throw "[$Service] Supervisor was not owned after retry $retryAttempt."
                        }
                        Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                            -Event "runtime_task_host_recovered" `
                            -Details @{ taskHostPid = $PID; attempt = $retryAttempt; supervisorPid = $recoveredState.supervisorPid }
                        $recovered = $true
                        break
                    }
                    catch {
                        Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                            -Event "runtime_task_host_retry_failed" `
                            -Details @{ taskHostPid = $PID; attempt = $retryAttempt; message = $_.Exception.Message }
                    }
                }
                if ($recovered) { continue }
                Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                    -Event "runtime_task_host_exited" `
                    -Details @{ taskHostPid = $PID; planned = $false; previousState = $state; retriesExhausted = $true }
                return 1
            }
            Start-Sleep -Seconds 1
        }
    }
    catch {
        Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
            -Event "runtime_task_host_error" `
            -Details @{ taskHostPid = $PID; message = $_.Exception.Message }
        Write-Error $_
        return 1
    }
}
