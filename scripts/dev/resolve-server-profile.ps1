# scripts/dev/resolve-server-profile.ps1
# Resolve the runtime profile from the script location so C:\ERP and C:\ERP-dev never cross-run each other.

param(
    [ValidateSet("BackendInternalUrl")]
    [string] $Property,
    # Runtime consumers may supply an explicit root, but it must satisfy the production allowlist.
    [string] $RuntimeRepoRoot,
    # Windows CI contract tests supply a representative runtime root because checkout paths are not C:\ERP.
    [string] $TestRepoRoot
)

$ErrorActionPreference = "Stop"

$UsingRuntimeRepoRoot = -not [string]::IsNullOrWhiteSpace($RuntimeRepoRoot)
$UsingTestRepoRoot = -not [string]::IsNullOrWhiteSpace($TestRepoRoot)
if ($UsingRuntimeRepoRoot -and $UsingTestRepoRoot) {
    throw "RuntimeRepoRoot and TestRepoRoot cannot be used together"
}
$RepoRoot = if ($UsingTestRepoRoot) {
    [System.IO.Path]::GetFullPath($TestRepoRoot)
}
elseif ($UsingRuntimeRepoRoot) {
    [System.IO.Path]::GetFullPath($RuntimeRepoRoot)
}
else {
    (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
$DevRoot = "C:\ERP"
$EmployeeRoot = "C:\ERP-dev"
$DevWorktreeRoot = Join-Path $DevRoot ".worktrees"

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

function Test-ChildPath {
    param(
        [string] $Path,
        [string] $Parent
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
    $fullParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    return $fullPath.StartsWith($fullParent, [System.StringComparison]::OrdinalIgnoreCase)
}

if ((Test-SamePath $RepoRoot $DevRoot) -or (Test-ChildPath $RepoRoot $DevWorktreeRoot)) {
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
elseif ($UsingTestRepoRoot) {
    # Test-only CI override: an arbitrary checkout root represents the development profile.
    $name = "development"
    $label = "development"
    $frontendPort = 3001
    $backendPort = 8011
}
else {
    throw "Unknown DEXCOWIN MES runtime root: $RepoRoot. Allowed: $DevRoot or $EmployeeRoot"
}

$profile = [pscustomobject]@{
    Name = $name
    Label = $label
    RepoRoot = $RepoRoot
    FrontendPort = $frontendPort
    BackendPort = $backendPort
    BackendInternalUrl = "http://localhost:$backendPort"
    PublicUrl = "http://192.168.0.63:$frontendPort"
}

if ($Property) {
    $profile.$Property
}
else {
    $profile
}
