[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RegistryKey = "HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\node.exe"
$DumpFolder = "C:\ERP\_attic\runtime\logs\frontend\crashdumps"
$MarkerRoot = "C:\ProgramData\DEXCOWIN MES\CrashDumps"
$MarkerPath = Join-Path $MarkerRoot "dexcowin-mes-frontend-crash-dumps.json"

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (Test-Path -LiteralPath $RegistryKey) {
    throw "Refusing to overwrite an existing node.exe LocalDumps configuration: $RegistryKey"
}
if (Test-Path -LiteralPath $MarkerPath) {
    throw "Refusing to overwrite an existing DEXCOWIN MES crash-dump marker: $MarkerPath"
}
if (-not $WhatIfPreference -and -not (Test-Administrator)) {
    throw "Run this crash-dump setup script from an elevated PowerShell session."
}
if (-not $PSCmdlet.ShouldProcess($RegistryKey, "Enable three node.exe Windows Error Reporting minidumps in $DumpFolder")) {
    return
}

$createdDumpFolder = $false
$createdMarkerRoot = $false
$createdRegistryKey = $false
try {
    if (-not (Test-Path -LiteralPath $DumpFolder)) {
        New-Item -ItemType Directory -Path $DumpFolder -Force | Out-Null
        $createdDumpFolder = $true
    }
    if (-not (Test-Path -LiteralPath $MarkerRoot)) {
        New-Item -ItemType Directory -Path $MarkerRoot -Force | Out-Null
        $createdMarkerRoot = $true
    }

    New-Item -Path $RegistryKey -Force | Out-Null
    $createdRegistryKey = $true
    New-ItemProperty -Name "DumpType" -LiteralPath $RegistryKey -PropertyType DWord -Value 1 -Force | Out-Null
    New-ItemProperty -Name "DumpCount" -LiteralPath $RegistryKey -PropertyType DWord -Value 3 -Force | Out-Null
    New-ItemProperty -Name "DumpFolder" -LiteralPath $RegistryKey -PropertyType ExpandString -Value $DumpFolder -Force | Out-Null

    $configuration = Get-ItemProperty -LiteralPath $RegistryKey
    if ([int] $configuration.DumpType -ne 1 -or
        [int] $configuration.DumpCount -ne 3 -or
        -not [string]::Equals([string] $configuration.DumpFolder, $DumpFolder, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Windows Error Reporting node.exe configuration verification failed."
    }

    $marker = [ordered]@{
        schemaVersion = 1
        registryKey = $RegistryKey
        dumpFolder = $DumpFolder
        dumpType = 1
        dumpCount = 3
        enabledUtc = [DateTime]::UtcNow.ToString("o")
    }
    $marker | ConvertTo-Json | Set-Content -LiteralPath $MarkerPath -Encoding utf8
    Write-Host "Enabled node.exe WER minidumps. Folder: $DumpFolder; maximum files: 3"
}
catch {
    $setupError = $_.Exception.Message
    $cleanupIssues = [System.Collections.Generic.List[string]]::new()
    if ($createdRegistryKey -and (Test-Path -LiteralPath $RegistryKey)) {
        try { Remove-Item -LiteralPath $RegistryKey -Recurse -Force }
        catch { $cleanupIssues.Add("registry cleanup failed: $($_.Exception.Message)") }
    }
    if (Test-Path -LiteralPath $MarkerPath) {
        try { Remove-Item -LiteralPath $MarkerPath -Force }
        catch { $cleanupIssues.Add("marker cleanup failed: $($_.Exception.Message)") }
    }
    if ($createdMarkerRoot -and (Test-Path -LiteralPath $MarkerRoot)) {
        try { Remove-Item -LiteralPath $MarkerRoot -Force }
        catch { $cleanupIssues.Add("marker directory cleanup failed: $($_.Exception.Message)") }
    }
    if ($createdDumpFolder -and (Test-Path -LiteralPath $DumpFolder)) {
        try { Remove-Item -LiteralPath $DumpFolder -Force }
        catch { $cleanupIssues.Add("empty dump directory cleanup failed: $($_.Exception.Message)") }
    }
    if ($cleanupIssues.Count -gt 0) {
        throw "Crash-dump setup failed: $setupError Cleanup incomplete: $($cleanupIssues -join ' ')"
    }
    throw "Crash-dump setup failed and newly created settings were removed: $setupError"
}
