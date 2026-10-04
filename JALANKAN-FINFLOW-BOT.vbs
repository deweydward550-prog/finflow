Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Run FinFlow Node.js bot & tunnel server silently in the background (Window style 0 = hidden)
cmd = "cmd.exe /c cd /d """ & currentDir & """ && node server/bot.js"
WshShell.Run cmd, 0, False

' Display friendly Windows notification popup for 4 seconds
WshShell.Popup "FinFlow WhatsApp Bot & HTTPS Tunnel sedang berjalan di latar belakang (Silent Mode)." & vbCrLf & vbCrLf & "URL Vercel: https://finflow-dewey-bot.loca.lt" & vbCrLf & vbCrLf & "Untuk mengecek status, jalankan 'CEK-STATUS-BOT.bat'.", 4, "FinFlow Bot Aktif (Latar Belakang)", 64
