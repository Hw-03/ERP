$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$RuntimeControlScript = Join-Path $RepoRoot "scripts\dev\runtime-control.ps1"
. $RuntimeControlScript

$actualFrontendListener = '"C:\Program Files\nodejs\node.exe" C:\ERP\frontend\scripts\next-server.js dev --hostname 0.0.0.0 --port 3001'
$smuggledFrontendPath = '"C:\Program Files\nodejs\node.exe" -e "setInterval(()=>{},1000)" C:\ERP\frontend\scripts\next-server.js dev --hostname 0.0.0.0 --port 3001'
$smuggledWrapperPath = '"C:\Program Files\nodejs\node.exe" -e "setInterval(()=>{},1000)" C:\ERP\frontend\scripts\dev.js'
if (-not (Test-ServiceProcessOwned -Service frontend -Port 3001 -RepoRoot 'C:\ERP' -CommandLine $actualFrontendListener)) {
    throw 'The anchored current-profile Next start-server listener shape must be owned.'
}
if (Test-ServiceProcessOwned -Service frontend -Port 3001 -RepoRoot 'C:\ERP' -CommandLine $smuggledFrontendPath) {
    throw 'A command that merely contains the current repo Next path must not be owned.'
}
if (Test-ServiceProcessOwned -Service frontend -Port 3001 -RepoRoot 'C:\ERP' -CommandLine $smuggledWrapperPath) {
    throw 'scripts/dev.js must never be accepted as a frontend listener command.'
}

& {
    function Test-ProcessDescendsFrom { return $true }
    $backendListener = '"C:\Users\user\AppData\Local\Programs\Python\Python312\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8011 --reload'
    if (-not (Test-ServiceProcessOwned `
        -Service backend -Port 8011 -RepoRoot 'C:\ERP' -CommandLine $backendListener `
        -ProcessId 45001 -TrustedAncestorPids @(45000))) {
        throw 'The actual backend listener shape must be owned only with validated supervisor ancestry.'
    }
}

& {
    function Get-ProcessStartedAt {
        param([int] $ProcessId)
        if ($ProcessId -eq 45101) { return '2026-08-10T10:00:00+09:00' }
        if ($ProcessId -eq 45102) { return '2026-08-10T10:05:00+09:00' }
        return '2026-08-10T09:55:00+09:00'
    }
    function Get-CimInstance {
        param($ClassName, $Filter)
        $processId = [int] ([regex]::Match($Filter, '\d+').Value)
        if ($processId -eq 45101) { return [pscustomobject]@{ ProcessId = 45101; ParentProcessId = 45102 } }
        if ($processId -eq 45102) { return [pscustomobject]@{ ProcessId = 45102; ParentProcessId = 45100 } }
        return [pscustomobject]@{ ProcessId = 45100; ParentProcessId = 1 }
    }
    if (Test-ProcessDescendsFrom -ProcessId 45101 -AncestorPids @(45100)) {
        throw 'Backend ownership ancestry must reject an intermediate parent PID reused after the listener started.'
    }
}

function Get-FreeTcpPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return ([System.Net.IPEndPoint] $listener.LocalEndpoint).Port }
    finally { $listener.Stop() }
}

function Wait-ForListener {
    param([int] $Port, [int] $ProcessId)

    $deadline = (Get-Date).AddSeconds(5)
    while ((Get-Date) -lt $deadline) {
        if ($ProcessId -in @(Get-ListeningPortPids -Port $Port)) { return }
        Start-Sleep -Milliseconds 50
    }
    throw "Fake listener PID $ProcessId did not bind port $Port."
}

function Start-FakeNodeListener {
    param([int] $Port, [string] $OwnershipArgument)

    $serverCode = "const net=require('net');const server=net.createServer();server.listen($Port,'127.0.0.1');setInterval(()=>{},1000);"
    $arguments = "-e `"$serverCode`" `"$OwnershipArgument`""
    return Start-Process -FilePath "node" -ArgumentList $arguments -WindowStyle Hidden -PassThru
}

