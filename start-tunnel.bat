@echo off
title FinFlow WhatsApp Bot HTTPS Tunnel
cd /d "%~dp0"
echo ========================================================
echo       FINFLOW BOT HTTPS TUNNEL (UNTUK VERCEL)
echo ========================================================
echo Membuka jalur HTTPS tunnel publik (127.0.0.1:5051)...
echo Pastikan jendela "npm run bot" TETAP AKTIF di sebelah.
echo.
npx -y localtunnel --port 5051 --local-host 127.0.0.1
pause
