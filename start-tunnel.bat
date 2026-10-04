@echo off
title FinFlow WhatsApp Bot HTTPS Tunnel (Permanen)
cd /d "%~dp0"
echo ========================================================
echo       FINFLOW BOT HTTPS TUNNEL PERMANEN (VERCEL)
echo ========================================================
echo Membuka jalur HTTPS tunnel publik PERMANEN (127.0.0.1:5051)...
echo URL Anda: https://finflow-dewey-bot.loca.lt
echo.
npx -y localtunnel --port 5051 --local-host 127.0.0.1 --subdomain finflow-dewey-bot
pause
