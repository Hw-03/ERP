[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$InstallRoot = "C:\ProgramData\DEXCOWIN MES\Sysmon"
$MarkerPath = Join-Path $InstallRoot "dexcowin-mes-dev-frontend-monitor.json"
$SysmonExecutable = Join-Path $InstallRoot "Sysmon64.exe"
$ConfigPath = Join-Path $InstallRoot "sysmon-dev-frontend.xml"

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
        throw "Refusing removal because the Sysmon64 service PathName is unavailable."
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
        throw "Refusing removal because the Sysmon64 service PathName is not the marked executable: $ServicePath"
    }

    if (-not [string]::Equals($serviceExecutable, $expectedFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing removal because the Sysmon64 service PathName does not match the marked executable: $ServicePath"
    }
}

if (-not $WhatIfPreference -and -not (Test-Administrator)) {
    throw "Run this removal script from an elevated PowerShell session."
}

if (-not (Test-Path -LiteralPath $MarkerPath -PathType Leaf)) {
    throw "Refusing removal because the DEXCOWIN MES Sysmon marker is missing: $MarkerPath"
}

$marker = Get-Content -LiteralPath $MarkerPath -Raw | ConvertFrom-Json
if ($marker.schemaVersion -ne 1 -or
    $marker.installRoot -ne $InstallRoot -or
    $marker.executablePath -ne $SysmonExecutable -or
    $marker.configPath -ne $ConfigPath) {
    throw "Refusing removal because the DEXCOWIN MES Sysmon marker does not match this installation."
}

if (-not (Test-Path -LiteralPath $SysmonExecutable -PathType Leaf)) {
    throw "Refusing removal because the marked Sysmon64.exe is missing: $SysmonExecutable"
}

Assert-MicrosoftSignedSysmon -Path $SysmonExecutable

$ownedServices = @(Get-CimInstance -ClassName Win32_Service -Filter "Name='Sysmon64'" -ErrorAction Stop)
if ($ownedServices.Count -ne 1) {
    throw "Refusing removal because exactly one Sysmon64 service was not found."
}
Assert-OwnedSysmon64ServicePath -ServicePath ([string] $ownedServices[0].PathName) -ExpectedPath ([string] $marker.executablePath)

$otherSysmonService = @(Get-Service -Name "Sysmon" -ErrorAction SilentlyContinue)
if ($otherSysmonService.Count -gt 0) {
    throw "Refusing removal while a separate Sysmon service exists."
}

if (-not $PSCmdlet.ShouldProcess($InstallRoot, "Uninstall marked Sysmon64 monitor and remove its storage directory")) {
    return
}

& $SysmonExecutable -u
if ($LASTEXITCODE -ne 0) {
    throw "Sysmon64 removal failed with exit code $LASTEXITCODE."
}

if (@(Get-CimInstance -ClassName Win32_Service -Filter "Name='Sysmon64'" -ErrorAction Stop).Count -gt 0) {
    throw "Sysmon64 service remains after removal; keeping $InstallRoot for investigation."
}

Remove-Item -LiteralPath $InstallRoot -Recurse -Force
Write-Host "Removed the marked Sysmon64 frontend monitor."
