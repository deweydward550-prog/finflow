$procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"
foreach ($p in $procs) {
    if ($p.CommandLine -like "*bot.js*") {
        Write-Host "Killing bot process PID $($p.ProcessId): $($p.CommandLine)" -ForegroundColor Yellow
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "All bot.js processes killed." -ForegroundColor Green
