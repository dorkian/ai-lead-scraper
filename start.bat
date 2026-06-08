@echo off
cd /d "%~dp0"

echo.
echo  LeadEngine ^| starting on http://localhost:3252
echo.

pip install -r requirements.txt -q

timeout /t 1 /nobreak >nul
start "" "http://localhost:3252"

python server.py --reload
