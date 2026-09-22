$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\runtime-control.ps1')
$tempPath = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString() + '.json')
try {
    $started = ([DateTimeOffset](Get-Process -Id $PID).StartTime).ToString('o')
    [IO.File]::WriteAllText($tempPath, ('{"startedAt":"' + $started + '","childStartedAt":"' + $started + '"}'))
    $state = Get-RuntimeState -Path $tempPath
    if (-not (Test-ProcessStartMatches -ProcessId $PID -ExpectedStartedAt ([string]$state.startedAt))) {
        throw 'JSON timestamp lost process start precision'
    }
    if (Test-ProcessStartMatches -ProcessId $PID -ExpectedStartedAt ([DateTimeOffset]::Parse($started).AddSeconds(-1).ToString('o'))) {
        throw 'Reused PID must not match'
    }
    Write-Host 'PASS runtime timestamp precision and PID reuse'
}
finally { Remove-Item -LiteralPath $tempPath -Force }
