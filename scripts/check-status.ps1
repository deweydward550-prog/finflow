# FinFlow Bot and Supabase Diagnostic Status Checker
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "FinFlow WhatsApp Bot & Supabase Monitor"

$PORT = 5051
$LOCAL_URL = "http://127.0.0.1:$PORT"
$LOG_FILE = "$PSScriptRoot\..\server\data\bot.log"
$AUTH_DIR = "$PSScriptRoot\..\server\auth_info_baileys"
$ROOT_DIR = (Resolve-Path "$PSScriptRoot\..").Path

function Show-Header {
    Clear-Host
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "             FINFLOW WHATSAPP BOT & SUPABASE HUB               " -ForegroundColor Yellow
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Get-ServerStatus {
    try {
        $res = Invoke-RestMethod -Uri "$LOCAL_URL/api/status" -TimeoutSec 3 -ErrorAction Stop
        return $res
    } catch {
        return $null
    }
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
    Write-Host "Memulai FinFlow Bot di latar belakang..." -ForegroundColor Yellow
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
        if (Test-Path $AUTH_DIR) {
            Get-ChildItem -Path $AUTH_DIR -Recurse | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Sesi berhasil direset. Silakan scan QR baru di browser atau terminal." -ForegroundColor Green
    Start-Sleep -Seconds 2
}

function Show-QRCodeTerminal {
    Clear-Host
    Write-Host "Membuka scanner QR di browser default..." -ForegroundColor Yellow
    Start-Process "http://localhost:$PORT/qr"
    Write-Host "Dashboard QR dibuka di browser (http://localhost:$PORT/qr)." -ForegroundColor Green
    Start-Sleep -Seconds 2
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

        # Supabase
        Write-Host "  [v] Supabase Cloud DB    : " -NoNewline
        if ($status.supabaseConfigured) {
            Write-Host "TERHUBUNG & AKTIF" -ForegroundColor Green
        } else {
            Write-Host "BELUM DIKONFIGURASI (Atur di http://localhost:5051)" -ForegroundColor Yellow
        }

        # Web QR Scanner
        Write-Host "  [v] Web Dashboard        : " -NoNewline
        Write-Host "http://localhost:5051/qr" -ForegroundColor Yellow

        Write-Host ""
        Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray
        if ($status.status -eq "connected") {
            Write-Host "Status: BOT WA AKTIF! Chat otomatis tersimpan ke Supabase Cloud." -ForegroundColor Green
        } elseif ($status.status -eq "qr") {
            Write-Host "Status: MENUNGGU SCAN QR! Buka http://localhost:5051/qr di browser Anda." -ForegroundColor Yellow
        } else {
            Write-Host "Status: Menghubungkan ke server WhatsApp..." -ForegroundColor Yellow
        }
        Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "  [1] Refresh Status"
        Write-Host "  [2] Buka Dashboard QR di Browser (http://localhost:5051/qr)" -ForegroundColor Green
        Write-Host "  [3] Lihat Log Real-time (bot.log)"
        Write-Host "  [4] Reset Sesi WhatsApp (Scan Ulang)"
        Write-Host "  [5] Restart Bot & Server"
        Write-Host "  [6] Hentikan Bot (Stop Server)"
        Write-Host "  [7] Buka Web FinFlow di Browser"
        Write-Host "  [8] Keluar"
        Write-Host ""
        $choice = Read-Host "Pilih menu (1-8)"

        if ($choice -eq "1") {
            # continue loop
        } elseif ($choice -eq "2") {
            Show-QRCodeTerminal
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
