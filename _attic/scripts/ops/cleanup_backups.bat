@echo off
rem ============================================================
rem  Delete backup files older than N days (default: 30).
rem  Usage: cleanup_backups.bat [days]
rem ============================================================
setlocal

set "ROOT=%~dp0..\.."
set "DAYS=%~1"
if "%DAYS%"=="" set "DAYS=30"

echo [CLEANUP] removing backups older than %DAYS% days from %ROOT%\backend\_backup\

powershell -NoProfile -Command "$cut=(Get-Date).AddDays(-%DAYS%); $files=Get-ChildItem '%ROOT%\backend\_backup\erp_*.db' | Where-Object { $_.LastWriteTime -lt $cut }; if ($files) { $files | ForEach-Object { Write-Output ('  removed: ' + $_.Name); Remove-Item $_.FullName -Force } } else { Write-Output '  nothing to remove' }"

endlocal
exit /b 0
