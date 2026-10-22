' Abre o supervisor do bot sem janela (usado pelo atalho da inicialização do Windows).
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = pasta
shell.Run "node """ & pasta & "\scripts\supervisor.mjs""", 0, False
