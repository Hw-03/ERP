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
    $label = "개발"
    $frontendPort = 3001
    $backendPort = 8011
}
elseif (Test-SamePath $RepoRoot $EmployeeRoot) {
    $name = "employee"
    $label = "직원"
    $frontendPort = 3000
    $backendPort = 8010
}
else {
    throw "알 수 없는 DEXCOWIN MES 실행 루트입니다: $RepoRoot. 허용: $DevRoot 또는 $EmployeeRoot"
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
