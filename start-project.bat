@echo off
cd /d "%~dp0"

echo Starting Live Agent backend and frontend...
echo.

python start-project.py
pause
