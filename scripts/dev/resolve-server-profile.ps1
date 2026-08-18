# scripts/dev/resolve-server-profile.ps1
# Resolve the runtime profile from the script location so C:\ERP and C:\ERP-dev never cross-run each other.

param(
    [ValidateSet("BackendInternalUrl")]
    [string] $Property,
    # Windows CI contract tests supply a representative runtime root because checkout paths are not C:\ERP.
    [string] $TestRepoRoot
)

$ErrorActionPreference = "Stop"

$RepoRoot = if ($TestRepoRoot) {
    [System.IO.Path]::GetFullPath($TestRepoRoot)
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
