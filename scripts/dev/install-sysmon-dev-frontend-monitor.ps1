[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$InstallRoot = "C:\ProgramData\DEXCOWIN MES\Sysmon"
$MarkerPath = Join-Path $InstallRoot "dexcowin-mes-dev-frontend-monitor.json"
$ConfigPath = Join-Path $PSScriptRoot "sysmon-dev-frontend.xml"
$SysmonDownloadUri = "https://download.sysinternals.com/files/Sysmon.zip"
$ZipPath = Join-Path $InstallRoot "Sysmon.zip"
$StagingRoot = Join-Path $InstallRoot "download"
$SysmonExecutable = Join-Path $InstallRoot "Sysmon64.exe"
$OperationalLogName = "Microsoft-Windows-Sysmon/Operational"

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-MicrosoftSignedSysmon {
    param([Parameter(Mandatory = $true)][string] $Path)

    $signature = Get-AuthenticodeSignature -FilePath $Path
    if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notlike "*Microsoft*") {
        throw "Sysmon64.exe must have a valid Microsoft Authenticode signature: $Path"
    }
}

function Assert-OwnedSysmon64ServicePath {
    param(
        [Parameter(Mandatory = $true)][string] $ServicePath,
        [Parameter(Mandatory = $true)][string] $ExpectedPath
    )

    if ([string]::IsNullOrWhiteSpace($ServicePath)) {
        throw "Sysmon64 service PathName is unavailable."
    }

    $expectedFullPath = [System.IO.Path]::GetFullPath($ExpectedPath)
    $quotedPath = [regex]::Match($ServicePath, '^\s*"(?<path>[^"]+)"(?:\s+.*)?$')
    if ($quotedPath.Success) {
        $serviceExecutable = [System.IO.Path]::GetFullPath($quotedPath.Groups["path"].Value)
    }
    elseif ($ServicePath.StartsWith($expectedFullPath, [System.StringComparison]::OrdinalIgnoreCase) -and
        ($ServicePath.Length -eq $expectedFullPath.Length -or [char]::IsWhiteSpace($ServicePath[$expectedFullPath.Length]))) {
        $serviceExecutable = $expectedFullPath
    }
    else {
        throw "Sysmon64 service PathName does not identify the expected executable: $ServicePath"
    }

    if (-not [string]::Equals($serviceExecutable, $expectedFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Sysmon64 service PathName does not match the expected executable: $ServicePath"
    }
}

function Invoke-FailedInstallCleanup {
    param(
        [Parameter(Mandatory = $true)][bool] $ServiceInstallInvoked
    )

    $issues = [System.Collections.Generic.List[string]]::new()
    $canRemoveRoot = $true
    if ($ServiceInstallInvoked) {
        try {
            $services = @(Get-CimInstance -ClassName Win32_Service -Filter "Name='Sysmon64'" -ErrorAction Stop)
            if ($services.Count -gt 1) {
                throw "More than one Sysmon64 service was found."
            }
            if ($services.Count -eq 1) {
                Assert-OwnedSysmon64ServicePath -ServicePath ([string] $services[0].PathName) -ExpectedPath $SysmonExecutable
                & $SysmonExecutable -u | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    throw "Sysmon64 cleanup removal failed with exit code $LASTEXITCODE."
                }
                if (@(Get-CimInstance -ClassName Win32_Service -Filter "Name='Sysmon64'" -ErrorAction Stop).Count -gt 0) {
                    throw "Sysmon64 service remains after cleanup removal."
                }
            }
        }
        catch {
            $canRemoveRoot = $false
            $issues.Add("Sysmon64 cleanup was not safe to complete: $($_.Exception.Message)")
        }
    }

    if ($canRemoveRoot) {
        try {
            if (Test-Path -LiteralPath $InstallRoot) {
                Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction Stop
            }
        }
        catch {
            $issues.Add("Unable to remove the newly created Sysmon storage directory: $($_.Exception.Message)")
        }
    }
    else {
        $issues.Add("The newly created Sysmon storage directory was preserved because service cleanup did not complete.")
    }

    return $issues.ToArray()
}

if (-not $WhatIfPreference -and -not (Test-Administrator)) {
    throw "Run this installation script from an elevated PowerShell session."
}

