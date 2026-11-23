@echo off
setlocal
cd /d "%~dp0"

set "NODE_DIR=%~dp0.tools\node\node-v20.18.1-win-x64"
if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install Node.js 18+ or restore the .tools folder.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies, please wait...
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting Self-Discipline Passbook...
echo Open http://localhost:5173 in your browser.
call npm.cmd run dev
endlocal