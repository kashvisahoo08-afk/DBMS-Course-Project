@echo off
title Retail Management System
color 0A
cd /d "c:\Users\Kashvi Sahoo\OneDrive\Desktop\DBMS\retail-management-system"

echo.
echo  =====================================================
echo   Retail Inventory ^& Sales Management System
echo  =====================================================
echo.
echo  Starting server...
echo  Opening browser at http://127.0.0.1:5000
echo.
echo  Press CTRL+C to stop the server.
echo  =====================================================
echo.

:: Wait 2 seconds then open browser
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:5000"

:: Start Flask
"C:\Users\Kashvi Sahoo\anaconda3\python.exe" app.py

pause