if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    throw "Sysmon configuration file was not found: $ConfigPath"
}

$existingServices = @(Get-Service -Name @("Sysmon", "Sysmon64") -ErrorAction SilentlyContinue)
if ($existingServices.Count -gt 0) {
    throw "Refusing to modify an existing Sysmon service. Existing services: $($existingServices.Name -join ', ')"
}

if (Test-Path -LiteralPath $InstallRoot) {
    throw "Refusing to reuse the existing Sysmon storage directory: $InstallRoot"
}

if (-not $PSCmdlet.ShouldProcess($InstallRoot, "Install standalone Sysmon64 development frontend monitor")) {
    return
}

$createdInstallRoot = $false
$serviceInstallInvoked = $false
try {
    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
    $createdInstallRoot = $true
    Invoke-WebRequest -Uri $SysmonDownloadUri -OutFile $ZipPath -UseBasicParsing
    New-Item -ItemType Directory -Path $StagingRoot -Force | Out-Null
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $StagingRoot -Force

    $downloadedExecutable = Get-ChildItem -LiteralPath $StagingRoot -Filter "Sysmon64.exe" -File -Recurse | Select-Object -First 1
    if ($null -eq $downloadedExecutable) {
        throw "Sysmon.zip did not contain Sysmon64.exe."
    }

    Assert-MicrosoftSignedSysmon -Path $downloadedExecutable.FullName
    Move-Item -LiteralPath $downloadedExecutable.FullName -Destination $SysmonExecutable
    Copy-Item -LiteralPath $ConfigPath -Destination (Join-Path $InstallRoot "sysmon-dev-frontend.xml")

    $marker = [ordered]@{
        schemaVersion = 1
        status = "installing"
        installRoot = $InstallRoot
        executablePath = $SysmonExecutable
        configPath = Join-Path $InstallRoot "sysmon-dev-frontend.xml"
        installedUtc = [DateTime]::UtcNow.ToString("o")
    }
    $marker | ConvertTo-Json | Set-Content -LiteralPath $MarkerPath -Encoding utf8

    $serviceInstallInvoked = $true
    & $SysmonExecutable -accepteula -i $marker.configPath
    if ($LASTEXITCODE -ne 0) {
        throw "Sysmon64 installation failed with exit code $LASTEXITCODE."
    }

    $installedService = Get-Service -Name "Sysmon64" -ErrorAction Stop
    if ($installedService.Status -notin @("Running", "Stopped")) {
        throw "Sysmon64 service did not reach an expected state: $($installedService.Status)"
    }

    $operationalLog = Get-WinEvent -ListLog $OperationalLogName -ErrorAction Stop
    if (-not $operationalLog.IsEnabled) {
        throw "Sysmon Operational event channel is disabled: $OperationalLogName"
    }

    $effectiveConfiguration = & $SysmonExecutable -c
    if ($LASTEXITCODE -ne 0) {
        throw "Sysmon64 configuration verification failed with exit code $LASTEXITCODE."
    }
    $effectiveConfigurationText = [string] ($effectiveConfiguration -join [Environment]::NewLine)
    if ($effectiveConfigurationText -notmatch "ProcessAccess" -or
        $effectiveConfigurationText -notmatch "node\.exe") {
        throw "Sysmon64 effective configuration does not contain the required node.exe ProcessAccess rule."
    }

    $marker.status = "installed"
    $marker.verifiedUtc = [DateTime]::UtcNow.ToString("o")
    $marker | ConvertTo-Json | Set-Content -LiteralPath $MarkerPath -Encoding utf8
    Write-Host "Installed Sysmon64 frontend monitor. Operational log: $OperationalLogName"
}
catch {
    $installationError = $_.Exception.Message
    $cleanupIssues = @()
    if ($createdInstallRoot) {
        $cleanupIssues = @(Invoke-FailedInstallCleanup -ServiceInstallInvoked $serviceInstallInvoked)
    }
    if ($cleanupIssues.Count -gt 0) {
        throw "Sysmon installation failed: $installationError Cleanup incomplete. Manual recovery is required: inspect $InstallRoot and $MarkerPath. $($cleanupIssues -join ' ')"
    }
    throw "Sysmon installation failed and the newly created installation artifacts were removed: $installationError"
}
