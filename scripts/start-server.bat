@echo off
echo ========================================
echo       Starting Summy Server
echo ========================================
echo.

echo Killing any existing server processes...
taskkill /F /IM node.exe /T 2>nul
if %errorlevel% neq 0 (
    echo No existing processes to kill
) else (
    echo Existing processes killed
)
timeout /t 2 /nobreak > nul

echo.
echo Starting server...
cd server
if %errorlevel% neq 0 (
    echo ERROR: Could not find server directory
    pause
    exit /b 1
)

echo Starting Summy server on http://localhost:3001
echo Press Ctrl+C to stop the server
echo.
npm run dev
