@echo off
rem Verify the newest regular SQLite backup under MES_RUNTIME_ROOT.
pushd "%~dp0"
py "_verify_backup.py" --latest
set "RC=%ERRORLEVEL%"
popd
exit /b %RC%
