# Simple script to run the dashboard locally and connect to staging API

$STAGING_API = "http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com"
$DASHBOARD_PATH = "apps/api/public/dashboard.html"

# Check if Python is available
if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "Starting local dashboard server..." -ForegroundColor Green
    Write-Host "Dashboard will be available at: http://localhost:8000/$DASHBOARD_PATH?api=$STAGING_API" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
    Write-Host ""
    Set-Location (Split-Path $PSScriptRoot -Parent)
    python -m http.server 8000
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    Write-Host "Starting local dashboard server..." -ForegroundColor Green
    Write-Host "Dashboard will be available at: http://localhost:8000/$DASHBOARD_PATH?api=$STAGING_API" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
    Write-Host ""
    Set-Location (Split-Path $PSScriptRoot -Parent)
    python3 -m http.server 8000
} else {
    Write-Host "Error: Python is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "You can:" -ForegroundColor Yellow
    Write-Host "1. Install Python from https://www.python.org/downloads/" -ForegroundColor White
    Write-Host "2. Or use Node.js: npx http-server apps/api/public -p 8000" -ForegroundColor White
    Write-Host "3. Or open the file directly (CORS may limit functionality)" -ForegroundColor White
    exit 1
}



