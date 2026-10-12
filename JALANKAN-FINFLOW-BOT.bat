@echo off
title FinFlow WhatsApp Bot Launcher (Auto-Start)
cd /d "%~dp0"

echo ========================================================
echo          FINFLOW WHATSAPP BOT AUTO-LAUNCHER
echo ========================================================
echo.
echo [1/3] Memeriksa dan membersihkan proses bot lama...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kill-bot.ps1" >nul 2>&1

echo [2/3] Memasang Auto-Start Windows (Startup Folder)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-autostart.ps1"

echo [3/3] Menjalankan FinFlow Bot di latar belakang (Silent Mode)...
wscript.exe "%~dp0JALANKAN-FINFLOW-BOT.vbs"

echo.
echo ========================================================
echo [BERHASIL] Bot FinFlow sekarang aktif di latar belakang!
echo [BERHASIL] Auto-Start AKTIF! Bot akan otomatis berjalan
echo            setiap kali komputer dinyalakan atau direstart.
echo ========================================================
echo.
echo Untuk mengecek status server / scan QR, buka "CEK-STATUS-BOT.bat".
echo.
ping 127.0.0.1 -n 4 >nul 2>&1
