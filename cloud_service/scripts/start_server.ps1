# PowerShell script to start Cloud Service
# Activates bmcloud virtual environment and runs the server

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Cloud Service - Biometric Validation" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = $PSScriptRoot
$parentDir = Split-Path $projectRoot -Parent
$venvPath = Join-Path $parentDir "bmcloud"
$activateScript = Join-Path $venvPath "Scripts\Activate.ps1"

# Check if virtual environment exists
if (-not (Test-Path $venvPath)) {
    Write-Host "ERROR: Virtual environment 'bmcloud' not found!" -ForegroundColor Red
    Write-Host "Expected at: $venvPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please create it first:" -ForegroundColor Yellow
    Write-Host "  python -m venv bmcloud" -ForegroundColor White
    Write-Host "  bmcloud\Scripts\activate" -ForegroundColor White
    Write-Host "  pip install -r src/requirements.txt" -ForegroundColor White
    exit 1
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Green
& $activateScript

# Change to src directory
$srcPath = Join-Path $projectRoot "src"
Set-Location $srcPath

Write-Host "Working directory: $srcPath" -ForegroundColor Gray
Write-Host ""
Write-Host "Starting server on http://localhost:8000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host "------------------------------------------" -ForegroundColor Gray
Write-Host ""

# Start server
try {
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --log-level info
} catch {
    Write-Host ""
    Write-Host "Server stopped" -ForegroundColor Yellow
}
