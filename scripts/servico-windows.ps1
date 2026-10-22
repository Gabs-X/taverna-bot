# Controla o bot como "serviço" do Windows (sem precisar de administrador).
# Uso: npm run servico:<acao>   ou   powershell -File scripts/servico-windows.ps1 <acao>
#   instalar   cria o atalho na Inicialização do Windows e liga o bot agora
#   remover    para o bot e tira o atalho da Inicialização
#   iniciar    liga o bot em segundo plano
#   parar      desliga o bot
#   reiniciar  desliga e liga de novo
#   status     mostra se está rodando e as últimas linhas do log
#   log        acompanha o log ao vivo (Ctrl+C para sair)
param([Parameter(Mandatory = $true)][ValidateSet('instalar', 'remover', 'iniciar', 'parar', 'reiniciar', 'status', 'log')][string]$Acao)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Raiz = Split-Path -Parent $PSScriptRoot
$Vbs = Join-Path $PSScriptRoot 'iniciar-oculto.vbs'
$Trava = Join-Path $Raiz 'dados\supervisor.pid'
$Log = Join-Path $Raiz 'dados\bot.log'
$Atalho = Join-Path ([Environment]::GetFolderPath('Startup')) 'Taverna Bot.lnk'

function PidDoSupervisor {
  if (-not (Test-Path $Trava)) { return $null }
  $id = [int](Get-Content $Trava -Raw)
  if (Get-Process -Id $id -ErrorAction SilentlyContinue) { return $id }
  return $null
}

function Iniciar {
  $id = PidDoSupervisor
  if ($id) { Write-Host "O bot já está rodando (supervisor PID $id)."; return }
  Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$Vbs`"" -WorkingDirectory $Raiz
  Start-Sleep -Seconds 3
  $id = PidDoSupervisor
  if ($id) { Write-Host "✅ Bot ligado em segundo plano (supervisor PID $id). Log: dados\bot.log" }
  else { Write-Host '⚠️ Não consegui confirmar que ligou. Veja: npm run servico:status' }
}

function Parar {
  $id = PidDoSupervisor
  if (-not $id) { Write-Host 'O bot não está rodando.'; return }
  # /T derruba o supervisor e o bot (processo filho) juntos.
  taskkill /PID $id /T /F | Out-Null
  Remove-Item $Trava -ErrorAction SilentlyContinue
  Add-Content -Path $Log -Value "[$(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')] ⏹️ Bot desligado pelo servico:parar." -Encoding utf8
  Write-Host '⏹️ Bot desligado.'
}

switch ($Acao) {
  'instalar' {
    $shell = New-Object -ComObject WScript.Shell
    $lnk = $shell.CreateShortcut($Atalho)
    $lnk.TargetPath = 'wscript.exe'
    $lnk.Arguments = "`"$Vbs`""
    $lnk.WorkingDirectory = $Raiz
    $lnk.Description = 'Liga o Taverna Bot em segundo plano'
    $lnk.Save()
    Write-Host "✅ O bot vai ligar sozinho quando você entrar no Windows (atalho em $Atalho)."
    Iniciar
  }
  'remover' {
    Parar
    if (Test-Path $Atalho) { Remove-Item $Atalho; Write-Host '🗑️ Tirei o bot da Inicialização do Windows.' }
    else { Write-Host 'O bot não estava na Inicialização do Windows.' }
  }
  'iniciar' { Iniciar }
  'parar' { Parar }
  'reiniciar' { Parar; Start-Sleep -Seconds 1; Iniciar }
  'status' {
    $id = PidDoSupervisor
    if ($id) {
      $filhos = Get-CimInstance Win32_Process -Filter "ParentProcessId = $id" | Where-Object Name -eq 'node.exe'
      $bot = if ($filhos) { "bot PID $($filhos[0].ProcessId)" } else { 'bot reiniciando' }
      Write-Host "🟢 Rodando: supervisor PID $id, $bot."
    } else { Write-Host '🔴 Parado.' }
    Write-Host "Inicia com o Windows: $(if (Test-Path $Atalho) { 'sim' } else { 'não' })"
    if (Test-Path $Log) { Write-Host "`n--- últimas linhas de dados\bot.log ---"; Get-Content $Log -Tail 15 -Encoding utf8 }
  }
  'log' {
    if (-not (Test-Path $Log)) { Write-Host 'Ainda não tem log.'; return }
    Get-Content $Log -Tail 30 -Wait -Encoding utf8
  }
}
