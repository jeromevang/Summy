@echo off
echo Killing existing node processes...
taskkill /F /IM node.exe /T 2>nul
if %errorlevel% neq 0 (
    echo No node processes found to kill
) else (
    echo Node processes killed
    timeout /t 2 /nobreak > nul
)

echo Starting Summy server...
start cmd /k "cd server && npm run dev"

echo Starting Summy client...
start cmd /k "cd client && npm run dev"

echo.
echo Summy is starting up!
echo - Server: http://localhost:3001
echo - Client: http://localhost:5174 (or next available port)
echo.
echo Press any key to exit this window...
pause > nul
