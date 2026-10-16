@echo off
cd /d "%~dp0"
node scripts\pc-server.js open
if errorlevel 1 pause
