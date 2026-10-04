@echo off
title Hentikan FinFlow Bot Server
cd /d "%~dp0"
echo ========================================================
echo             MENGHENTIKAN FINFLOW BOT SERVER
echo ========================================================
echo Mematikan proses background FinFlow pada port 5051...
echo.

powershell.exe -NoProfile -Command "try { $conns = Get-NetTCPConnection -LocalPort 5051 -ErrorAction SilentlyContinue; if ($conns) { foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } } } catch {}; $lines = netstat -ano | Select-String ':5051'; foreach ($line in $lines) { $parts = $line.ToString().Trim() -split '\s+'; $pId = $parts[-1]; if ($pId -match '^\d+$') { Stop-Process -Id [int]$pId -Force -ErrorAction SilentlyContinue } }"

echo.
echo [OK] Server FinFlow Bot berhasil dihentikan.
echo.
timeout /t 3
