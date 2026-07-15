$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
. (Join-Path $repoRoot "scripts\dev\runtime-paths.ps1")

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) "mes-runtime-path-test-$PID-$([guid]::NewGuid().ToString('N'))"
$runtimeRoot = Join-Path $testRoot "runtime"
$outside = Join-Path $testRoot "outside"
$junction = Join-Path $runtimeRoot "linked"
$previousRuntimeRoot = [Environment]::GetEnvironmentVariable("MES_RUNTIME_ROOT", "Process")

try {
    New-Item -ItemType Directory -Force -Path $runtimeRoot, $outside | Out-Null
    New-Item -ItemType Junction -Path $junction -Target $outside | Out-Null
    [Environment]::SetEnvironmentVariable("MES_RUNTIME_ROOT", $runtimeRoot, "Process")

    $rejected = $false
    try {
        Get-MesRuntimePath -RepoRoot $repoRoot -RelativePath "linked\created-outside" -CreateDirectory | Out-Null
    }
    catch {
        $rejected = $_.Exception.Message -match "reparse point"
    }

    if (-not $rejected) {
        throw "runtime path resolver did not reject an existing junction"
    }
    if (Test-Path -LiteralPath (Join-Path $outside "created-outside")) {
        throw "runtime path resolver wrote through a junction outside MES_RUNTIME_ROOT"
    }
}
finally {
    [Environment]::SetEnvironmentVariable("MES_RUNTIME_ROOT", $previousRuntimeRoot, "Process")
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "runtime-path junction behavior tests passed"
