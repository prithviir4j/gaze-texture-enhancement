@echo off
echo ==============================================================
echo Starting local web server...
echo Please open your browser and navigate to: http://localhost:8000
echo ==============================================================
python -m http.server 8000
pause