& {
    $calls = [pscustomobject]@{ CommandReads = 0 }
    $kills = [System.Collections.Generic.List[int]]::new()
    $events = [System.Collections.Generic.List[object]]::new()
    $ownedCommand = '"C:\Program Files\nodejs\node.exe" C:\ERP\frontend\scripts\next-server.js dev --hostname 0.0.0.0 --port 3001'
    $changedCommand = 'node C:\outside-repo\listener.js'

    function Get-ListeningPortPids { return @(41001) }
    function Get-ProcessCommandLine {
        $calls.CommandReads++
        if ($calls.CommandReads -le 2) { return $ownedCommand }
        return $changedCommand
    }
    function Get-ProcessStartedAt { return '2026-08-10T00:00:00+09:00' }
    function Test-ProcessStartMatches { return $true }
    function Stop-ProcessTree { param([int] $ProcessId); $kills.Add($ProcessId) }
    function Wait-ServicePortFree { return $true }
    function Add-RuntimeEvent {
        param($Path, $Profile, $Service, $Event, $Details)
        $events.Add([pscustomobject]@{ Event = $Event; Details = $Details })
    }

    $profile = [pscustomobject]@{ Name = 'development'; RepoRoot = 'C:\ERP' }
    $rejected = $false
    try {
        Recover-CrashLoopPortListeners -Profile $profile -Service frontend -Port 3001 -EventPath 'ignored.jsonl' | Out-Null
    }
    catch {
        $rejected = $_.Exception.Message -match 'listener ownership changed'
    }
    if (-not $rejected) { throw 'Crash-loop recovery must reject a command-line change immediately before kill.' }
    if ($kills.Count -ne 0) { throw 'Crash-loop recovery must not kill a PID whose command line changed immediately before kill.' }
    if (-not ($events | Where-Object { $_.Event -eq 'port_conflict' })) {
        throw 'Kill-time ownership changes must record port_conflict.'
    }
}

& {
    $calls = [pscustomobject]@{ StartChecks = 0 }
    $kills = [System.Collections.Generic.List[int]]::new()
    $events = [System.Collections.Generic.List[object]]::new()
    function Get-ListeningPortPids { return @(41002) }
    function Get-ProcessCommandLine { return '"C:\Program Files\nodejs\node.exe" C:\ERP\frontend\scripts\next-server.js dev --hostname 0.0.0.0 --port 3001' }
    function Get-ProcessStartedAt { return '2026-08-10T00:00:00+09:00' }
    function Test-ProcessStartMatches {
        $calls.StartChecks++
        return $calls.StartChecks -eq 1
    }
    function Stop-ProcessTree { param([int] $ProcessId); $kills.Add($ProcessId) }
    function Wait-ServicePortFree { return $true }
    function Add-RuntimeEvent {
        param($Path, $Profile, $Service, $Event, $Details)
        $events.Add([pscustomobject]@{ Event = $Event; Details = $Details })
    }

    $profile = [pscustomobject]@{ Name = 'development'; RepoRoot = 'C:\ERP' }
    $rejected = $false
    try {
        Recover-CrashLoopPortListeners -Profile $profile -Service frontend -Port 3001 -EventPath 'ignored.jsonl' | Out-Null
    }
    catch {
        $rejected = $_.Exception.Message -match 'immediately before kill'
    }
    if (-not $rejected -or $kills.Count -ne 0) {
        throw 'Crash-loop recovery must reject PID reuse detected by a start-time change immediately before kill.'
    }
}

& {
    $reads = @{ '41101' = 0; '41102' = 0 }
    $kills = [System.Collections.Generic.List[int]]::new()
    $events = [System.Collections.Generic.List[object]]::new()
    $ownedCommand = '"C:\Program Files\nodejs\node.exe" C:\ERP\frontend\scripts\next-server.js dev --hostname 0.0.0.0 --port 3001'
    function Get-ListeningPortPids { return @(41101, 41102) }
    function Get-ProcessCommandLine {
        param([int] $ProcessId)
        $key = [string] $ProcessId
        $reads[$key]++
        if ($ProcessId -eq 41102 -and $reads[$key] -eq 3) { return 'node C:\outside-repo\listener.js' }
        return $ownedCommand
    }
    function Get-ProcessStartedAt { return '2026-08-10T00:00:00+09:00' }
    function Test-ProcessStartMatches { return $true }
    function Stop-ProcessTree { param([int] $ProcessId); $kills.Add($ProcessId) }
    function Wait-ServicePortFree { return $true }
    function Add-RuntimeEvent {
        param($Path, $Profile, $Service, $Event, $Details)
        $events.Add([pscustomobject]@{ Event = $Event; Details = $Details })
    }

    $profile = [pscustomobject]@{ Name = 'development'; RepoRoot = 'C:\ERP' }
    $rejected = $false
    try {
        Recover-CrashLoopPortListeners -Profile $profile -Service frontend -Port 3001 -EventPath 'ignored.jsonl' | Out-Null
    }
    catch {
        $rejected = $_.Exception.Message -match 'immediately before kill'
    }
    $conflict = $events | Where-Object { $_.Event -eq 'port_conflict' } | Select-Object -Last 1
    if (-not $rejected -or $kills.Count -ne 1 -or $kills[0] -ne 41101) {
        throw 'A second-candidate kill-time failure must stop after the already-terminated first candidate.'
    }
    if ($conflict.Details.reason -notmatch 'partial_recovery' -or 41101 -notin @($conflict.Details.terminatedPids)) {
        throw 'A kill-time failure after a prior termination must record the partial recovery PID list in port_conflict.'
    }
}

