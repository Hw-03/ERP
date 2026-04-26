@echo off
rem ============================================================
rem  Verify the most recent backup file:
rem    - PRAGMA integrity_check
rem    - row counts (items / inventory / transaction_logs / bom / admin_audit_logs)
rem  Excludes erp_PRE-RESTORE_* files from "most recent" lookup.
rem ============================================================
setlocal

set "ROOT=%~dp0..\.."

for /f "usebackq delims=" %%f in (`powershell -NoProfile -Command "(Get-ChildItem '%ROOT%\backend\_backup\erp_*.db' | Where-Object { $_.Name -notlike '*PRE-RESTORE*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName"`) do set "LATEST=%%f"

if not defined LATEST (
    echo [VERIFY] no backup found in %ROOT%\backend\_backup\
    exit /b 1
)

echo [VERIFY] latest backup: %LATEST%

python "%~dp0_verify_backup.py" "%LATEST%"

endlocal
exit /b %ERRORLEVEL%
