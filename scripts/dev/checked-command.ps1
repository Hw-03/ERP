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
        # Alembic 등 정상 도구도 진행 정보를 stderr로 남긴다. 호출자의 Stop 정책이
        # 이를 NativeCommandError로 승격하지 않도록, 종료 코드는 아래에서 판정한다.
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $output = @(& $FilePath @ArgumentList 2>&1)
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
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
