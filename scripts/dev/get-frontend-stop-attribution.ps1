[CmdletBinding()]
param(
    [datetime] $Since = (Get-Date).ToUniversalTime().AddHours(-2),
    [ValidateRange(1, 60)]
    [int] $WindowSeconds = 5,
    [switch] $AsJson
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$OperationalLogName = "Microsoft-Windows-Sysmon/Operational"

function Get-EventDataValue {
    param(
        [Parameter(Mandatory = $true)][xml] $Xml,
        [Parameter(Mandatory = $true)][string] $Name
    )

    $data = @($Xml.Event.EventData.Data | Where-Object { $_.Name -eq $Name } | Select-Object -First 1)
    if ($data.Count -eq 0) {
        return $null
    }
    return [string] $data[0]."#text"
}

function ConvertTo-ProcessIdOrNull {
    param([string] $Value)

    $parsed = 0
    if ([int]::TryParse($Value, [ref] $parsed)) {
        return $parsed
    }
    return $null
}

function Stop-WithReadError {
    param([Parameter(Mandatory = $true)][string] $Message)

    [Console]::Error.WriteLine($Message)
    exit 2
}

function Write-AttributionWarning {
    param([Parameter(Mandatory = $true)][string] $Message)

    if ($AsJson) {
        [Console]::Error.WriteLine($Message)
        return
    }
    Write-Warning $Message
}

function Get-CrashDumpEvidence {
    param(
        [object[]] $DumpCandidates,
        [int] $TargetPid,
        [datetime] $AnchorUtc,
        [TimeSpan] $Window
    )

    $matching = @($DumpCandidates | Where-Object {
            $_.TargetPid -eq $TargetPid -and
            [Math]::Abs(($_.CapturedUtc - $AnchorUtc).TotalSeconds) -le $Window.TotalSeconds
        } | Sort-Object @{ Expression = { [Math]::Abs(($_.CapturedUtc - $AnchorUtc).TotalSeconds) } },
        @{ Expression = { $_.CapturedUtc }; Descending = $true } | Select-Object -First 1)
    if ($matching.Count -eq 0) {
        return [pscustomobject][ordered]@{
            Status = "dump_not_captured"
            Path = $null
            CapturedUtc = $null
            SizeBytes = $null
        }
    }

    $dump = $matching[0]
    return [pscustomobject][ordered]@{
        Status = "process_crash_dump_captured"
        Path = $dump.Path
        CapturedUtc = $dump.CapturedUtc.ToString("o")
        SizeBytes = $dump.SizeBytes
    }
}

function ConvertTo-UtcDateTimeOrNull {
    param([string] $Value)

    $parsed = [DateTimeOffset]::MinValue
    if ([DateTimeOffset]::TryParse($Value, [ref] $parsed)) {
        return $parsed.UtcDateTime
    }
    return $null
}

function Get-NodeReportEvidence {
    param(
        [object[]] $ReportCandidates,
        [int] $TargetPid,
        [datetime] $AnchorUtc,
        [TimeSpan] $Window
    )

    $matching = @($ReportCandidates | Where-Object {
            $_.TargetPid -eq $TargetPid -and
            [Math]::Abs(($_.CapturedUtc - $AnchorUtc).TotalSeconds) -le $Window.TotalSeconds
        } | Sort-Object @{ Expression = { [Math]::Abs(($_.CapturedUtc - $AnchorUtc).TotalSeconds) } },
        @{ Expression = { $_.CapturedUtc }; Descending = $true } | Select-Object -First 1)
    if ($matching.Count -eq 0) {
        return [pscustomobject][ordered]@{
            Status = "node_report_not_captured"
            Path = $null
            CapturedUtc = $null
            SizeBytes = $null
            Event = $null
            Trigger = $null
            JavaScriptMessage = $null
            NativeStack = @()
        }
    }

    $report = $matching[0]
    return [pscustomobject][ordered]@{
        Status = "node_report_captured"
        Path = $report.Path
        CapturedUtc = $report.CapturedUtc.ToString("o")
        SizeBytes = $report.SizeBytes
        Event = $report.Event
        Trigger = $report.Trigger
        JavaScriptMessage = $report.JavaScriptMessage
        NativeStack = @($report.NativeStack | Select-Object -First 10)
    }
}

function Get-FallbackAnchors {
    param(
        [object[]] $ProcessExitEvents,
        [object[]] $ReadyEvents,
        [object[]] $AllSignalEvents,
        [object[]] $WorkerExitEvents
    )

    foreach ($processExitEvent in $ProcessExitEvents) {
        $cliReady = @($ReadyEvents | Where-Object {
                -not $_.IsNextPrivateWorker -and
                $_.TargetPid -eq $processExitEvent.TargetPid -and
                $_.TargetPpid -eq $processExitEvent.TargetPpid -and
                $_.ReadyUtc -le $processExitEvent.ExitUtc
            } | Sort-Object ReadyUtc -Descending | Select-Object -First 1)
        if ($cliReady.Count -eq 0) {
            continue
        }

        $cli = $cliReady[0]
        $workerReady = @($ReadyEvents | Where-Object {
                $_.IsNextPrivateWorker -and
                $_.TargetPpid -eq $processExitEvent.TargetPid -and
                $_.ReadyUtc -gt $cli.ReadyUtc -and
                $_.ReadyUtc -lt $processExitEvent.ExitUtc
            } | Sort-Object ReadyUtc -Descending | Select-Object -First 1)
        if ($workerReady.Count -eq 0) {
            continue
        }

        $worker = $workerReady[0]
        $lifecycleSignal = @($AllSignalEvents | Where-Object {
                $_.SignalUtc -le $processExitEvent.ExitUtc -and
                (($_.TargetPid -eq $cli.TargetPid -and
                        $_.TargetPpid -eq $cli.TargetPpid -and
                        $_.SignalUtc -ge $cli.ReadyUtc) -or
                    ($_.TargetPid -eq $worker.TargetPid -and
                        $_.TargetPpid -eq $worker.TargetPpid -and
                        $_.SignalUtc -ge $worker.ReadyUtc))
            } | Select-Object -First 1)
        if ($lifecycleSignal.Count -gt 0) {
            continue
        }

        $workerExitEvent = @($WorkerExitEvents | Where-Object {
                $_.TargetPid -eq $worker.TargetPid -and
                $_.TargetPpid -eq $worker.TargetPpid -and
                $_.ObservedUtc -ge $worker.ReadyUtc -and
                $_.ObservedUtc -le $processExitEvent.ExitUtc
            } | Sort-Object ObservedUtc -Descending | Select-Object -First 1)

        [pscustomobject][ordered]@{
            ProcessExitEvent = $processExitEvent
            Cli = $cli
            Worker = $worker
            WorkerExitEvent = if ($workerExitEvent.Count -eq 0) { $null } else { $workerExitEvent[0] }
        }
    }
}

function Get-SysmonProcessAccessEvents {
    param(
        [object[]] $Anchors,
        [TimeSpan] $Window
    )

    $queriedAnchors = [System.Collections.Generic.HashSet[string]]::new()
    $seenRecordIds = [System.Collections.Generic.HashSet[long]]::new()
    $events = [System.Collections.Generic.List[object]]::new()
    foreach ($anchor in $Anchors) {
        $anchorKey = "$($anchor.TargetPid)|$($anchor.AnchorUtc.Ticks)"
        if (-not $queriedAnchors.Add($anchorKey)) {
            continue
        }

        $startUtc = $anchor.AnchorUtc.Subtract($Window).ToString("o")
        $endUtc = $anchor.AnchorUtc.Add($Window).ToString("o")
        $xpath = "*[System[(EventID=10) and TimeCreated[@SystemTime >= '$startUtc' and @SystemTime <= '$endUtc']]] and *[EventData[Data[@Name='TargetProcessId']='$($anchor.TargetPid)']]"
        try {
            $matchingEvents = @(Get-WinEvent -LogName $OperationalLogName -FilterXPath $xpath -ErrorAction Stop)
        }
        catch {
            if ($_.FullyQualifiedErrorId -like "NoMatchingEventsFound,*") {
                $matchingEvents = @()
            }
            else {
                throw
            }
        }

        foreach ($event in $matchingEvents) {
            $recordIdProperty = $event.PSObject.Properties["RecordId"]
            if ($null -ne $recordIdProperty -and $null -ne $recordIdProperty.Value) {
                $recordId = [long] $recordIdProperty.Value
                if (-not $seenRecordIds.Add($recordId)) {
                    continue
                }
            }
            $events.Add($event)
        }
    }
    return @($events)
}

$SinceUtc = $Since.ToUniversalTime()
$window = [TimeSpan]::FromSeconds($WindowSeconds)
$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
if ($Profile.Name -ne "development") {
    Stop-WithReadError "This report is restricted to the C:\ERP development runtime profile."
}

. (Join-Path $PSScriptRoot "runtime-paths.ps1")
$FrontendLogDir = Get-MesRuntimePath -RepoRoot $Profile.RepoRoot -RelativePath "logs\frontend"
$DevServerLog = Join-Path $FrontendLogDir "dev-server.log"
$CrashDumpDir = Join-Path $FrontendLogDir "crashdumps"
$NodeReportDir = Join-Path $FrontendLogDir "node-reports"
if (-not (Test-Path -LiteralPath $DevServerLog -PathType Leaf)) {
    Stop-WithReadError "Frontend signal log was not found: $DevServerLog"
}

$signalEvents = [System.Collections.Generic.List[object]]::new()
$allSignalEvents = [System.Collections.Generic.List[object]]::new()
$readyEvents = [System.Collections.Generic.List[object]]::new()
$processExitEvents = [System.Collections.Generic.List[object]]::new()
$workerExitEvents = [System.Collections.Generic.List[object]]::new()
try {
    foreach ($line in Get-Content -LiteralPath $DevServerLog -ErrorAction Stop) {
        if ($line -notmatch '^\[(?<loggedUtc>[^\]]+)\]\s+(?<eventName>NEXT_SIGNAL_RECEIVED|NEXT_SIGNAL_PROBE_READY|NEXT_PROCESS_EXIT|NEXT_WORKER_CHILD_EXIT)(?:\s+(?<payload>.*))?\s*$') {
            continue
        }

        try {
            $eventName = [string] $Matches.eventName
            $payloadText = [string] $Matches.payload
            if ([string]::IsNullOrWhiteSpace($payloadText)) {
                if ($eventName -eq "NEXT_SIGNAL_RECEIVED") {
                    throw "signal payload is missing"
                }
                throw "$eventName payload is missing"
            }
            $payload = $payloadText | ConvertFrom-Json
            switch ($eventName) {
                "NEXT_SIGNAL_RECEIVED" {
                    $targetPid = ConvertTo-ProcessIdOrNull -Value ([string] $payload.targetPid)
                    $signal = [string] $payload.signal
                    $receivedAtUtc = [string] $payload.receivedAtUtc
                    if ($null -eq $targetPid -or
                        [string]::IsNullOrWhiteSpace($signal) -or
                        [string]::IsNullOrWhiteSpace($receivedAtUtc)) {
                        throw "required signal fields are missing or invalid"
                    }

                    $signalUtc = [datetime]::Parse($receivedAtUtc).ToUniversalTime()
                    $parsedSignalEvent = [pscustomobject][ordered]@{
                        SignalUtc = $signalUtc
                        Signal = $signal
                        TargetPid = $targetPid
                        TargetPpid = ConvertTo-ProcessIdOrNull -Value ([string] $payload.targetPpid)
                        Port = if ($null -eq $payload.port) { $null } else { [string] $payload.port }
                        UptimeMs = if ($null -eq $payload.uptimeMs) { $null } else { [long] $payload.uptimeMs }
                    }
                    $allSignalEvents.Add($parsedSignalEvent)
                    if ($signalUtc -ge $SinceUtc) {
                        $signalEvents.Add($parsedSignalEvent)
                    }
                }
                "NEXT_SIGNAL_PROBE_READY" {
                    $targetPid = ConvertTo-ProcessIdOrNull -Value ([string] $payload.targetPid)
                    $targetPpid = ConvertTo-ProcessIdOrNull -Value ([string] $payload.targetPpid)
                    $readyAtUtc = [string] $payload.readyAtUtc
                    $workerProperty = $payload.PSObject.Properties["isNextPrivateWorker"]
                    if ($null -eq $targetPid -or
                        $null -eq $targetPpid -or
                        [string]::IsNullOrWhiteSpace($readyAtUtc) -or
                        $null -eq $workerProperty -or
                        $workerProperty.Value -isnot [bool]) {
                        throw "required ready fields are missing or invalid"
                    }

                    $readyEvents.Add([pscustomobject][ordered]@{
                            ReadyUtc = [datetime]::Parse($readyAtUtc).ToUniversalTime()
                            TargetPid = $targetPid
                            TargetPpid = $targetPpid
                            Port = if ($null -eq $payload.port) { $null } else { [string] $payload.port }
                            UptimeMs = if ($null -eq $payload.uptimeMs) { $null } else { [long] $payload.uptimeMs }
                            IsNextPrivateWorker = [bool] $workerProperty.Value
                        })
                }
                "NEXT_PROCESS_EXIT" {
                    $targetPid = ConvertTo-ProcessIdOrNull -Value ([string] $payload.targetPid)
                    $exitAtUtc = [string] $payload.exitAtUtc
                    $workerProperty = $payload.PSObject.Properties["isNextPrivateWorker"]
                    $exitCodeProperty = $payload.PSObject.Properties["exitCode"]
                    $exitCode = 0
                    if ($null -eq $targetPid -or
                        [string]::IsNullOrWhiteSpace($exitAtUtc) -or
                        $null -eq $workerProperty -or
                        $workerProperty.Value -isnot [bool] -or
                        $null -eq $exitCodeProperty -or
                        -not [int]::TryParse([string] $exitCodeProperty.Value, [ref] $exitCode)) {
                        throw "required process-exit fields are missing or invalid"
                    }

                    $exitUtc = [datetime]::Parse($exitAtUtc).ToUniversalTime()
                    if (-not [bool] $workerProperty.Value -and $exitUtc -ge $SinceUtc) {
                        $processExitEvents.Add([pscustomobject][ordered]@{
                                ExitUtc = $exitUtc
                                ExitCode = $exitCode
                                TargetPid = $targetPid
                                TargetPpid = ConvertTo-ProcessIdOrNull -Value ([string] $payload.targetPpid)
                                Port = if ($null -eq $payload.port) { $null } else { [string] $payload.port }
                                UptimeMs = if ($null -eq $payload.uptimeMs) { $null } else { [long] $payload.uptimeMs }
                            })
                    }
                }
                "NEXT_WORKER_CHILD_EXIT" {
                    $targetPid = ConvertTo-ProcessIdOrNull -Value ([string] $payload.targetPid)
                    $targetPpid = ConvertTo-ProcessIdOrNull -Value ([string] $payload.targetPpid)
                    $observedAtUtc = [string] $payload.observedAtUtc
                    $exitCodeProperty = $payload.PSObject.Properties["exitCode"]
                    $signalProperty = $payload.PSObject.Properties["signal"]
                    if ($null -eq $targetPid -or
                        $null -eq $targetPpid -or
                        [string]::IsNullOrWhiteSpace($observedAtUtc) -or
                        $null -eq $exitCodeProperty -or
                        $null -eq $signalProperty) {
                        throw "required worker-exit fields are missing or invalid"
                    }

                    $rawExitCode = $null
                    if ($null -ne $exitCodeProperty.Value) {
                        $parsedExitCode = 0L
                        if (-not [long]::TryParse([string] $exitCodeProperty.Value, [ref] $parsedExitCode)) {
                            throw "worker exitCode is invalid"
                        }
                        $rawExitCode = $parsedExitCode
                    }
                    $workerExitEvents.Add([pscustomobject][ordered]@{
                            ObservedUtc = [datetime]::Parse($observedAtUtc).ToUniversalTime()
                            ExitCode = $rawExitCode
                            Signal = if ($null -eq $signalProperty.Value) { $null } else { [string] $signalProperty.Value }
                            TargetPid = $targetPid
                            TargetPpid = $targetPpid
                            Port = if ($null -eq $payload.port) { $null } else { [string] $payload.port }
                        })
                }
            }
        }
        catch {
            if ($eventName -eq "NEXT_SIGNAL_RECEIVED") {
                Write-AttributionWarning "Skipped invalid NEXT_SIGNAL_RECEIVED record: $($_.Exception.Message)"
            }
            else {
                Write-AttributionWarning "Skipped invalid $eventName record: $($_.Exception.Message)"
            }
        }
    }
}
catch {
    Stop-WithReadError "Unable to read frontend signal log: $($_.Exception.Message)"
}

$fallbackAnchors = @(Get-FallbackAnchors -ProcessExitEvents @($processExitEvents) `
        -ReadyEvents @($readyEvents) -AllSignalEvents @($allSignalEvents) `
        -WorkerExitEvents @($workerExitEvents))
$sysmonAnchors = [System.Collections.Generic.List[object]]::new()
foreach ($signalEvent in $signalEvents) {
    $sysmonAnchors.Add([pscustomobject]@{
            TargetPid = $signalEvent.TargetPid
            AnchorUtc = $signalEvent.SignalUtc
        })
}
foreach ($fallbackAnchor in $fallbackAnchors) {
    $anchorUtc = if ($null -eq $fallbackAnchor.WorkerExitEvent) {
        $fallbackAnchor.ProcessExitEvent.ExitUtc
    }
    else {
        $fallbackAnchor.WorkerExitEvent.ObservedUtc
    }
    $sysmonAnchors.Add([pscustomobject]@{
            TargetPid = $fallbackAnchor.Worker.TargetPid
            AnchorUtc = $anchorUtc
        })
}

try {
    $operationalLog = Get-WinEvent -ListLog $OperationalLogName -ErrorAction Stop
    if (-not $operationalLog.IsEnabled) {
        Stop-WithReadError "Sysmon Operational channel is disabled: $OperationalLogName"
    }
    $sysmonEvents = @(Get-SysmonProcessAccessEvents -Anchors @($sysmonAnchors) -Window $window)
}
catch {
    Stop-WithReadError "Unable to read Sysmon Operational Event ID 10 records: $($_.Exception.Message)"
}

$crashDumpCandidates = @()
if (Test-Path -LiteralPath $CrashDumpDir -PathType Container) {
    try {
        $crashDumpCandidates = @(Get-ChildItem -LiteralPath $CrashDumpDir -Filter "node.exe.*.dmp" -File -ErrorAction Stop | ForEach-Object {
                if ($_.Name -notmatch '^node\.exe\.(?<pid>\d+)\.dmp$') {
                    return
                }
                $dumpPid = ConvertTo-ProcessIdOrNull -Value ([string] $Matches.pid)
                if ($null -eq $dumpPid) {
                    return
                }
                [pscustomobject][ordered]@{
                    TargetPid = $dumpPid
                    CapturedUtc = $_.CreationTimeUtc
                    Path = $_.FullName
                    SizeBytes = [long] $_.Length
                }
            })
    }
    catch {
        Write-AttributionWarning "Unable to enumerate frontend crash dumps: $($_.Exception.Message)"
    }
}

$nodeReportCandidates = [System.Collections.Generic.List[object]]::new()
if (Test-Path -LiteralPath $NodeReportDir -PathType Container) {
    try {
        foreach ($reportFile in @(Get-ChildItem -LiteralPath $NodeReportDir -Filter "report.*.json" -File -ErrorAction Stop)) {
            try {
                $report = Get-Content -LiteralPath $reportFile.FullName -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
                $headerProperty = $report.PSObject.Properties["header"]
                if ($null -eq $headerProperty -or $null -eq $headerProperty.Value) {
                    throw "header is missing"
                }
                $header = $headerProperty.Value
                $reportPid = ConvertTo-ProcessIdOrNull -Value ([string] $header.processId)
                $capturedUtc = ConvertTo-UtcDateTimeOrNull -Value ([string] $header.dumpEventTime)
                if ($null -eq $reportPid -or $null -eq $capturedUtc) {
                    throw "header.processId or header.dumpEventTime is missing or invalid"
                }

                $javascriptMessage = $null
                $javascriptStackProperty = $report.PSObject.Properties["javascriptStack"]
                if ($null -ne $javascriptStackProperty -and $null -ne $javascriptStackProperty.Value) {
                    $javascriptMessage = if ($null -eq $javascriptStackProperty.Value.message) { $null } else { [string] $javascriptStackProperty.Value.message }
                }
                $nativeStack = @()
                $nativeStackProperty = $report.PSObject.Properties["nativeStack"]
                if ($null -ne $nativeStackProperty -and $null -ne $nativeStackProperty.Value) {
                    $nativeStack = @($nativeStackProperty.Value | Select-Object -First 10)
                }

                $nodeReportCandidates.Add([pscustomobject][ordered]@{
                        TargetPid = $reportPid
                        CapturedUtc = $capturedUtc
                        Path = $reportFile.FullName
                        SizeBytes = [long] $reportFile.Length
                        Event = if ($null -eq $header.event) { $null } else { [string] $header.event }
                        Trigger = if ($null -eq $header.trigger) { $null } else { [string] $header.trigger }
                        JavaScriptMessage = $javascriptMessage
                        NativeStack = $nativeStack
                    })
            }
            catch {
                Write-AttributionWarning "Skipped unreadable Node diagnostic report '$($reportFile.Name)': $($_.Exception.Message)"
            }
        }
    }
    catch {
        Write-AttributionWarning "Unable to enumerate Node diagnostic reports: $($_.Exception.Message)"
    }
}

$eventCandidates = foreach ($event in $sysmonEvents) {
    try {
        [xml] $eventXml = $event.ToXml()
        $targetPid = ConvertTo-ProcessIdOrNull -Value (Get-EventDataValue -Xml $eventXml -Name "TargetProcessId")
        $targetImage = Get-EventDataValue -Xml $eventXml -Name "TargetImage"
        $eventUtc = $event.TimeCreated.ToUniversalTime()
        if ($null -eq $targetPid -or
            [string]::IsNullOrWhiteSpace($targetImage) -or
            -not $targetImage.EndsWith("\node.exe", [System.StringComparison]::OrdinalIgnoreCase)) {
            continue
        }

        [pscustomobject][ordered]@{
            eventUtc = $eventUtc
            sourcePid = ConvertTo-ProcessIdOrNull -Value (Get-EventDataValue -Xml $eventXml -Name "SourceProcessId")
            sourceImage = Get-EventDataValue -Xml $eventXml -Name "SourceImage"
            grantedAccess = Get-EventDataValue -Xml $eventXml -Name "GrantedAccess"
            targetPid = $targetPid
            targetImage = $targetImage
            utcTime = $eventUtc.ToString("o")
        }
    }
    catch {
        Write-AttributionWarning "Skipped unreadable Sysmon Event ID 10 record: $($_.Exception.Message)"
    }
}

$results = @(
    foreach ($signalEvent in $signalEvents) {
        $candidateEvents = @($eventCandidates | Where-Object {
                $_.targetPid -eq $signalEvent.TargetPid -and
                [Math]::Abs(($_.eventUtc - $signalEvent.SignalUtc).TotalSeconds) -le $window.TotalSeconds
            })
        $dumpEvidence = Get-CrashDumpEvidence -DumpCandidates @($crashDumpCandidates) `
            -TargetPid $signalEvent.TargetPid -AnchorUtc $signalEvent.SignalUtc -Window $window
        $nodeReportEvidence = Get-NodeReportEvidence -ReportCandidates @($nodeReportCandidates) `
            -TargetPid $signalEvent.TargetPid -AnchorUtc $signalEvent.SignalUtc -Window $window
        [pscustomobject][ordered]@{
            signalUtc = $signalEvent.SignalUtc.ToString("o")
            signal = $signalEvent.Signal
            targetPid = $signalEvent.TargetPid
            targetPpid = $signalEvent.TargetPpid
            port = $signalEvent.Port
            uptimeMs = $signalEvent.UptimeMs
            dumpStatus = $dumpEvidence.Status
            dumpPath = $dumpEvidence.Path
            dumpCapturedUtc = $dumpEvidence.CapturedUtc
            dumpSizeBytes = $dumpEvidence.SizeBytes
            nodeReportStatus = $nodeReportEvidence.Status
            nodeReportPath = $nodeReportEvidence.Path
            nodeReportCapturedUtc = $nodeReportEvidence.CapturedUtc
            nodeReportSizeBytes = $nodeReportEvidence.SizeBytes
            nodeReportEvent = $nodeReportEvidence.Event
            nodeReportTrigger = $nodeReportEvidence.Trigger
            nodeReportJavaScriptMessage = $nodeReportEvidence.JavaScriptMessage
            nodeReportNativeStack = $nodeReportEvidence.NativeStack
            candidates = @($candidateEvents | Select-Object sourcePid, sourceImage, grantedAccess, targetPid, targetImage, utcTime)
        }
    }
    foreach ($fallbackAnchor in $fallbackAnchors) {
        $processExitEvent = $fallbackAnchor.ProcessExitEvent
        $cli = $fallbackAnchor.Cli
        $worker = $fallbackAnchor.Worker
        $workerExitEvent = $fallbackAnchor.WorkerExitEvent
        $anchorUtc = if ($null -eq $workerExitEvent) { $processExitEvent.ExitUtc } else { $workerExitEvent.ObservedUtc }

        $candidateEvents = @($eventCandidates | Where-Object {
                $_.targetPid -eq $worker.TargetPid -and
                [Math]::Abs(($_.eventUtc - $anchorUtc).TotalSeconds) -le $window.TotalSeconds
            })
        $dumpEvidence = Get-CrashDumpEvidence -DumpCandidates @($crashDumpCandidates) `
            -TargetPid $worker.TargetPid -AnchorUtc $anchorUtc -Window $window
        $nodeReportEvidence = Get-NodeReportEvidence -ReportCandidates @($nodeReportCandidates) `
            -TargetPid $worker.TargetPid -AnchorUtc $anchorUtc -Window $window
        [pscustomobject][ordered]@{
            anchorType = "worker_exit_without_signal"
            exitUtc = $processExitEvent.ExitUtc.ToString("o")
            exitCode = $processExitEvent.ExitCode
            workerExitObservedUtc = if ($null -eq $workerExitEvent) { $null } else { $workerExitEvent.ObservedUtc.ToString("o") }
            workerExitCode = if ($null -eq $workerExitEvent) { $null } else { $workerExitEvent.ExitCode }
            workerSignal = if ($null -eq $workerExitEvent) { $null } else { $workerExitEvent.Signal }
            cliPid = $processExitEvent.TargetPid
            targetPid = $worker.TargetPid
            targetPpid = $worker.TargetPpid
            port = $worker.Port
            cliUptimeMs = $processExitEvent.UptimeMs
            workerReadyUptimeMs = $worker.UptimeMs
            dumpStatus = $dumpEvidence.Status
            dumpPath = $dumpEvidence.Path
            dumpCapturedUtc = $dumpEvidence.CapturedUtc
            dumpSizeBytes = $dumpEvidence.SizeBytes
            nodeReportStatus = $nodeReportEvidence.Status
            nodeReportPath = $nodeReportEvidence.Path
            nodeReportCapturedUtc = $nodeReportEvidence.CapturedUtc
            nodeReportSizeBytes = $nodeReportEvidence.SizeBytes
            nodeReportEvent = $nodeReportEvidence.Event
            nodeReportTrigger = $nodeReportEvidence.Trigger
            nodeReportJavaScriptMessage = $nodeReportEvidence.JavaScriptMessage
            nodeReportNativeStack = $nodeReportEvidence.NativeStack
            candidates = @($candidateEvents | Select-Object sourcePid, sourceImage, grantedAccess, targetPid, targetImage, utcTime)
        }
    }
)

if ($AsJson) {
    if ($results.Count -eq 0) {
        Write-Output "[]"
    }
    else {
        @($results) | ConvertTo-Json -Depth 3
    }
}
else {
    if ($results.Count -eq 0) {
        Write-Output "No signal or worker-exit attribution anchors were found in the requested time range."
    }
    foreach ($result in $results) {
        if ($result.PSObject.Properties["anchorType"]) {
            Write-Output "Worker exit fallback: exitUtc=$($result.exitUtc) exitCode=$($result.exitCode) cliPid=$($result.cliPid) targetPid=$($result.targetPid) targetPpid=$($result.targetPpid) port=$($result.port) cliUptimeMs=$($result.cliUptimeMs) workerReadyUptimeMs=$($result.workerReadyUptimeMs)"
            Write-Output "Observed worker exit: observedUtc=$($result.workerExitObservedUtc) rawExitCode=$($result.workerExitCode) signal=$($result.workerSignal)"
            Write-Output "Crash dump: status=$($result.dumpStatus) path=$($result.dumpPath) capturedUtc=$($result.dumpCapturedUtc) sizeBytes=$($result.dumpSizeBytes)"
            Write-Output "Node report: status=$($result.nodeReportStatus) path=$($result.nodeReportPath) capturedUtc=$($result.nodeReportCapturedUtc) event=$($result.nodeReportEvent) trigger=$($result.nodeReportTrigger) javascriptMessage=$($result.nodeReportJavaScriptMessage)"
            if ($result.candidates.Count -eq 0) {
                Write-Output "Candidate evidence: none"
                continue
            }
            Write-Output "Candidate evidence:"
            $result.candidates | Format-Table sourcePid, sourceImage, grantedAccess, targetPid, targetImage, utcTime -AutoSize | Out-String | Write-Output
            continue
        }
        Write-Output "Signal: signalUtc=$($result.signalUtc) signal=$($result.signal) targetPid=$($result.targetPid) targetPpid=$($result.targetPpid) port=$($result.port) uptimeMs=$($result.uptimeMs)"
        Write-Output "Crash dump: status=$($result.dumpStatus) path=$($result.dumpPath) capturedUtc=$($result.dumpCapturedUtc) sizeBytes=$($result.dumpSizeBytes)"
        Write-Output "Node report: status=$($result.nodeReportStatus) path=$($result.nodeReportPath) capturedUtc=$($result.nodeReportCapturedUtc) event=$($result.nodeReportEvent) trigger=$($result.nodeReportTrigger) javascriptMessage=$($result.nodeReportJavaScriptMessage)"
        if ($result.candidates.Count -eq 0) {
            Write-Output "Candidate evidence: none"
            continue
        }
        Write-Output "Candidate evidence:"
        $result.candidates | Format-Table sourcePid, sourceImage, grantedAccess, targetPid, targetImage, utcTime -AutoSize | Out-String | Write-Output
    }
}
