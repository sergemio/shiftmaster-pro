@echo off
REM Daily ShiftMaster backup, launched by Windows Task Scheduler.
REM Appends to a rolling log so a silent failure is still discoverable.
cd /d "%~dp0.."
"C:\Program Files\nodejs\node.exe" scripts\backup-firebase.js >> "%~dp0backup.log" 2>&1
echo [%date% %time%] exit=%ERRORLEVEL% >> "%~dp0backup.log"