& {
    $kills = [System.Collections.Generic.List[int]]::new()
    $events = [System.Collections.Generic.List[object]]::new()
    function Get-ListeningPortPids { return @(42001) }
    function Get-ProcessCommandLine { return '"C:\Users\user\AppData\Local\Programs\Python\Python312\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8011 --reload' }
    function Get-ProcessStartedAt { return '2026-08-10T00:00:00+09:00' }
    function Test-ProcessStartMatches { return $true }
    function Test-ProcessDescendsFrom { return $true }
    function Stop-ProcessTree { param([int] $ProcessId); $kills.Add($ProcessId) }
    function Wait-ServicePortFree { return $true }
    function Add-RuntimeEvent {
        param($Path, $Profile, $Service, $Event, $Details)
        $events.Add([pscustomobject]@{ Event = $Event; Details = $Details })
    }

    $profile = [pscustomobject]@{ Name = 'development'; RepoRoot = 'C:\ERP' }
    $recovered = Recover-CrashLoopPortListeners -Profile $profile -Service backend -Port 8011 -EventPath 'ignored.jsonl' -TrustedAncestorPids @(41999)
    if (-not $recovered -or $kills.Count -ne 1 -or $kills[0] -ne 42001) {
        throw 'Crash-loop recovery must apply the existing backend ownership rule and recover an owned backend listener.'
    }
}

& {
    $kills = [System.Collections.Generic.List[int]]::new()
    $events = [System.Collections.Generic.List[object]]::new()
    function Get-ListeningPortPids { return @(43001, 43002) }
    function Get-ProcessCommandLine {
        param([int] $ProcessId)
        if ($ProcessId -eq 43001) { return '"C:\Program Files\nodejs\node.exe" C:\ERP\frontend\scripts\next-server.js dev --hostname 0.0.0.0 --port 3001' }
        return 'node C:\outside-repo\listener.js'
    }
    function Get-ProcessStartedAt { return '2026-08-10T00:00:00+09:00' }
    function Test-ProcessStartMatches { return $true }
    function Stop-ProcessTree { param([int] $ProcessId); $kills.Add($ProcessId) }
    function Wait-ServicePortFree { return $true }
    function Add-RuntimeEvent {
        param($Path, $Profile, $Service, $Event, $Details)
        $events.Add([pscustomobject]@{ Event = $Event; Details = $Details })
    }

    $profile = [pscustomobject]@{ Name = 'development'; RepoRoot = 'C:\ERP' }
    $rejected = $false
    try {
        Recover-CrashLoopPortListeners -Profile $profile -Service frontend -Port 3001 -EventPath 'ignored.jsonl' | Out-Null
    }
    catch {
        if ($_.Exception.Message -notmatch 'unknown PID 43002') { throw }
        $rejected = $true
    }
    if (-not $rejected -or $kills.Count -ne 0) {
        throw 'Owned and unknown listeners mixed on one port must fail with zero process kills.'
    }
}

