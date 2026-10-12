# FinFlow WhatsApp Bot Windows Auto-Start Remover
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$STARTUP_DIR = [Environment]::GetFolderPath('Startup')
$SHORTCUT_PATH = Join-Path $STARTUP_DIR "FinFlowWhatsAppBot.lnk"

if (Test-Path $SHORTCUT_PATH) {
    Remove-Item -Path $SHORTCUT_PATH -Force -ErrorAction SilentlyContinue
    Write-Host "✅ Auto-start FinFlow Bot berhasil dinonaktifkan." -ForegroundColor Yellow
} else {
    Write-Host "ℹ️ Auto-start FinFlow Bot memang belum aktif di Startup Windows." -ForegroundColor Gray
}
