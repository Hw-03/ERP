param(
    [Parameter(Mandatory = $true)][string] $RepoRoot
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "runtime-task-control.ps1")

$resolvedRoot = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\')
Assert-RuntimeTasksConfigured -RepoRoot $resolvedRoot
Write-Output "RUNTIME_TASK_RECOVERY=PASS"
