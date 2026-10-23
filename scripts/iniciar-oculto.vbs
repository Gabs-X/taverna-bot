' Abre o supervisor dos bardos (música) sem janela, usado pelo atalho da inicialização do Windows.
' O Taverneiro roda na nuvem; no PC de casa ficam só os bardos (o YouTube bloqueia os IPs de nuvem).
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = pasta
shell.Run "node """ & pasta & "\scripts\supervisor.mjs"" --entrada src\bardos.ts", 0, False
