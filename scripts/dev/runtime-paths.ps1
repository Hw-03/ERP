# Resolve permanent DEXCOWIN MES runtime artifact paths.

function Get-MesRuntimeRoot {
    param([Parameter(Mandatory = $true)][string] $RepoRoot)

    $configured = [Environment]::GetEnvironmentVariable("MES_RUNTIME_ROOT", "Process")
    if ([string]::IsNullOrWhiteSpace($configured)) {
        $root = Join-Path $RepoRoot "_attic\runtime"
    }
    elseif ([System.IO.Path]::IsPathRooted($configured)) {
        $root = $configured
    }
    else {
        $root = Join-Path $RepoRoot $configured
    }
    return [System.IO.Path]::GetFullPath($root).TrimEnd('\')
}

function Assert-MesRuntimePathHasNoReparsePoint {
    param(
        [Parameter(Mandatory = $true)][string] $Root,
        [Parameter(Mandatory = $true)][string] $Candidate
    )

    $components = [System.Collections.Generic.List[string]]::new()
    $components.Add($Root)
    if (-not [string]::Equals($Candidate, $Root, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relative = $Candidate.Substring($Root.Length).TrimStart('\', '/')
        $current = $Root
        foreach ($part in ($relative -split '[\\/]' | Where-Object { $_ })) {
            $current = Join-Path $current $part
            $components.Add($current)
        }
    }

    foreach ($component in $components) {
        if (-not (Test-Path -LiteralPath $component)) {
            continue
        }
        $item = Get-Item -LiteralPath $component -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "runtime path contains a reparse point: $component"
        }
    }
}

function Get-MesRuntimePath {
    param(
        [Parameter(Mandatory = $true)][string] $RepoRoot,
        [Parameter(Mandatory = $true)][string] $RelativePath,
        [switch] $CreateDirectory
    )

    $root = Get-MesRuntimeRoot -RepoRoot $RepoRoot
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $root $RelativePath)).TrimEnd('\')
    $prefix = "$root\"
    $insideRoot = [string]::Equals($candidate, $root, [System.StringComparison]::OrdinalIgnoreCase) -or
        $candidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
    if (-not $insideRoot) {
        throw "runtime path is outside MES_RUNTIME_ROOT: $candidate"
    }
    Assert-MesRuntimePathHasNoReparsePoint -Root $root -Candidate $candidate
    if ($CreateDirectory) {
        New-Item -ItemType Directory -Force -Path $candidate | Out-Null
    }
    return $candidate
}
