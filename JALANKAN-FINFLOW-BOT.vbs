Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Check if silent mode requested (e.g. from Windows boot auto-start)
isSilent = False
If WScript.Arguments.Count > 0 Then
    For i = 0 To WScript.Arguments.Count - 1
        arg = LCase(WScript.Arguments(i))
        If arg = "/autostart" Or arg = "/silent" Or arg = "-silent" Or arg = "/quiet" Then
            isSilent = True
        End If
    Next
End If

' Run FinFlow Node.js bot silently in the background (Window style 0 = hidden)
cmd = "cmd.exe /c cd /d """ & currentDir & """ && node server/bot.js"
WshShell.Run cmd, 0, False

' Display friendly Windows notification popup only when clicked manually
If Not isSilent Then
    WshShell.Popup "FinFlow WhatsApp Bot aktif di latar belakang (Silent Mode)." & vbCrLf & vbCrLf & "⚡ Cloud Realtime Supabase Aktif & Sinkron Otomatis." & vbCrLf & vbCrLf & "Untuk mengecek status bot, jalankan 'CEK-STATUS-BOT.bat'.", 4, "FinFlow WhatsApp Bot Aktif", 64
End If
