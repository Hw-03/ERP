# Shared runtime control helpers for supervised DEXCOWIN MES services.

$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Get-RuntimeState {
    param([Parameter(Mandatory = $true)][string] $Path)

    if (-not (Test-Path $Path)) { return $null }
    try {
        return Get-Content -Raw $Path | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Test-ProcessAlive {
    param([object] $ProcessId)

    if (-not $ProcessId) { return $false }
    return $null -ne (Get-Process -Id ([int] $ProcessId) -ErrorAction SilentlyContinue)
}

function Get-ProcessCommandLine {
    param([Parameter(Mandatory = $true)][int] $ProcessId)

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($process) { return [string] $process.CommandLine }
    return ""
}

function Test-ProcessStartMatches {
    param(
        [Parameter(Mandatory = $true)][int] $ProcessId,
        [Parameter(Mandatory = $true)][string] $ExpectedStartedAt,
        [double] $ToleranceSeconds = 0.01
    )

    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        $expected = [DateTimeOffset]::Parse($ExpectedStartedAt)
        $actual = [DateTimeOffset] $process.StartTime
        return [Math]::Abs(($actual - $expected).TotalSeconds) -le $ToleranceSeconds
    }
    catch {
        return $false
    }
}

function Get-ProcessStartedAt {
    param([Parameter(Mandatory = $true)][int] $ProcessId)

    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        return ([DateTimeOffset] $process.StartTime).ToString("o")
    }
    catch {
        return $null
    }
}

function Test-ProcessDescendsFrom {
    param(
        [Parameter(Mandatory = $true)][int] $ProcessId,
        [Parameter(Mandatory = $true)][int[]] $AncestorPids
    )

    $currentPid = $ProcessId
    $visited = @{}
    for ($depth = 0; $depth -lt 16 -and $currentPid -gt 0; $depth++) {
        if ($currentPid -in $AncestorPids) { return $true }
        if ($visited.ContainsKey($currentPid)) { return $false }
        $visited[$currentPid] = $true
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $currentPid" -ErrorAction SilentlyContinue
        if (-not $process) { return $false }
        $currentPid = [int] $process.ParentProcessId
    }
    return $false
}

function Get-ListeningPortPids {
    param([Parameter(Mandatory = $true)][int] $Port)

    return @(
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
}

function Wait-ServicePortFree {
    param(
        [Parameter(Mandatory = $true)][int] $Port,
        [int] $TimeoutSeconds = 5
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (@(Get-ListeningPortPids -Port $Port).Count -eq 0) { return $true }
        Start-Sleep -Milliseconds 200
    } while ((Get-Date) -lt $deadline)
    return @(Get-ListeningPortPids -Port $Port).Count -eq 0
}

function Test-ServiceProcessOwned {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("frontend", "backend")][string] $Service,
        [Parameter(Mandatory = $true)][int] $Port,
        [Parameter(Mandatory = $true)][string] $RepoRoot,
        [Parameter(Mandatory = $true)][string] $CommandLine
    )

    if ($Service -eq "backend") {
        $backendRoot = [regex]::Escape((Join-Path $RepoRoot "backend"))
        return $CommandLine -match $backendRoot -and $CommandLine -match 'uvicorn'
    }

    $frontendRoot = [regex]::Escape((Join-Path $RepoRoot "frontend"))
    return $CommandLine -match $frontendRoot -and
        $CommandLine -match '(next[\\/]dist[\\/]|scripts[\\/]dev\.js)'
}

