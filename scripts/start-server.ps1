# Start Summy Server
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "      Starting Summy Server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Killing any existing server processes..." -ForegroundColor Yellow
try {
    $nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        $nodeProcesses | Stop-Process -Force
        Write-Host "Existing processes killed" -ForegroundColor Green
        Start-Sleep -Seconds 2
    } else {
        Write-Host "No existing processes to kill" -ForegroundColor Gray
    }
} catch {
    Write-Host "No existing processes to kill" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Starting server..." -ForegroundColor Green

try {
    Set-Location "$PSScriptRoot\server"
    Write-Host "Starting Summy server on http://localhost:3001" -ForegroundColor Cyan
    Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
    Write-Host ""
    npm run dev
} catch {
    Write-Host "ERROR: Could not find server directory or start server" -ForegroundColor Red
    Read-Host "Press Enter to exit"
}
