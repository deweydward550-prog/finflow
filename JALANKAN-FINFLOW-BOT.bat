@echo off
title FinFlow Bot & Tunnel Launcher
cd /d "%~dp0"

echo ========================================================
echo        FINFLOW WHATSAPP BOT & TUNNEL LAUNCHER
echo ========================================================
echo Menjalankan bot dan HTTPS tunnel di latar belakang (Silent Mode)...
echo.

wscript.exe "%~dp0JALANKAN-FINFLOW-BOT.vbs"

echo [OK] Bot dan Tunnel telah berjalan di latar belakang!
echo Untuk memeriksa status server, buka "CEK-STATUS-BOT.bat".
echo.
timeout /t 3
