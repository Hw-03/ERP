@echo off
rem DEXCOWIN MES read-only daily operation gate.
setlocal
set "ROOT=%~dp0..\.."
python "%ROOT%\scripts\ops\operational_readiness.py" %*
exit /b %ERRORLEVEL%
