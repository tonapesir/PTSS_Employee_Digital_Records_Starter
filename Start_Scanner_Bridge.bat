@echo off
title PTSS Employee Records - Scanner Bridge
cd /d "%~dp0"
echo Installing required Python packages if missing...
py -m pip install flask flask-cors
echo.
echo IMPORTANT: Set NAPS2_PROFILE in Windows environment variables to the exact NAPS2 profile name.
echo Default NAPS2 path: C:\Program Files\NAPS2\NAPS2.Console.exe
echo.
py ScannerBridge.py
pause
