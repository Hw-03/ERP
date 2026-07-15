function Invoke-CheckedExternalCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $FilePath,
        [string[]] $ArgumentList = @(),
        [string] $WorkingDirectory
    )

    $pushed = $false
    try {
        if ($WorkingDirectory) {
            Push-Location -LiteralPath $WorkingDirectory
            $pushed = $true
        }
        $output = @(& $FilePath @ArgumentList 2>&1)
        $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int] $LASTEXITCODE }
        return [pscustomobject] @{
            Success     = ($exitCode -eq 0)
            ExitCode    = $exitCode
            LaunchError = $null
            Output      = $output
        }
    }
    catch {
        return [pscustomobject] @{
            Success     = $false
            ExitCode    = $null
            LaunchError = $_.Exception.Message
            Output      = @()
        }
    }
    finally {
        if ($pushed) {
            Pop-Location
        }
    }
}


function Get-MesActiveTcpListeners {
    return [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
}


function Test-TcpPortFree {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateRange(1, 65535)]
        [int] $Port
    )

    try {
        $listeners = Get-MesActiveTcpListeners
    }
    catch {
        Write-Warning "TCP listener enumeration failed; treating port $Port as unavailable: $($_.Exception.Message)"
        return $false
    }
    $isListening = $null -ne ($listeners | Where-Object { $_.Port -eq $Port } | Select-Object -First 1)
    return -not $isListening
}
