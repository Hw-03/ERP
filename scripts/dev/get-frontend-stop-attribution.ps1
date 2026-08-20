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

$SinceUtc = $Since.ToUniversalTime()
$window = [TimeSpan]::FromSeconds($WindowSeconds)
$SysmonQueryStartUtc = $SinceUtc.Subtract($window)
$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
if ($Profile.Name -ne "development") {
    Stop-WithReadError "This report is restricted to the C:\ERP development runtime profile."
}

. (Join-Path $PSScriptRoot "runtime-paths.ps1")
$FrontendLogDir = Get-MesRuntimePath -RepoRoot $Profile.RepoRoot -RelativePath "logs\frontend"
$DevServerLog = Join-Path $FrontendLogDir "dev-server.log"
if (-not (Test-Path -LiteralPath $DevServerLog -PathType Leaf)) {
    Stop-WithReadError "Frontend signal log was not found: $DevServerLog"
}

$signalEvents = [System.Collections.Generic.List[object]]::new()
$allSignalEvents = [System.Collections.Generic.List[object]]::new()
$readyEvents = [System.Collections.Generic.List[object]]::new()
$processExitEvents = [System.Collections.Generic.List[object]]::new()
try {
    foreach ($line in Get-Content -LiteralPath $DevServerLog -ErrorAction Stop) {
        if ($line -notmatch '^\[(?<loggedUtc>[^\]]+)\]\s+(?<eventName>NEXT_SIGNAL_RECEIVED|NEXT_SIGNAL_PROBE_READY|NEXT_PROCESS_EXIT)(?:\s+(?<payload>.*))?\s*$') {
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

try {
    $operationalLog = Get-WinEvent -ListLog $OperationalLogName -ErrorAction Stop
    if (-not $operationalLog.IsEnabled) {
        Stop-WithReadError "Sysmon Operational channel is disabled: $OperationalLogName"
    }
    try {
        $sysmonEvents = @(Get-WinEvent -FilterHashtable @{ LogName = "Microsoft-Windows-Sysmon/Operational"; Id = 10; StartTime = $SysmonQueryStartUtc } -ErrorAction Stop)
    }
    catch {
        if ($_.FullyQualifiedErrorId -like "NoMatchingEventsFound,*") {
            $sysmonEvents = @()
        }
        else {
            throw
        }
    }
}
catch {
    Stop-WithReadError "Unable to read Sysmon Operational Event ID 10 records: $($_.Exception.Message)"
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
        [pscustomobject][ordered]@{
            signalUtc = $signalEvent.SignalUtc.ToString("o")
            signal = $signalEvent.Signal
            targetPid = $signalEvent.TargetPid
            targetPpid = $signalEvent.TargetPpid
            port = $signalEvent.Port
            uptimeMs = $signalEvent.UptimeMs
            candidates = @($candidateEvents | Select-Object sourcePid, sourceImage, grantedAccess, targetPid, targetImage, utcTime)
        }
    }
    foreach ($processExitEvent in $processExitEvents) {
        $cliReady = @($readyEvents | Where-Object {
                -not $_.IsNextPrivateWorker -and
                $_.TargetPid -eq $processExitEvent.TargetPid -and
                $_.TargetPpid -eq $processExitEvent.TargetPpid -and
                $_.ReadyUtc -le $processExitEvent.ExitUtc
            } | Sort-Object ReadyUtc -Descending | Select-Object -First 1)
        if ($cliReady.Count -eq 0) {
            continue
        }

        $cli = $cliReady[0]
        $workerReady = @($readyEvents | Where-Object {
                $_.IsNextPrivateWorker -and
                $_.TargetPpid -eq $processExitEvent.TargetPid -and
                $_.ReadyUtc -gt $cli.ReadyUtc -and
                $_.ReadyUtc -lt $processExitEvent.ExitUtc
            } | Sort-Object ReadyUtc -Descending | Select-Object -First 1)
        if ($workerReady.Count -eq 0) {
            continue
        }

        $worker = $workerReady[0]
        $lifecycleSignal = @($allSignalEvents | Where-Object {
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

        $candidateEvents = @($eventCandidates | Where-Object {
                $_.targetPid -eq $worker.TargetPid -and
                [Math]::Abs(($_.eventUtc - $processExitEvent.ExitUtc).TotalSeconds) -le $window.TotalSeconds
            })
        [pscustomobject][ordered]@{
            anchorType = "worker_exit_without_signal"
            exitUtc = $processExitEvent.ExitUtc.ToString("o")
            exitCode = $processExitEvent.ExitCode
            cliPid = $processExitEvent.TargetPid
            targetPid = $worker.TargetPid
            targetPpid = $worker.TargetPpid
            port = $worker.Port
            cliUptimeMs = $processExitEvent.UptimeMs
            workerReadyUptimeMs = $worker.UptimeMs
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
            if ($result.candidates.Count -eq 0) {
                Write-Output "Candidate evidence: none"
                continue
            }
            Write-Output "Candidate evidence:"
            $result.candidates | Format-Table sourcePid, sourceImage, grantedAccess, targetPid, targetImage, utcTime -AutoSize | Out-String | Write-Output
            continue
        }
        Write-Output "Signal: signalUtc=$($result.signalUtc) signal=$($result.signal) targetPid=$($result.targetPid) targetPpid=$($result.targetPpid) port=$($result.port) uptimeMs=$($result.uptimeMs)"
        if ($result.candidates.Count -eq 0) {
            Write-Output "Candidate evidence: none"
            continue
        }
        Write-Output "Candidate evidence:"
        $result.candidates | Format-Table sourcePid, sourceImage, grantedAccess, targetPid, targetImage, utcTime -AutoSize | Out-String | Write-Output
    }
}
