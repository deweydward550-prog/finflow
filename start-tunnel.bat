@echo off
title FinFlow WhatsApp Bot HTTPS Tunnel
cd /d "%~dp0"
echo ========================================================
echo       FINFLOW BOT HTTPS TUNNEL (UNTUK VERCEL)
echo ========================================================
echo Membuat URL HTTPS publik untuk menghubungkan bot ke Vercel...
echo.
npm run tunnel
pause
