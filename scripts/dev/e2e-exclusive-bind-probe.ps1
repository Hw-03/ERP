param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 65535)]
    [int] $Port
)

$ErrorActionPreference = "Stop"
$listener = [System.Net.Sockets.TcpListener]::new(
    [System.Net.IPAddress]::Loopback,
    $Port
)
try {
    $listener.Server.ExclusiveAddressUse = $true
    $listener.Start()
    Write-Output "AVAILABLE"
}
catch {
    Write-Output "UNAVAILABLE"
}
finally {
    $listener.Stop()
}
