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
    $currentStartedAt = Get-ProcessStartedAt -ProcessId $currentPid
    if (-not $currentStartedAt) { return $false }
    $visited = @{}
    for ($depth = 0; $depth -lt 16 -and $currentPid -gt 0; $depth++) {
        if ($currentPid -in $AncestorPids) { return $true }
        if ($visited.ContainsKey($currentPid)) { return $false }
        $visited[$currentPid] = $true
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $currentPid" -ErrorAction SilentlyContinue
        if (-not $process) { return $false }
        $parentPid = [int] $process.ParentProcessId
        $parentStartedAt = Get-ProcessStartedAt -ProcessId $parentPid
        if (-not $parentStartedAt) { return $false }
        try {
            if ([DateTimeOffset]::Parse($parentStartedAt) -gt [DateTimeOffset]::Parse($currentStartedAt)) {
                return $false
            }
        }
        catch {
            return $false
        }
        $currentPid = $parentPid
        $currentStartedAt = $parentStartedAt
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
        [Parameter(Mandatory = $true)][string] $CommandLine,
        [int] $ProcessId = 0,
        [int[]] $TrustedAncestorPids = @()
    )

    if ($Service -eq "backend") {
        if ($ProcessId -le 0 -or $TrustedAncestorPids.Count -eq 0) { return $false }
        $pythonExecutable = '(?:"[^"\r\n]*[\\/]python(?:\d+(?:\.\d+)*)?\.exe"|[^\s"]*[\\/]python(?:\d+(?:\.\d+)*)?\.exe|python(?:\d+(?:\.\d+)*)?\.exe)'
        $backendPattern = '^\s*' + $pythonExecutable +
            '\s+-m\s+uvicorn\s+app\.main:app(?=\s|$)(?=.*\s--port\s+' + [regex]::Escape([string] $Port) + '(?:\s|$)).*\s*$'
        return $CommandLine -match $backendPattern -and
            (Test-ProcessDescendsFrom -ProcessId $ProcessId -AncestorPids $TrustedAncestorPids)
    }

    $frontendRoot = [regex]::Escape(([System.IO.Path]::GetFullPath((Join-Path $RepoRoot "frontend"))).TrimEnd('\'))
    $nodeExecutable = '(?:"[^"\r\n]*[\\/]node\.exe"|node(?:\.exe)?)'
    $nextScript = $frontendRoot + '[\\/]scripts[\\/]next-server\.js'
    $frontendPattern = '^\s*' + $nodeExecutable + '\s+"?' + $nextScript +
        '"?\s+(?:dev|start)\s+--hostname\s+[^\s"]+\s+--port\s+' +
        [regex]::Escape([string] $Port) + '\s*$'
    return $CommandLine -match $frontendPattern
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

function Recover-CrashLoopPortListeners {
    param(
        [Parameter(Mandatory = $true)][object] $Profile,
        [Parameter(Mandatory = $true)][ValidateSet("frontend", "backend")][string] $Service,
        [Parameter(Mandatory = $true)][int] $Port,
        [Parameter(Mandatory = $true)][string] $EventPath,
        [int[]] $TrustedAncestorPids = @()
    )

    $listeners = @(Get-ListeningPortPids -Port $Port)
    if ($listeners.Count -eq 0) { return $false }

    $candidates = @()
    foreach ($listenerPid in $listeners) {
        $processId = [int] $listenerPid
        $commandLine = Get-ProcessCommandLine -ProcessId $processId
        if (-not (Test-ServiceProcessOwned `
            -Service $Service -Port $Port -RepoRoot $Profile.RepoRoot -CommandLine $commandLine `
            -ProcessId $processId -TrustedAncestorPids $TrustedAncestorPids)) {
            Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                -Event "port_conflict" `
                -Details @{ port = $Port; pid = $processId; commandLine = $commandLine; reason = "crash_loop_unknown_listener" }
            throw "[$Service] Refusing to recover unknown PID $processId on port $Port during crash-loop recovery."
        }

        $startedAt = Get-ProcessStartedAt -ProcessId $processId
        if (-not $startedAt) {
            Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                -Event "port_conflict" `
                -Details @{ port = $Port; pid = $processId; commandLine = $commandLine; reason = "crash_loop_listener_start_unavailable" }
            throw "[$Service] Refusing to recover PID $processId because its process start time could not be captured."
        }
        $candidates += [pscustomobject]@{ ProcessId = $processId; StartedAt = $startedAt }
    }

    $terminatedPids = @()
    foreach ($candidate in $candidates) {
        $currentCommandLine = Get-ProcessCommandLine -ProcessId $candidate.ProcessId
        $stillOwned = Test-ServiceProcessOwned `
            -Service $Service `
            -Port $Port `
            -RepoRoot $Profile.RepoRoot `
            -CommandLine $currentCommandLine `
            -ProcessId $candidate.ProcessId `
            -TrustedAncestorPids $TrustedAncestorPids
        $startMatches = Test-ProcessStartMatches `
            -ProcessId $candidate.ProcessId `
            -ExpectedStartedAt $candidate.StartedAt
        if (-not ($stillOwned -and $startMatches)) {
            Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                -Event "port_conflict" `
                -Details @{ port = $Port; pid = $candidate.ProcessId; commandLine = $currentCommandLine; reason = "crash_loop_listener_ownership_changed" }
            throw "[$Service] Refusing to recover PID $($candidate.ProcessId) because listener ownership changed."
        }
    }

    foreach ($candidate in $candidates) {
        $killCommandLine = Get-ProcessCommandLine -ProcessId $candidate.ProcessId
        $killStillOwned = Test-ServiceProcessOwned `
            -Service $Service `
            -Port $Port `
            -RepoRoot $Profile.RepoRoot `
            -CommandLine $killCommandLine `
            -ProcessId $candidate.ProcessId `
            -TrustedAncestorPids $TrustedAncestorPids
        $killStartMatches = Test-ProcessStartMatches `
            -ProcessId $candidate.ProcessId `
            -ExpectedStartedAt $candidate.StartedAt
        if (-not ($killStillOwned -and $killStartMatches)) {
            $reason = if ($terminatedPids.Count -gt 0) {
                "crash_loop_listener_kill_revalidation_failed_after_partial_recovery"
            }
            else { "crash_loop_listener_kill_revalidation_failed" }
            Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
                -Event "port_conflict" `
                -Details @{
                    port = $Port
                    pid = $candidate.ProcessId
                    commandLine = $killCommandLine
                    reason = $reason
                    terminatedPids = @($terminatedPids)
                }
            throw "[$Service] Refusing to recover PID $($candidate.ProcessId) because listener ownership changed immediately before kill."
        }
        Stop-ProcessTree -ProcessId $candidate.ProcessId
        $terminatedPids += [int] $candidate.ProcessId
    }
    if (-not (Wait-ServicePortFree -Port $Port)) {
        Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
            -Event "port_conflict" `
            -Details @{ port = $Port; pids = @($candidates.ProcessId); reason = "crash_loop_listener_port_still_listening" }
        throw "[$Service] Crash-loop recovery failed: port $Port is still listening. Check $EventPath"
    }
    Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service $Service `
        -Event "orphan_listener_recovered" `
        -Details @{ port = $Port; pids = @($candidates.ProcessId); source = "crash_loop" }
    return $true
}

function Wait-RuntimeHttp200 {
    param(
        [Parameter(Mandatory = $true)][string] $Url,
        [int] $Attempts = 30
    )

    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            if ($response.StatusCode -eq 200) { return $true }
        }
        catch {
            # The supervised service may still be starting, compiling, or backing off.
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Get-RuntimeAppSessionBootId {
    param([Parameter(Mandatory = $true)][string] $Url)

    $response = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    if ($response.StatusCode -ne 200) { throw "App session endpoint did not return 200: $Url" }
    $session = $response.Content | ConvertFrom-Json
    if (-not $session.boot_id) { throw "App session endpoint did not return boot_id: $Url" }
    return [string] $session.boot_id
}

function Start-ProfileFrontendSupervisor {
    param(
        [Parameter(Mandatory = $true)][object] $Profile,
        [Parameter(Mandatory = $true)][string] $FrontendDir,
        [Parameter(Mandatory = $true)][string] $RuntimeRoot,
        [Parameter(Mandatory = $true)][string] $StatePath,
        [Parameter(Mandatory = $true)][string] $EventPath,
        [Parameter(Mandatory = $true)][string] $ControlPath,
        [Parameter(Mandatory = $true)][string] $StdoutLog,
        [Parameter(Mandatory = $true)][string] $StderrLog
    )

    $frontendMode = if ($Profile.Name -eq "employee") { "start" } else { "dev" }

    return Start-ServiceSupervisor `
        -Profile $Profile `
        -Service "frontend" `
        -Port $Profile.FrontendPort `
        -ServiceDir $FrontendDir `
        -StatePath $StatePath `
        -EventPath $EventPath `
        -ControlPath $ControlPath `
        -StdoutLog $StdoutLog `
        -StderrLog $StderrLog `
        -ChildCommand @("node", "scripts/dev.js") `
        -Environment @{
            MES_RUNTIME_ROOT = $RuntimeRoot
            MES_RUNTIME_PROFILE = $Profile.Name
            MES_SUPERVISED_FRONTEND = "1"
            MES_FRONTEND_MODE = $frontendMode
            PORT = [string] $Profile.FrontendPort
            BACKEND_INTERNAL_URL = $Profile.BackendInternalUrl
        }
}

function Assert-ProfileFrontendBuildReady {
    param(
        [Parameter(Mandatory = $true)][object] $Profile,
        [Parameter(Mandatory = $true)][string] $FrontendDir
    )

    if ($Profile.Name -ne "employee") {
        return
    }

    $buildIdPath = Join-Path $FrontendDir ".next-prod\BUILD_ID"
    if (-not (Test-Path -LiteralPath $buildIdPath -PathType Leaf)) {
        throw "[start-frontend] Employee production build is missing: $buildIdPath. Run the approved sync/deploy command first."
    }
}

function Invoke-ProfileFrontendStartup {
    param(
        [Parameter(Mandatory = $true)][object] $Profile,
        [Parameter(Mandatory = $true)][string] $FrontendDir,
        [Parameter(Mandatory = $true)][string] $RuntimeRoot,
        [Parameter(Mandatory = $true)][string] $StatePath,
        [Parameter(Mandatory = $true)][string] $EventPath,
        [Parameter(Mandatory = $true)][string] $ControlPath,
        [Parameter(Mandatory = $true)][string] $StdoutLog,
        [Parameter(Mandatory = $true)][string] $StderrLog
    )

    $mutexName = "Local\DEXCOWIN-MES-$($Profile.Name)-frontend-startup"
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
            throw "[frontend] Timed out waiting for another $($Profile.Name) startup request to finish."
        }

    $backendHealthUrl = "http://127.0.0.1:$($Profile.BackendPort)/health/ready"
    if (-not (Wait-RuntimeHttp200 -Url $backendHealthUrl)) {
        throw "[start-frontend] Backend is not ready at $backendHealthUrl. Start the profile backend first."
    }

    Assert-ProfileFrontendBuildReady -Profile $Profile -FrontendDir $FrontendDir

    $supervisorArgs = @{
        Profile = $Profile
        FrontendDir = $FrontendDir
        RuntimeRoot = $RuntimeRoot
        StatePath = $StatePath
        EventPath = $EventPath
        ControlPath = $ControlPath
        StdoutLog = $StdoutLog
        StderrLog = $StderrLog
    }
    $launch = Start-ProfileFrontendSupervisor @supervisorArgs

    $healthUrl = "http://127.0.0.1:$($Profile.FrontendPort)/mes"
    if (-not (Wait-RuntimeHttp200 -Url $healthUrl -Attempts 90)) {
        $state = Get-RuntimeState -Path $StatePath
        throw "[start-frontend] Frontend did not respond on $healthUrl. status=$($state.status). Check $EventPath"
    }

    $directSessionUrl = "http://127.0.0.1:$($Profile.BackendPort)/api/app-session"
    $proxySessionUrl = "http://127.0.0.1:$($Profile.FrontendPort)/api/app-session"
    $directBootId = Get-RuntimeAppSessionBootId -Url $directSessionUrl
    $proxyBootId = Get-RuntimeAppSessionBootId -Url $proxySessionUrl
    if ($directBootId -ne $proxyBootId) {
        Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service "frontend" `
            -Event "backend_proxy_mismatch" `
            -Details @{ directBootId = $directBootId; proxyBootId = $proxyBootId; directUrl = $directSessionUrl; proxyUrl = $proxySessionUrl; attempt = 1 }

        Stop-SupervisedService `
            -Profile $Profile `
            -Service "frontend" `
            -Port $Profile.FrontendPort `
            -StatePath $StatePath `
            -EventPath $EventPath `
            -ControlPath $ControlPath `
            -Source "start-frontend-proxy-mismatch"
        $launch = Start-ProfileFrontendSupervisor @supervisorArgs
        if (-not (Wait-RuntimeHttp200 -Url $healthUrl -Attempts 90)) {
            throw "[start-frontend] Frontend did not recover on $healthUrl after backend proxy mismatch. Check $EventPath"
        }
        $directBootId = Get-RuntimeAppSessionBootId -Url $directSessionUrl
        $proxyBootId = Get-RuntimeAppSessionBootId -Url $proxySessionUrl
        if ($directBootId -ne $proxyBootId) {
            Add-RuntimeEvent -Path $EventPath -Profile $Profile.Name -Service "frontend" `
                -Event "backend_proxy_mismatch" `
                -Details @{ directBootId = $directBootId; proxyBootId = $proxyBootId; directUrl = $directSessionUrl; proxyUrl = $proxySessionUrl; attempt = 2 }
            Stop-SupervisedService `
                -Profile $Profile `
                -Service "frontend" `
                -Port $Profile.FrontendPort `
                -StatePath $StatePath `
                -EventPath $EventPath `
                -ControlPath $ControlPath `
                -Source "start-frontend-persistent-proxy-mismatch"
            throw "[start-frontend] Frontend proxy boot_id ($proxyBootId) does not match backend boot_id ($directBootId) after controlled restart. Check $EventPath"
        }
    }

    return [pscustomobject]@{ Launch = $launch; HealthUrl = $healthUrl }
    }
    finally {
        if ($lockTaken) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
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
            Recover-CrashLoopPortListeners `
                -Profile $Profile -Service $Service -Port $Port -EventPath $EventPath `
                -TrustedAncestorPids @([int] $state.supervisorPid) | Out-Null
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