& {
    $tempRoot = Join-Path $env:TEMP "mes-restart-reset-test-$PID"
    $controlPath = Join-Path $tempRoot 'frontend-control.json'
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    try {
        function Get-RuntimeState {
            return [pscustomobject]@{
                status = 'crash_loop'
                supervisorPid = 44001
                startedAt = '2026-08-10T00:00:00+09:00'
            }
        }
        function Test-ProcessAlive { return $true }
        function Get-ProcessCommandLine { return 'C:\Python\python.exe C:\ERP\scripts\dev\service_supervisor.py --service frontend' }
        function Test-SupervisorProcessOwned { return $true }
        function Get-ListeningPortPids { return @() }

        $profile = [pscustomobject]@{ Name = "restart-reset-test-$PID"; RepoRoot = 'C:\ERP' }
        $result = Start-ServiceSupervisor `
            -Profile $profile -Service frontend -Port 3001 -ServiceDir 'C:\ERP\frontend' `
            -StatePath (Join-Path $tempRoot 'state.json') -EventPath (Join-Path $tempRoot 'events.jsonl') `
            -ControlPath $controlPath -StdoutLog (Join-Path $tempRoot 'out.log') -StderrLog (Join-Path $tempRoot 'err.log') `
            -ChildCommand @('node', 'scripts/dev.js')
        $request = Get-Content -Raw $controlPath | ConvertFrom-Json
        if (-not ($result.Reset -and $result.Existing) -or $request.action -ne 'restart-reset') {
            throw 'A crash-loop supervisor without listeners must receive an actual restart-reset control request.'
        }
    }
    finally {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function New-FrontendStartupTestArguments {
    param([object] $Profile, [string] $Suffix)

    $testRoot = Join-Path $env:TEMP "mes-frontend-startup-$Suffix-$PID"
    return @{
        Profile = $Profile
        FrontendDir = Join-Path $Profile.RepoRoot 'frontend'
        RuntimeRoot = Join-Path $testRoot 'runtime'
        StatePath = Join-Path $testRoot 'state.json'
        EventPath = Join-Path $testRoot 'events.jsonl'
        ControlPath = Join-Path $testRoot 'control.json'
        StdoutLog = Join-Path $testRoot 'out.log'
        StderrLog = Join-Path $testRoot 'err.log'
    }
}

& {
    $mutexTestRoot = Join-Path $env:TEMP "mes-frontend-startup-mutex-$PID"
    $firstEntered = Join-Path $mutexTestRoot 'first-entered'
    $secondEntered = Join-Path $mutexTestRoot 'second-entered'
    $releaseFirst = Join-Path $mutexTestRoot 'release-first'
    New-Item -ItemType Directory -Force -Path $mutexTestRoot | Out-Null
    $worker = {
        param($RuntimeControlScript, $MarkerPath, $ReleasePath, [bool] $Block, $TestRoot)
        $ErrorActionPreference = 'Stop'
        . $RuntimeControlScript
        function Wait-RuntimeHttp200 { return $true }
        function Start-ProfileFrontendSupervisor {
            [System.IO.File]::WriteAllText($MarkerPath, 'entered')
            while ($Block -and -not (Test-Path -LiteralPath $ReleasePath)) {
                Start-Sleep -Milliseconds 50
            }
            return [pscustomobject]@{ Existing = $true }
        }
        function Get-RuntimeAppSessionBootId { return 'same-boot' }
        $profile = [pscustomobject]@{
            Name = 'startup-mutex-test'; Label = 'startup-mutex-test'; RepoRoot = 'C:\ERP'
            FrontendPort = 3001; BackendPort = 8011; BackendInternalUrl = 'http://localhost:8011'
        }
        Invoke-ProfileFrontendStartup `
            -Profile $profile -FrontendDir 'C:\ERP\frontend' -RuntimeRoot (Join-Path $TestRoot 'runtime') `
            -StatePath (Join-Path $TestRoot 'state.json') -EventPath (Join-Path $TestRoot 'events.jsonl') `
            -ControlPath (Join-Path $TestRoot 'control.json') -StdoutLog (Join-Path $TestRoot 'out.log') `
            -StderrLog (Join-Path $TestRoot 'err.log') | Out-Null
    }
    $firstJob = $null
    $secondJob = $null
    try {
        $firstJob = Start-Job -ScriptBlock $worker -ArgumentList $RuntimeControlScript, $firstEntered, $releaseFirst, $true, $mutexTestRoot
        $deadline = (Get-Date).AddSeconds(10)
        while (-not (Test-Path -LiteralPath $firstEntered) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 50 }
        if (-not (Test-Path -LiteralPath $firstEntered)) { throw 'First startup mutex worker did not enter.' }

        $secondJob = Start-Job -ScriptBlock $worker -ArgumentList $RuntimeControlScript, $secondEntered, $releaseFirst, $false, $mutexTestRoot
        Start-Sleep -Milliseconds 750
        if (Test-Path -LiteralPath $secondEntered) {
            throw 'Concurrent startup calls for one profile must not enter frontend orchestration together.'
        }
        [System.IO.File]::WriteAllText($releaseFirst, 'release')
        Wait-Job -Job @($firstJob, $secondJob) -Timeout 10 | Out-Null
        if ($firstJob.State -ne 'Completed' -or $secondJob.State -ne 'Completed' -or -not (Test-Path -LiteralPath $secondEntered)) {
            throw 'The queued startup call must enter after the first profile startup releases its mutex.'
        }
    }
    finally {
        if (-not (Test-Path -LiteralPath $releaseFirst)) { [System.IO.File]::WriteAllText($releaseFirst, 'release') }
        foreach ($job in @($firstJob, $secondJob)) {
            if ($job) { Stop-Job -Job $job -ErrorAction SilentlyContinue; Remove-Job -Job $job -Force -ErrorAction SilentlyContinue }
        }
        Remove-Item -LiteralPath $mutexTestRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

& {
    $calls = [pscustomobject]@{ Starts = 0 }
    $urls = [System.Collections.Generic.List[string]]::new()
    function Wait-RuntimeHttp200 { param([string] $Url); $urls.Add($Url); return $false }
    function Start-ProfileFrontendSupervisor { $calls.Starts++; throw 'must not start' }

    $profile = [pscustomobject]@{
        Name = 'employee'; Label = 'employee'; RepoRoot = 'C:\ERP-dev'
        FrontendPort = 3000; BackendPort = 8010; BackendInternalUrl = 'http://localhost:8010'
    }
    $failed = $false
    $startupArgs = New-FrontendStartupTestArguments -Profile $profile -Suffix 'backend-down'
    try { Invoke-ProfileFrontendStartup @startupArgs }
    catch { $failed = $_.Exception.Message -match 'Backend is not ready.*8010' }
    if (-not $failed -or $calls.Starts -ne 0 -or $urls.Count -ne 1 -or $urls[0] -notmatch ':8010/health/ready$') {
        throw 'Frontend startup must fail before starting when the selected profile backend is not ready.'
    }
}

& {
    $calls = [pscustomobject]@{ Starts = 0; Stops = 0; DirectReads = 0; ProxyReads = 0 }
    $events = [System.Collections.Generic.List[object]]::new()
    $profiles = [System.Collections.Generic.List[string]]::new()
    function Wait-RuntimeHttp200 { return $true }
    function Start-ProfileFrontendSupervisor {
        param($Profile)
        $calls.Starts++
        $profiles.Add([string] $Profile.Name)
        return [pscustomobject]@{ Existing = ($calls.Starts -eq 1) }
    }
    function Stop-SupervisedService {
        param($Profile, $Service, $Port, $StatePath, $EventPath, $ControlPath, $Source)
        $calls.Stops++
        $profiles.Add([string] $Profile.Name)
    }
    function Get-RuntimeAppSessionBootId {
        param([string] $Url)
        if ($Url -match ':8011/') { $calls.DirectReads++; return 'backend-boot' }
        $calls.ProxyReads++
        if ($calls.ProxyReads -eq 1) { return 'stale-boot' }
        return 'backend-boot'
    }
    function Add-RuntimeEvent {
        param($Path, $Profile, $Service, $Event, $Details)
        $events.Add([pscustomobject]@{ Profile = $Profile; Event = $Event; Details = $Details })
    }

    $otherProfileSentinel = Join-Path $env:TEMP "mes-employee-control-$PID.json"
    [System.IO.File]::WriteAllText($otherProfileSentinel, 'employee-untouched')
    try {
        $profile = [pscustomobject]@{
            Name = 'development'; Label = 'development'; RepoRoot = 'C:\ERP'
            FrontendPort = 3001; BackendPort = 8011; BackendInternalUrl = 'http://localhost:8011'
        }
        $startupArgs = New-FrontendStartupTestArguments -Profile $profile -Suffix 'mismatch-once'
        $result = Invoke-ProfileFrontendStartup @startupArgs
        if ($calls.Starts -ne 2 -or $calls.Stops -ne 1 -or -not $result.Launch) {
            throw 'A proxy mismatch must perform exactly one controlled frontend restart and then succeed when boot IDs match.'
        }
        if (@($profiles | Where-Object { $_ -ne 'development' }).Count -ne 0) {
            throw 'Proxy mismatch recovery must only operate on the selected profile.'
        }
        if ([System.IO.File]::ReadAllText($otherProfileSentinel) -ne 'employee-untouched') {
            throw 'Proxy mismatch recovery must leave the other profile control state unchanged.'
        }
        if (@($events | Where-Object { $_.Event -eq 'backend_proxy_mismatch' }).Count -ne 1) {
            throw 'A recovered proxy mismatch must record exactly one mismatch event.'
        }
    }
    finally {
        Remove-Item -LiteralPath $otherProfileSentinel -Force -ErrorAction SilentlyContinue
    }
}

& {
    $calls = [pscustomobject]@{ Starts = 0; Stops = 0 }
    $events = [System.Collections.Generic.List[object]]::new()
    function Wait-RuntimeHttp200 { return $true }
    function Start-ProfileFrontendSupervisor { $calls.Starts++; return [pscustomobject]@{ Existing = $false } }
    function Stop-SupervisedService { $calls.Stops++ }
    function Get-RuntimeAppSessionBootId {
        param([string] $Url)
        if ($Url -match ':8011/') { return 'backend-boot' }
        return 'stale-boot'
    }
    function Add-RuntimeEvent {
        param($Path, $Profile, $Service, $Event, $Details)
        $events.Add([pscustomobject]@{ Event = $Event; Details = $Details })
    }

    $profile = [pscustomobject]@{
        Name = 'development'; Label = 'development'; RepoRoot = 'C:\ERP'
        FrontendPort = 3001; BackendPort = 8011; BackendInternalUrl = 'http://localhost:8011'
    }
    $failed = $false
    $startupArgs = New-FrontendStartupTestArguments -Profile $profile -Suffix 'persistent-mismatch'
    try { Invoke-ProfileFrontendStartup @startupArgs }
    catch { $failed = $_.Exception.Message -match 'after controlled restart' }
    if (-not $failed -or $calls.Starts -ne 2 -or $calls.Stops -ne 2) {
        throw 'A persistent proxy mismatch must stop the stale frontend after one controlled restart and fail explicitly.'
    }
    if (@($events | Where-Object { $_.Event -eq 'backend_proxy_mismatch' }).Count -ne 2) {
        throw 'A persistent proxy mismatch must record both failed comparisons.'
    }
}

$profile = [pscustomobject]@{ Name = "runtime-control-test"; Label = "runtime-control-test"; RepoRoot = $RepoRoot }
$eventPath = Join-Path $env:TEMP "mes-crash-loop-events-$PID.jsonl"
$unknownListener = $null
try {
    $emptyPort = Get-FreeTcpPort
    if (Recover-CrashLoopPortListeners -Profile $profile -Service "frontend" -Port $emptyPort -EventPath $eventPath) {
        throw "Crash-loop recovery must leave a listener-free port untouched."
    }

    $unknownPort = Get-FreeTcpPort
    $unknownListener = Start-FakeNodeListener -Port $unknownPort -OwnershipArgument "C:\\outside-repo\\scripts\\dev.js"
    Wait-ForListener -Port $unknownPort -ProcessId $unknownListener.Id
    $rejected = $false
    try {
        Recover-CrashLoopPortListeners -Profile $profile -Service "frontend" -Port $unknownPort -EventPath $eventPath | Out-Null
    }
    catch {
        $rejected = $_.Exception.Message -match "Refusing to recover unknown PID"
    }
    if (-not $rejected) { throw "Unknown crash-loop listener must fail with an explicit ownership error." }
    if (-not (Test-ProcessAlive -ProcessId $unknownListener.Id)) { throw "Unknown listener must never be terminated." }
    $unknownEvents = @(Get-Content $eventPath | ForEach-Object { $_ | ConvertFrom-Json })
    if ($unknownEvents.event -notcontains "port_conflict") {
        throw "Unknown crash-loop listener must record port_conflict."
    }
}
finally {
    foreach ($listener in @($unknownListener)) {
        if ($listener -and (Test-ProcessAlive -ProcessId $listener.Id)) {
            Stop-ProcessTree -ProcessId $listener.Id
        }
    }
    Remove-Item -LiteralPath $eventPath -Force -ErrorAction SilentlyContinue
}

Write-Host "[test] OK - crash-loop recovery only stops verified current-profile listeners"
