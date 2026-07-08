# scripts/dev/watch-servers.ps1
# Compatibility entry point. The monitor now opens Backend/Frontend split panes.

$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "open-watch.ps1")
