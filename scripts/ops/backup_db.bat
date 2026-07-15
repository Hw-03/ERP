@echo off
rem Thin Windows wrapper for the verified Python backup tool.
py "%~dp0backup_db.py" %*
exit /b %ERRORLEVEL%
