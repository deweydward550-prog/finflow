@echo off
title Hentikan FinFlow Bot Server
cd /d "%~dp0"
echo ========================================================
echo             MENGHENTIKAN FINFLOW BOT SERVER
echo ========================================================
echo Mematikan seluruh proses background FinFlow Bot...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kill-bot.ps1"

echo.
echo [OK] Server FinFlow Bot berhasil dihentikan.
echo.
timeout /t 3