function Test-SupervisorProcessOwned {
    param(
        [Parameter(Mandatory = $true)][int] $ProcessId,
        [Parameter(Mandatory = $true)][string] $ExpectedStartedAt,
        [Parameter(Mandatory = $true)][string] $RepoRoot,
        [Parameter(Mandatory = $true)][ValidateSet("frontend", "backend")][string] $Service,
        [Parameter(Mandatory = $true)][string] $StatePath,
        [Parameter(Mandatory = $true)][string] $CommandLine
    )

    if (-not (Test-ProcessStartMatches -ProcessId $ProcessId -ExpectedStartedAt $ExpectedStartedAt)) {
        return $false
    }
    $supervisorScript = [regex]::Escape((Join-Path $RepoRoot "scripts\dev\service_supervisor.py"))
    $expectedState = [regex]::Escape($StatePath)
    return $CommandLine -match $supervisorScript -and
        $CommandLine -match "--service\s+`"?$Service`"?" -and
        $CommandLine -match $expectedState
}

function Test-StoredRuntimeProcessOwned {
    param(
        [Parameter(Mandatory = $true)][int] $ProcessId,
        [Parameter(Mandatory = $true)][string] $ExpectedStartedAt,
        [Parameter(Mandatory = $true)][ValidateSet("frontend", "backend")][string] $Service,
        [Parameter(Mandatory = $true)][int] $Port,
        [Parameter(Mandatory = $true)][string] $RepoRoot,
        [Parameter(Mandatory = $true)][string] $StoredCwd,
        [Parameter(Mandatory = $true)][string] $CommandLine,
        [double] $ToleranceSeconds = 0.01
    )

    if (-not (Test-ProcessStartMatches `
        -ProcessId $ProcessId `
        -ExpectedStartedAt $ExpectedStartedAt `
        -ToleranceSeconds $ToleranceSeconds)) {
        return $false
    }
    $expectedCwd = Join-Path $RepoRoot $Service
    $storedFullPath = [System.IO.Path]::GetFullPath($StoredCwd).TrimEnd('\')
    $expectedFullPath = [System.IO.Path]::GetFullPath($expectedCwd).TrimEnd('\')
    if (-not [string]::Equals($storedFullPath, $expectedFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $false
    }
    if (Test-ServiceProcessOwned -Service $Service -Port $Port -RepoRoot $RepoRoot -CommandLine $CommandLine) {
        return $true
    }
    if ($Service -eq "frontend") { return $CommandLine -match 'scripts[\\/]dev\.js' }
    return $CommandLine -match 'uvicorn' -and $CommandLine -match "--port\s+$Port"
}

function Stop-ProcessTree {
    param([Parameter(Mandatory = $true)][int] $ProcessId)

    if (-not (Test-ProcessAlive -ProcessId $ProcessId)) { return }
    & cmd.exe /c "taskkill.exe /T /F /PID $ProcessId >NUL 2>NUL"
}

function Write-JsonFileUtf8 {
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][object] $Value
    )

    $directory = Split-Path -Parent $Path
    if ($directory) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
    $json = $Value | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($Path, "$json`n", $script:Utf8NoBom)
}

function Add-RuntimeEvent {
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][string] $Profile,
        [Parameter(Mandatory = $true)][string] $Service,
        [Parameter(Mandatory = $true)][string] $Event,
        [hashtable] $Details = @{}
    )

    $directory = Split-Path -Parent $Path
    if ($directory) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
    $payload = [ordered]@{
        timestamp = (Get-Date).ToString("o")
        profile = $Profile
        service = $Service
        event = $Event
        recorderPid = $PID
        details = $Details
    }
    $line = $payload | ConvertTo-Json -Depth 10 -Compress
    [System.IO.File]::AppendAllText($Path, "$line`n", $script:Utf8NoBom)
}

function Get-LastRuntimeIncident {
    param([Parameter(Mandatory = $true)][string] $Path)

    if (-not (Test-Path $Path)) { return $null }
    $incidentEvents = @(
        "planned_stop",
        "forced_stop_after_timeout",
        "unexpected_exit",
        "unexpected_exit_zero",
        "service_start_failed",
        "port_unavailable",
        "crash_loop",
        "stale_supervisor",
        "port_conflict",
        "supervisor_error",
        "supervisor_start_timeout",
        "supervisor_force_stop_after_timeout",
        "stop_port_still_listening",
        "stale_pid_reused",
        "orphan_process_stop"
    )
    $lines = @(Get-Content $Path -Tail 200 -ErrorAction SilentlyContinue)
    [array]::Reverse($lines)
    foreach ($line in $lines) {
        try {
            $event = $line | ConvertFrom-Json
            if ($event.event -in $incidentEvents) { return $event }
        }
        catch {
            # Ignore a partially written or malformed historical line.
        }
    }
    return $null
}

