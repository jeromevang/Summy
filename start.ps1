# Summy Startup Script
# Kills existing node processes and starts server + client

Write-Host "Killing existing node processes..." -ForegroundColor Yellow
try {
    $nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        $nodeProcesses | Stop-Process -Force
        Write-Host "Node processes killed" -ForegroundColor Green
        Start-Sleep -Seconds 2
    } else {
        Write-Host "No node processes found to kill" -ForegroundColor Gray
    }
} catch {
    Write-Host "No node processes found to kill" -ForegroundColor Gray
}

Write-Host "Starting Summy server..." -ForegroundColor Cyan
$serverJob = Start-Job -ScriptBlock {
    Set-Location "$PSScriptRoot\server"
    npm run dev
}

Write-Host "Starting Summy client..." -ForegroundColor Cyan
$clientJob = Start-Job -ScriptBlock {
    Set-Location "$PSScriptRoot\client"
    npm run dev
}

Write-Host ""
Write-Host "Summy is starting up!" -ForegroundColor Green
Write-Host "- Server: http://localhost:3001" -ForegroundColor White
Write-Host "- Client: http://localhost:5174 (or next available port)" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop all processes..." -ForegroundColor Gray

# Wait for jobs and handle cleanup
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "Stopping all processes..." -ForegroundColor Yellow
    $serverJob | Stop-Job -ErrorAction SilentlyContinue
    $clientJob | Stop-Job -ErrorAction SilentlyContinue
    Get-Job | Remove-Job -ErrorAction SilentlyContinue
}
