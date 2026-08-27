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

if (-not (Test-Path -LiteralPath $MarkerPath -PathType Leaf)) {
    throw "Refusing removal because the DEXCOWIN MES crash-dump marker is missing: $MarkerPath"
}
if (-not (Test-Path -LiteralPath $RegistryKey)) {
    throw "Refusing removal because the marked node.exe LocalDumps registry key is missing: $RegistryKey"
}

$marker = Get-Content -LiteralPath $MarkerPath -Raw | ConvertFrom-Json
if ($marker.schemaVersion -ne 1 -or
    $marker.registryKey -ne $RegistryKey -or
    $marker.dumpFolder -ne $DumpFolder -or
    [int] $marker.dumpType -ne 1 -or
    [int] $marker.dumpCount -ne 3) {
    throw "Refusing removal because the DEXCOWIN MES crash-dump marker does not match this configuration."
}

$configuration = Get-ItemProperty -LiteralPath $RegistryKey
if ([int] $configuration.DumpType -ne 1 -or
    [int] $configuration.DumpCount -ne 3 -or
    -not [string]::Equals([string] $configuration.DumpFolder, $DumpFolder, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing removal because the node.exe LocalDumps values no longer match the marked configuration."
}
if (-not $WhatIfPreference -and -not (Test-Administrator)) {
    throw "Run this crash-dump removal script from an elevated PowerShell session."
}
if (-not $PSCmdlet.ShouldProcess($RegistryKey, "Disable the marked node.exe WER minidump configuration and preserve dump files")) {
    return
}

Remove-Item -LiteralPath $RegistryKey -Recurse -Force
Remove-Item -LiteralPath $MarkerPath -Force
if (@(Get-ChildItem -LiteralPath $MarkerRoot -Force).Count -eq 0) {
    Remove-Item -LiteralPath $MarkerRoot -Force
}
Write-Host "Disabled the marked node.exe WER minidump configuration. Existing dump files were preserved in $DumpFolder"
