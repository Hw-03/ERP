$ErrorActionPreference = "Stop"

$ScriptPath = Join-Path $PSScriptRoot "..\start-backend.ps1"
$Content = Get-Content -Raw $ScriptPath

if ($Content -match 'Start-Process\s+powershell' -or $Content -match '"-NoExit"') {
    throw "start-backend.ps1 must not launch a separate powershell.exe window."
}

Write-Host "[test] OK - start-backend.ps1 does not launch powershell.exe"
