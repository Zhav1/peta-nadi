# PreHub Unified PowerShell Launcher
$ErrorActionPreference = "Stop"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  PreHub: Food Logistics Early Warning System" -ForegroundColor Green
Write-Host "  Launching Backend (FastAPI) and Frontend (Next.js)" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[1/2] Starting Backend API (http://localhost:8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

Write-Host "[2/2] Starting Frontend App (http://localhost:3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "✅ Both services successfully launched in dedicated windows!" -ForegroundColor Green
Write-Host "   - Backend API Docs: http://localhost:8000/docs" -ForegroundColor Gray
Write-Host "   - Frontend UI:      http://localhost:3000" -ForegroundColor Gray
Write-Host ""
