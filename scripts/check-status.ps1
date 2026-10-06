# FinFlow Bot and Server Diagnostic Status Checker
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "FinFlow Bot and Tunnel Status Checker"

$PORT = 5051
$LOCAL_URL = "http://127.0.0.1:$PORT"
$TUNNEL_URL = "https://finflow-dewey-bot.loca.lt"
$LOG_FILE = "$PSScriptRoot\..\server\data\bot.log"
$AUTH_DIR = "$PSScriptRoot\..\server\auth_info_baileys"
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
    & "$PSScriptRoot\kill-bot.ps1"
    Write-Host "FinFlow Bot berhasil dihentikan." -ForegroundColor Green
    Start-Sleep -Seconds 1
}

function Reset-WhatsAppSession {
    Write-Host "Mereset sesi WhatsApp..." -ForegroundColor Yellow
    try {
        Invoke-RestMethod -Uri "$LOCAL_URL/api/auth/reset" -Method Post -TimeoutSec 5 -ErrorAction SilentlyContinue
    } catch {
        # If server not responding, manual wipe
        if (Test-Path $AUTH_DIR) {
            Get-ChildItem -Path $AUTH_DIR -Recurse | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Sesi berhasil direset. Silakan scan QR baru di browser atau terminal." -ForegroundColor Green
    Start-Sleep -Seconds 2
}

function Show-QRCodeTerminal {
    Clear-Host
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "                   SCAN QR CODE WHATSAPP BOT                   " -ForegroundColor Yellow
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
    $status = Get-ServerStatus
    if ($null -eq $status -or $status.status -ne "qr") {
        if ($status.status -eq "connected") {
            Write-Host "WhatsApp sudah TERHUBUNG! ($($status.botNumber))" -ForegroundColor Green
        } else {
            Write-Host "QR Code belum siap atau server offline. Silakan coba sesaat lagi." -ForegroundColor Yellow
        }
        Write-Host "`nTekan tombol apa saja untuk kembali..." -ForegroundColor Gray
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        return
    }

    Write-Host "Membuka halaman scan QR di browser default..." -ForegroundColor Yellow
    Start-Process "http://localhost:$PORT/qr"
    Write-Host "Halaman scanner QR telah dibuka di browser (http://localhost:$PORT/qr)." -ForegroundColor Green
    Write-Host "`nTekan tombol apa saja untuk kembali ke menu..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Show-Logs {
    Clear-Host
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "                   LOG REAL-TIME FINFLOW BOT                   " -ForegroundColor Yellow
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "Tekan Ctrl+C untuk kembali ke menu.`n" -ForegroundColor Gray
    if (Test-Path $LOG_FILE) {
        Get-Content -Path $LOG_FILE -Tail 50 -Wait -Encoding utf8
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
            Write-Host "MENUNGGU SCAN QR " -ForegroundColor Yellow -NoNewline
            Write-Host "(Pilih menu [2] untuk scan di Browser)" -ForegroundColor Cyan
        } else {
            Write-Host "$($status.status.ToUpper())" -ForegroundColor Yellow
        }

        # Wi-Fi LAN
        $localIp = if ($status.localIp) { $status.localIp } else { "192.168.0.2" }
        Write-Host "  [v] Wi-Fi LAN (HP Lokal) : " -NoNewline
        Write-Host "http://$localIp:5051" -ForegroundColor Cyan -NoNewline
        Write-Host " (0ms Latensi / Sangat Cepat)" -ForegroundColor DarkGray

        # Web QR Scanner
        Write-Host "  [v] Web QR Scanner       : " -NoNewline
        Write-Host "http://localhost:5051/qr" -ForegroundColor Yellow

        # Tunnel
        $tunnelActive = Test-TunnelStatus
        Write-Host "  [v] HTTPS Tunnel (Online): " -NoNewline
        if ($tunnelActive) {
            Write-Host "AKTIF " -ForegroundColor Green -NoNewline
            Write-Host "($TUNNEL_URL)" -ForegroundColor Cyan
        } elseif ($status.tunnelStatus -eq "active") {
            Write-Host "AKTIF SERVER " -ForegroundColor Green -NoNewline
            Write-Host "($TUNNEL_URL)" -ForegroundColor DarkGray
        } else {
            Write-Host "STANDBY " -ForegroundColor Yellow -NoNewline
            Write-Host "(Telegram Cloud & Wi-Fi LAN Aktif)" -ForegroundColor DarkGray
        }

        # Telegram
        Write-Host "  [v] Cloud DB (Telegram)  : " -NoNewline
        if ($status.telegramConfigured) {
            Write-Host "TERHUBUNG & AKTIF" -ForegroundColor Green
        } else {
            Write-Host "BELUM DIKONFIGURASI" -ForegroundColor DarkGray
        }

        # Primary Account
        Write-Host "  [v] Rekening Utama       : " -NoNewline
        Write-Host "$($status.primaryAccount)" -ForegroundColor Yellow

        # Pending Queue
        if ($status.pendingCount -gt 0) {
            Write-Host "  [i] Antrean Transaksi    : $($status.pendingCount) transaksi siap diimpor" -ForegroundColor Yellow
        }

        Write-Host ""
        Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray
        if ($status.status -eq "connected") {
            Write-Host "Status: BOT WHATSAPP AKTIF! Chat transaksi otomatis masuk ke Telegram." -ForegroundColor Green
        } elseif ($status.status -eq "qr") {
            Write-Host "Status: MENUNGGU SCAN QR! Buka http://localhost:5051/qr di browser Anda." -ForegroundColor Yellow
        } else {
            Write-Host "Status: Menghubungkan ke server WhatsApp..." -ForegroundColor Yellow
        }
        Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "  [1] Refresh Status"
        Write-Host "  [2] Buka Scanner QR di Browser (http://localhost:5051/qr)" -ForegroundColor Green
        Write-Host "  [3] Lihat Log Real-time (bot.log)"
        Write-Host "  [4] Reset Sesi WhatsApp (Hapus Cache & Scan Ulang)"
        Write-Host "  [5] Restart Bot & Server"
        Write-Host "  [6] Hentikan Bot (Stop Server)"
        Write-Host "  [7] Buka Web FinFlow di Browser"
        Write-Host "  [8] Keluar"
        Write-Host ""
        $choice = Read-Host "Pilih menu (1-8)"

        if ($choice -eq "2") {
            Start-Process "http://localhost:$PORT/qr"
        } elseif ($choice -eq "3") {
            Show-Logs
        } elseif ($choice -eq "4") {
            Reset-WhatsAppSession
        } elseif ($choice -eq "5") {
            Stop-FinFlow
            Start-FinFlowSilent
        } elseif ($choice -eq "6") {
            Stop-FinFlow
        } elseif ($choice -eq "7") {
            Start-Process "https://finflow-sigma-three.vercel.app"
        } elseif ($choice -eq "8") {
            break
        }
    }
}
