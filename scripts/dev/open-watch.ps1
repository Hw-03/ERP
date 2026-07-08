# Open the DEXCOWIN MES monitor as Backend/Frontend split panes when Windows Terminal is available.

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$WatchService = Join-Path $PSScriptRoot "watch-service.ps1"
$PowerShellExe = (Get-Command powershell.exe -ErrorAction Stop).Source
$Wt = Get-Command wt.exe -ErrorAction SilentlyContinue
$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
$EmployeeTitle = -join ([char[]] @(0xC9C1, 0xC6D0, 0xC6A9))
$DevelopmentTitle = -join ([char[]] @(0xAC1C, 0xBC1C, 0xC6A9))
$TabTitle = if ($Profile.Name -eq "employee") { $EmployeeTitle } else { $DevelopmentTitle }

if ($Wt) {
    $wtArgs = @(
        "new-tab",
        "--title", $TabTitle,
        "--startingDirectory", $RepoRoot,
        $PowerShellExe,
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-NoExit",
        "-File", $WatchService,
        "-Service", "backend",
        ";",
        "split-pane",
        "--vertical",
        "--title", $TabTitle,
        "--startingDirectory", $RepoRoot,
        $PowerShellExe,
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-NoExit",
        "-File", $WatchService,
        "-Service", "frontend"
    )
    & $Wt.Source @wtArgs
    exit $LASTEXITCODE
}

$backendArgs = "-NoProfile -ExecutionPolicy Bypass -NoExit -File `"$WatchService`" -Service backend"
$frontendArgs = "-NoProfile -ExecutionPolicy Bypass -NoExit -File `"$WatchService`" -Service frontend"

Start-Process -FilePath $PowerShellExe -WorkingDirectory $RepoRoot -ArgumentList $backendArgs -WindowStyle Normal
Start-Process -FilePath $PowerShellExe -WorkingDirectory $RepoRoot -ArgumentList $frontendArgs -WindowStyle Normal
