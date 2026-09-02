@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
  echo Subtitle generator is starting up, the browser will open automatically
  node server.js
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:8631"
  python -m http.server 8631
  goto :eof
)

echo Node.js or Python not found. Please install Node.js first, then try again.
pause
