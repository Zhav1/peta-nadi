@echo off
TITLE PreHub - Unified Launcher
echo ===================================================
echo   PreHub: Food Logistics Early Warning System
echo   Launching Backend (FastAPI) and Frontend (Next.js)
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/2] Starting Backend API on http://localhost:8000 ...
start "PreHub Backend (FastAPI)" cmd /k "cd /d %~dp0backend && .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/2] Starting Frontend App on http://localhost:3000 ...
start "PreHub Frontend (Next.js)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo All services launched!
echo - Backend API Docs: http://localhost:8000/docs
echo - Frontend Command Center: http://localhost:3000
echo.
pause
