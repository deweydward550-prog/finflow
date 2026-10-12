# FinFlow WhatsApp Bot Windows Auto-Start Installer
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ROOT_DIR = (Resolve-Path "$PSScriptRoot\..").Path
$STARTUP_DIR = [Environment]::GetFolderPath('Startup')
$SHORTCUT_PATH = Join-Path $STARTUP_DIR "FinFlowWhatsAppBot.lnk"
$VBS_PATH = Join-Path $ROOT_DIR "JALANKAN-FINFLOW-BOT.vbs"

try {
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut($SHORTCUT_PATH)
    $Shortcut.TargetPath = "$env:SystemRoot\System32\wscript.exe"
    $Shortcut.Arguments = "`"$VBS_PATH`" /autostart"
    $Shortcut.WorkingDirectory = $ROOT_DIR
    $Shortcut.Description = "FinFlow WhatsApp Bot Background Auto-Start"
    $Shortcut.Save()

    Write-Host "✅ Auto-start berhasil dipasang di folder Startup Windows!" -ForegroundColor Green
    Write-Host "Lokasi shortcut: $SHORTCUT_PATH" -ForegroundColor Cyan
    Write-Host "Bot akan otomatis berjalan di latar belakang setiap komputer dinyalakan/restart." -ForegroundColor Yellow
    return $true
} catch {
    Write-Host "❌ Gagal memasang shortcut auto-start: $($_.Exception.Message)" -ForegroundColor Red
    return $false
}
