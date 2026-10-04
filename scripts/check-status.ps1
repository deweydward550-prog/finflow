# FinFlow Bot and Server Diagnostic Status Checker
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "FinFlow Bot and Tunnel Status Checker"

$PORT = 5051
$LOCAL_URL = "http://127.0.0.1:$PORT"
$TUNNEL_URL = "https://finflow-dewey-bot.loca.lt"
$LOG_FILE = "$PSScriptRoot\..\server\data\bot.log"
$ROOT_DIR = (Resolve-Path "$PSScriptRoot\..").Path

function Show-Header {
    Clear-Host
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "             FINFLOW WHATSAPP BOT & SERVER MONITOR             " -ForegroundColor Yellow
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Get-ServerStatus {
    try {
        $headers = @{ "Bypass-Tunnel-Reminder" = "true" }
        $res = Invoke-RestMethod -Uri "$LOCAL_URL/api/status" -TimeoutSec 3 -Headers $headers -ErrorAction Stop
        return $res
    } catch {
        return $null
    }
}

function Test-TunnelStatus {
    try {
        $headers = @{ "Bypass-Tunnel-Reminder" = "true" }
        $res = Invoke-RestMethod -Uri "$TUNNEL_URL/api/status" -TimeoutSec 4 -Headers $headers -ErrorAction Stop
        if ($res.ok) { return $true }
    } catch {}
    return $false
}

function Format-Uptime([int]$seconds) {
    if ($seconds -lt 60) { return "$seconds detik" }
    $mins = [Math]::Floor($seconds / 60)
    $secs = $seconds % 60
    if ($mins -lt 60) { return "$mins menit $secs detik" }
    $hours = [Math]::Floor($mins / 60)
    $remainMins = $mins % 60
    return "$hours jam $remainMins menit"
}

function Start-FinFlowSilent {
    Write-Host "Memulai FinFlow Bot dan Tunnel di latar belakang..." -ForegroundColor Yellow
    $vbsPath = "$ROOT_DIR\JALANKAN-FINFLOW-BOT.vbs"
    if (Test-Path $vbsPath) {
        Start-Process "wscript.exe" -ArgumentList "`"$vbsPath`""
    } else {
        Start-Process "node" -ArgumentList "server/bot.js" -WorkingDirectory $ROOT_DIR -WindowStyle Hidden
    }
    Start-Sleep -Seconds 3
}

function Stop-FinFlow {
    Write-Host "Menghentikan FinFlow Bot..." -ForegroundColor Yellow
    try {
        $conns = Get-NetTCPConnection -LocalPort 5051 -ErrorAction SilentlyContinue
        if ($conns) {
            foreach ($c in $conns) {
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
    
    try {
        $lines = netstat -ano | Select-String ":5051"
        foreach ($line in $lines) {
            $parts = $line.ToString().Trim() -split '\s+'
            $pId = $parts[-1]
            if ($pId -match '^\d+$') {
                Stop-Process -Id [int]$pId -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}

    Write-Host "FinFlow Bot berhasil dihentikan." -ForegroundColor Green
    Start-Sleep -Seconds 1
}

function Show-Logs {
    Clear-Host
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "                   LOG REAL-TIME FINFLOW BOT                   " -ForegroundColor Yellow
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "Tekan Ctrl+C untuk kembali ke menu.`n" -ForegroundColor Gray
    if (Test-Path $LOG_FILE) {
        Get-Content -Path $LOG_FILE -Tail 30 -Wait
    } else {
        Write-Host "Belum ada file log ($LOG_FILE)." -ForegroundColor Red
        Start-Sleep -Seconds 2
    }
}

while ($true) {
    Show-Header
    $status = Get-ServerStatus

    if ($null -eq $status) {
        Write-Host "  [x] Server Bot Lokal     : " -NoNewline
        Write-Host "TIDAK AKTIF (OFFLINE)" -ForegroundColor Red
        Write-Host "  [x] WhatsApp Bot         : " -NoNewline
        Write-Host "OFFLINE" -ForegroundColor Red
        Write-Host "  [x] HTTPS Tunnel (Vercel): " -NoNewline
        Write-Host "OFFLINE" -ForegroundColor Red
        Write-Host ""
        Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray
        Write-Host "Status: Server belum berjalan." -ForegroundColor Yellow
        Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "  [1] Jalankan Bot Sekarang (Silent di Latar Belakang)" -ForegroundColor Green
        Write-Host "  [2] Lihat Log Terakhir"
        Write-Host "  [3] Keluar"
        Write-Host ""
        $choice = Read-Host "Pilih menu (1-3)"

        if ($choice -eq "1") {
            Start-FinFlowSilent
        } elseif ($choice -eq "2") {
            Show-Logs
        } elseif ($choice -eq "3") {
            break
        }
    } else {
        $uptimeStr = Format-Uptime ([int]$status.uptime)
        Write-Host "  [v] Server Bot Lokal     : " -NoNewline
        Write-Host "AKTIF " -ForegroundColor Green -NoNewline
        Write-Host "(Port 5051 | PID: $($status.pid) | Uptime: $uptimeStr)" -ForegroundColor Gray

        # WhatsApp
        Write-Host "  [v] WhatsApp Bot         : " -NoNewline
        if ($status.status -eq "connected") {
            Write-Host "TERHUBUNG " -ForegroundColor Green -NoNewline
            Write-Host "($($status.botNumber))" -ForegroundColor Cyan
        } elseif ($status.status -eq "qr") {
            Write-Host "MENUNGGU SCAN QR (Buka log untuk scan)" -ForegroundColor Yellow
        } else {
            Write-Host "$($status.status.ToUpper())" -ForegroundColor Yellow
        }

        # Tunnel
        $tunnelActive = Test-TunnelStatus
        Write-Host "  [v] HTTPS Tunnel (Vercel): " -NoNewline
        if ($tunnelActive) {
            Write-Host "AKTIF PERMANEN " -ForegroundColor Green -NoNewline
            Write-Host "($TUNNEL_URL)" -ForegroundColor Cyan
        } else {
            Write-Host "MENGHUBUNGKAN ($TUNNEL_URL)" -ForegroundColor Yellow
        }

        # Telegram
        Write-Host "  [v] Cloud DB (Telegram)  : " -NoNewline
        if ($status.telegramConfigured) {
            Write-Host "TERHUBUNG & AKTIF" -ForegroundColor Green
        } else {
            Write-Host "BELUM DIKONFIGURASI (Opsional)" -ForegroundColor DarkGray
        }

        # Primary Account
        Write-Host "  [v] Rekening Utama Default: " -NoNewline
        Write-Host "$($status.primaryAccount)" -ForegroundColor Yellow

        # Pending Queue
        if ($status.pendingCount -gt 0) {
            Write-Host "  [i] Antrean Transaksi    : $($status.pendingCount) transaksi siap diimpor" -ForegroundColor Yellow
        }

        Write-Host ""
        Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray
        if ($status.status -eq "connected" -and $tunnelActive) {
            Write-Host "Status: SEMUA SISTEM BERJALAN NORMAL DI LATAR BELAKANG!" -ForegroundColor Green
        } else {
            Write-Host "Status: Server aktif, sedang menghubungkan layanan..." -ForegroundColor Yellow
        }
        Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "  [1] Refresh Status"
        Write-Host "  [2] Lihat Log Real-time (bot.log)"
        Write-Host "  [3] Restart Bot & Tunnel"
        Write-Host "  [4] Hentikan Bot (Stop Server)"
        Write-Host "  [5] Buka Web FinFlow di Browser"
        Write-Host "  [6] Keluar"
        Write-Host ""
        $choice = Read-Host "Pilih menu (1-6)"

        if ($choice -eq "2") {
            Show-Logs
        } elseif ($choice -eq "3") {
            Stop-FinFlow
            Start-FinFlowSilent
        } elseif ($choice -eq "4") {
            Stop-FinFlow
        } elseif ($choice -eq "5") {
            Start-Process "https://finflow-sigma-three.vercel.app"
        } elseif ($choice -eq "6") {
            break
        }
    }
}