function New-RuntimeControlRequest {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("stop", "restart-reset")][string] $Action,
        [Parameter(Mandatory = $true)][string] $Source
    )

    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -ErrorAction SilentlyContinue
    $parentId = if ($current) { [int] $current.ParentProcessId } else { $null }
    $parent = if ($parentId) { Get-Process -Id $parentId -ErrorAction SilentlyContinue } else { $null }
    return [ordered]@{
        action = $Action
        requestedAt = (Get-Date).ToString("o")
        requestedBy = [Environment]::UserName
        requesterPid = $PID
        requesterParentPid = $parentId
        requesterParentName = if ($parent) { $parent.ProcessName } else { "unknown" }
        requesterParentPath = if ($parent) { $parent.Path } else { "" }
        source = $Source
    }
}

function Write-RuntimeControlRequest {
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][object] $Request
    )

    Write-JsonFileUtf8 -Path $Path -Value $Request
}

function Start-ServiceSupervisor {
    param(
        [Parameter(Mandatory = $true)][object] $Profile,
        [Parameter(Mandatory = $true)][ValidateSet("frontend", "backend")][string] $Service,
        [Parameter(Mandatory = $true)][int] $Port,
        [Parameter(Mandatory = $true)][string] $ServiceDir,
        [Parameter(Mandatory = $true)][string] $StatePath,
        [Parameter(Mandatory = $true)][string] $EventPath,
        [Parameter(Mandatory = $true)][string] $ControlPath,
        [Parameter(Mandatory = $true)][string] $StdoutLog,
        [Parameter(Mandatory = $true)][string] $StderrLog,
        [Parameter(Mandatory = $true)][string[]] $ChildCommand,
        [hashtable] $Environment = @{}
    )

    $mutexName = "Local\DEXCOWIN-MES-$($Profile.Name)-$Service-lifecycle"
    $mutex = [System.Threading.Mutex]::new($false, $mutexName)
    $lockTaken = $false
    try {
        try {
            $lockTaken = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
        }
        catch [System.Threading.AbandonedMutexException] {
            $lockTaken = $true
        }
        if (-not $lockTaken) {
            throw "[$Service] Timed out waiting for another lifecycle request to finish."
        }

    $state = Get-RuntimeState -Path $StatePath
    $supervisorAlive = $state -and (Test-ProcessAlive -ProcessId $state.supervisorPid)
    $supervisorOwned = $false
    if ($supervisorAlive) {
        $supervisorCommand = Get-ProcessCommandLine -ProcessId ([int] $state.supervisorPid)
        $supervisorOwned = Test-SupervisorProcessOwned `
            -ProcessId ([int] $state.supervisorPid) `
            -ExpectedStartedAt ([string] $state.startedAt) `
            -RepoRoot $Profile.RepoRoot `
            -Service $Service `
            -StatePath $StatePath `
            -CommandLine $supervisorCommand
        if (-not $supervisorOwned) {
            Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                -Event "stale_pid_reused" `
                -Details @{ pid = [int] $state.supervisorPid; role = "supervisor"; commandLine = $supervisorCommand }
        }
    }
    if ($supervisorOwned) {
        if ($state.status -eq "crash_loop") {
            $request = New-RuntimeControlRequest -Action "restart-reset" -Source "start-$Service.ps1"
            Write-RuntimeControlRequest -Path $ControlPath -Request $request
            return [pscustomobject]@{ SupervisorPid = [int] $state.supervisorPid; Existing = $true; Reset = $true }
        }
        return [pscustomobject]@{ SupervisorPid = [int] $state.supervisorPid; Existing = $true; Reset = $false }
    }

    if ($state -and $state.status -notin @("stopped", "supervisor_error")) {
        Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
            -Event "stale_supervisor" -Details @{ previousState = $state }
    }

    $listeners = @(Get-ListeningPortPids -Port $Port)
    if ($listeners.Count -gt 0) {
        $owners = @($listeners | ForEach-Object {
            @{ pid = [int] $_; commandLine = Get-ProcessCommandLine -ProcessId ([int] $_) }
        })
        Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
            -Event "port_conflict" -Details @{ port = $Port; owners = $owners }
        throw "[$Service] Port $Port is already owned by an unmanaged process. Run status.bat and stop it explicitly."
    }

    Remove-Item -LiteralPath $ControlPath -Force -ErrorAction SilentlyContinue
    foreach ($key in $Environment.Keys) {
        [Environment]::SetEnvironmentVariable([string] $key, [string] $Environment[$key], "Process")
    }

    $repoRoot = $Profile.RepoRoot
    $supervisorScript = Join-Path $repoRoot "scripts\dev\service_supervisor.py"
    $arguments = @(
        $supervisorScript,
        "--profile", $Profile.Name,
        "--service", $Service,
        "--port", [string] $Port,
        "--cwd", $ServiceDir,
        "--state-path", $StatePath,
        "--event-path", $EventPath,
        "--control-path", $ControlPath,
        "--stdout-log", $StdoutLog,
        "--stderr-log", $StderrLog,
        "--"
    ) + $ChildCommand
    $pythonExecutable = [string] ((& py -c "import sys; print(sys.executable)" 2>$null | Select-Object -Last 1))
    $pythonExecutable = $pythonExecutable.Trim()
    if (-not $pythonExecutable -or -not (Test-Path -LiteralPath $pythonExecutable)) {
        throw "[$Service] Could not resolve the Python executable through py."
    }
    $process = Start-Process -FilePath $pythonExecutable -ArgumentList $arguments -WorkingDirectory $repoRoot `
        -WindowStyle Hidden -PassThru
    $launchedStartedAt = Get-ProcessStartedAt -ProcessId $process.Id
    $stateDeadline = (Get-Date).AddSeconds(10)
    $registered = $false
    while ((Get-Date) -lt $stateDeadline -and $launchedStartedAt -and
        (Test-ProcessStartMatches -ProcessId $process.Id -ExpectedStartedAt $launchedStartedAt)) {
        $launchedState = Get-RuntimeState -Path $StatePath
        $stateCommand = if ($launchedState -and [int] $launchedState.supervisorPid -eq $process.Id) {
            Get-ProcessCommandLine -ProcessId $process.Id
        }
        else { "" }
        if ($launchedState -and [int] $launchedState.supervisorPid -eq $process.Id -and
            (Test-SupervisorProcessOwned `
                -ProcessId $process.Id `
                -ExpectedStartedAt ([string] $launchedState.startedAt) `
                -RepoRoot $Profile.RepoRoot `
                -Service $Service `
                -StatePath $StatePath `
                -CommandLine $stateCommand)) {
            $registered = $true
            break
        }
        Start-Sleep -Milliseconds 100
    }
    if (-not $registered) {
        Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
            -Event "supervisor_start_timeout" `
            -Details @{ supervisorPid = $process.Id; launchedStartedAt = $launchedStartedAt }
        if ($launchedStartedAt -and
            (Test-ProcessStartMatches -ProcessId $process.Id -ExpectedStartedAt $launchedStartedAt)) {
            Stop-ProcessTree -ProcessId $process.Id
        }
        throw "[$Service] Supervisor failed to register its runtime state. Check $EventPath"
    }
    return [pscustomobject]@{ SupervisorPid = [int] $launchedState.supervisorPid; Existing = $false; Reset = $false }
    }
    finally {
        if ($lockTaken) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

function Stop-SupervisedService {
    param(
        [Parameter(Mandatory = $true)][object] $Profile,
        [Parameter(Mandatory = $true)][ValidateSet("frontend", "backend")][string] $Service,
        [Parameter(Mandatory = $true)][int] $Port,
        [Parameter(Mandatory = $true)][string] $StatePath,
        [Parameter(Mandatory = $true)][string] $EventPath,
        [Parameter(Mandatory = $true)][string] $ControlPath,
        [Parameter(Mandatory = $true)][string] $Source
    )

    $mutexName = "Local\DEXCOWIN-MES-$($Profile.Name)-$Service-lifecycle"
    $mutex = [System.Threading.Mutex]::new($false, $mutexName)
    $lockTaken = $false
    try {
        try {
            $lockTaken = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
        }
        catch [System.Threading.AbandonedMutexException] {
            $lockTaken = $true
        }
        if (-not $lockTaken) {
            throw "[$Service] Timed out waiting for another lifecycle request to finish."
        }

    $state = Get-RuntimeState -Path $StatePath
    $supervisorAlive = $state -and (Test-ProcessAlive -ProcessId $state.supervisorPid)
    $supervisorOwned = $false
    if ($supervisorAlive) {
        $supervisorCommand = Get-ProcessCommandLine -ProcessId ([int] $state.supervisorPid)
        $supervisorOwned = Test-SupervisorProcessOwned `
            -ProcessId ([int] $state.supervisorPid) `
            -ExpectedStartedAt ([string] $state.startedAt) `
            -RepoRoot $Profile.RepoRoot `
            -Service $Service `
            -StatePath $StatePath `
            -CommandLine $supervisorCommand
        if (-not $supervisorOwned) {
            Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                -Event "stale_pid_reused" `
                -Details @{ pid = [int] $state.supervisorPid; role = "supervisor"; commandLine = $supervisorCommand }
        }
    }
    if ($supervisorOwned) {
        $request = New-RuntimeControlRequest -Action "stop" -Source $Source
        Write-RuntimeControlRequest -Path $ControlPath -Request $request
        $deadline = (Get-Date).AddSeconds(12)
        while ((Get-Date) -lt $deadline -and (Test-ProcessAlive -ProcessId $state.supervisorPid)) {
            Start-Sleep -Milliseconds 200
        }
        if (Test-ProcessAlive -ProcessId $state.supervisorPid) {
            $currentSupervisorCommand = Get-ProcessCommandLine -ProcessId ([int] $state.supervisorPid)
            $stillOwned = Test-SupervisorProcessOwned `
                -ProcessId ([int] $state.supervisorPid) `
                -ExpectedStartedAt ([string] $state.startedAt) `
                -RepoRoot $Profile.RepoRoot `
                -Service $Service `
                -StatePath $StatePath `
                -CommandLine $currentSupervisorCommand
            if ($stillOwned) {
                Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                    -Event "supervisor_force_stop_after_timeout" `
                    -Details @{ supervisorPid = [int] $state.supervisorPid; request = $request }
                Stop-ProcessTree -ProcessId ([int] $state.supervisorPid)
            }
            else {
                Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                    -Event "stale_pid_reused" `
                    -Details @{ pid = [int] $state.supervisorPid; role = "supervisor-force-check"; commandLine = $currentSupervisorCommand }
            }
        }
        if (-not (Wait-ServicePortFree -Port $Port)) {
            Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                -Event "stop_port_still_listening" -Details @{ port = $Port; request = $request }
            throw "[$Service] Stop failed: port $Port is still listening. Check $EventPath"
        }
        return
    }

    $candidatePids = @()
    $candidateExpectedStarts = @{}
    $candidateToleranceSeconds = @{}
    if ($state) {
        if ($state.schemaVersion -eq 1 -and $state.childPid -and (Test-ProcessAlive -ProcessId $state.childPid)) {
            $childCommand = Get-ProcessCommandLine -ProcessId ([int] $state.childPid)
            if (Test-StoredRuntimeProcessOwned `
                -ProcessId ([int] $state.childPid) `
                -ExpectedStartedAt ([string] $state.childStartedAt) `
                -Service $Service `
                -Port $Port `
                -RepoRoot $Profile.RepoRoot `
                -StoredCwd ([string] $state.cwd) `
                -CommandLine $childCommand) {
                $candidatePids += [int] $state.childPid
                $candidateExpectedStarts[[string] $state.childPid] = [string] $state.childStartedAt
                $candidateToleranceSeconds[[string] $state.childPid] = 0.01
            }
            else {
                Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                    -Event "stale_pid_reused" `
                    -Details @{ pid = [int] $state.childPid; commandLine = $childCommand; storedCwd = $state.cwd }
            }
        }
        if ($state.pid -and (Test-ProcessAlive -ProcessId $state.pid)) {
            $legacyCommand = Get-ProcessCommandLine -ProcessId ([int] $state.pid)
            if (Test-StoredRuntimeProcessOwned `
                -ProcessId ([int] $state.pid) `
                -ExpectedStartedAt ([string] $state.startedAt) `
                -Service $Service `
                -Port $Port `
                -RepoRoot $Profile.RepoRoot `
                -StoredCwd ([string] $state.cwd) `
                -CommandLine $legacyCommand `
                -ToleranceSeconds 0.25) {
                $candidatePids += [int] $state.pid
                $candidateExpectedStarts[[string] $state.pid] = [string] $state.startedAt
                $candidateToleranceSeconds[[string] $state.pid] = 0.25
            }
            else {
                Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                    -Event "stale_pid_reused" `
                    -Details @{ pid = [int] $state.pid; commandLine = $legacyCommand; storedCwd = $state.cwd }
            }
        }
        if ($state.status -notin @("stopped", "supervisor_error")) {
            Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                -Event "stale_supervisor" -Details @{ previousState = $state }
        }
    }

    foreach ($listenerPid in @(Get-ListeningPortPids -Port $Port)) {
        $commandLine = Get-ProcessCommandLine -ProcessId ([int] $listenerPid)
        $descendsFromOwnedCandidate = $candidatePids.Count -gt 0 -and
            (Test-ProcessDescendsFrom -ProcessId ([int] $listenerPid) -AncestorPids $candidatePids)
        if ($descendsFromOwnedCandidate) {
            continue
        }
        if (Test-ServiceProcessOwned -Service $Service -Port $Port -RepoRoot $Profile.RepoRoot -CommandLine $commandLine) {
            $candidatePids += [int] $listenerPid
            $candidateExpectedStarts[[string] $listenerPid] = Get-ProcessStartedAt -ProcessId ([int] $listenerPid)
            $candidateToleranceSeconds[[string] $listenerPid] = 0.01
        }
        else {
            Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                -Event "port_conflict" -Details @{ port = $Port; pid = [int] $listenerPid; commandLine = $commandLine }
            throw "[$Service] Refusing to stop unknown PID $listenerPid on port $Port."
        }
    }

    $candidatePids = @($candidatePids | Select-Object -Unique)
    if ($candidatePids.Count -eq 0) {
        Write-Host "[stop-$Service] $($Profile.Label) port $Port already free"
        return
    }

    Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
        -Event "orphan_process_stop" -Details @{ pids = $candidatePids; source = $Source }
    foreach ($processId in $candidatePids) {
        $expectedStartedAt = [string] $candidateExpectedStarts[[string] $processId]
        $toleranceSeconds = [double] $candidateToleranceSeconds[[string] $processId]
        if ($expectedStartedAt -and
            (Test-ProcessStartMatches `
                -ProcessId $processId `
                -ExpectedStartedAt $expectedStartedAt `
                -ToleranceSeconds $toleranceSeconds)) {
            Stop-ProcessTree -ProcessId $processId
        }
        else {
            Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                -Event "stale_pid_reused" `
                -Details @{ pid = [int] $processId; role = "orphan-force-check"; expectedStartedAt = $expectedStartedAt }
        }
    }
    if (-not (Wait-ServicePortFree -Port $Port)) {
        Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
            -Event "stop_port_still_listening" -Details @{ port = $Port; pids = $candidatePids; source = $Source }
        throw "[$Service] Stop failed: port $Port is still listening. Check $EventPath"
    }
    }
    finally {
        if ($lockTaken) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}
