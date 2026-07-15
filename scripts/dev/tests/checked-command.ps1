$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
. (Join-Path $repoRoot "scripts\dev\checked-command.ps1")

$nonzero = Invoke-CheckedExternalCommand -FilePath "cmd.exe" -ArgumentList @("/c", "exit 23")
if ($nonzero.Success -or $nonzero.ExitCode -ne 23 -or $nonzero.LaunchError) {
    throw "nonzero external command was not reported as failure"
}

$missing = Invoke-CheckedExternalCommand -FilePath (Join-Path $repoRoot "missing-command.exe")
if ($missing.Success -or -not $missing.LaunchError) {
    throw "launch exception was not reported as failure"
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
try {
    $port = ([System.Net.IPEndPoint] $listener.LocalEndpoint).Port
    if (Test-TcpPortFree -Port $port) {
        throw "listening port was reported as free"
    }
}
finally {
    $listener.Stop()
}

if (-not (Test-TcpPortFree -Port $port)) {
    throw "stopped listener port was not reported as free"
}

$warnings = @()
function Get-MesActiveTcpListeners {
    throw "injected listener enumeration failure"
}
if (Test-TcpPortFree -Port $port -WarningVariable +warnings -WarningAction SilentlyContinue) {
    throw "listener enumeration failure was reported as a free port"
}
if (($warnings -join " ") -notmatch "enumerat|listener") {
    throw "listener enumeration failure did not emit a warning"
}

$portCheckDefinition = (Get-Command Test-TcpPortFree).Definition
if ($portCheckDefinition -notmatch 'Get-MesActiveTcpListeners') {
    throw "port availability must use the listener provider"
}
if ($portCheckDefinition -match 'BeginConnect|WaitOne|return\s+\$true') {
    throw "port availability must not fail open on probe timeout or socket errors"
}

Write-Host "checked-command behavior tests passed"
