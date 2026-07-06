# scripts/dev/resolve-server-profile.ps1
# Resolve the runtime profile from the script location so C:\ERP and C:\ERP-dev never cross-run each other.

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$DevRoot = "C:\ERP"
$EmployeeRoot = "C:\ERP-dev"

function Test-SamePath {
    param(
        [string] $Left,
        [string] $Right
    )
    return [string]::Equals(
        [System.IO.Path]::GetFullPath($Left).TrimEnd('\'),
        [System.IO.Path]::GetFullPath($Right).TrimEnd('\'),
        [System.StringComparison]::OrdinalIgnoreCase
    )
}

if (Test-SamePath $RepoRoot $DevRoot) {
    $name = "development"
    $label = "development"
    $frontendPort = 3001
    $backendPort = 8011
}
elseif (Test-SamePath $RepoRoot $EmployeeRoot) {
    $name = "employee"
    $label = "employee"
    $frontendPort = 3000
    $backendPort = 8010
}
else {
    throw "Unknown DEXCOWIN MES runtime root: $RepoRoot. Allowed: $DevRoot or $EmployeeRoot"
}

[pscustomobject]@{
    Name = $name
    Label = $label
    RepoRoot = $RepoRoot
    FrontendPort = $frontendPort
    BackendPort = $backendPort
    BackendInternalUrl = "http://localhost:$backendPort"
    PublicUrl = "http://192.168.0.63:$frontendPort"
}
