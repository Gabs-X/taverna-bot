import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Client } from 'discord.js';
import { arquivosParaTrazer, backupsVelhos, lerListaRemota } from '../lib/manutencao.ts';

// Roda no PC de casa, junto com os bardos (src/bardos.ts): fica de olho no Taverneiro na nuvem.
// - A cada 10 minutos confere por SSH se o serviço está ativo e mandando sinal. Se cair (ou a Oracle parar a
//   máquina por ociosidade), o primeiro bardo avisa o dono do servidor no privado; avisa de novo quando voltar.
// - Traz para cá o backup diário do banco da nuvem (dados/backups-nuvem, guarda os 14 últimos) e um espelho dos
//   arquivos (mapas, fotos, handouts, registros das sessões, livros e cartas) em dados/backups-nuvem/arquivos, só com o
//   que é novo ou mudou: se a máquina sumir, dá para subir o Taverneiro em outro lugar sem perder nada.
// Configuração no .env: NUVEM_SSH=usuario@ip (sem ela, a vigia fica desligada) e, opcional, NUVEM_CHAVE.

const CONFERIR_A_CADA = 10 * 60_000;
const SINAL_VELHO = 3 * 60_000; // o Taverneiro grava o estado.json a cada 5 s
const PASTA_LOCAL = 'dados/backups-nuvem';
const MANTER = 14;
const PAINEL = 'https://cloud.oracle.com/compute/instances?region=sa-saopaulo-1';

export const destino = process.env.NUVEM_SSH;
const chave = process.env.NUVEM_CHAVE ?? join(homedir(), '.ssh', 'taverna_oracle');
export const opcoesSsh = ['-i', chave, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new'];

export function rodar(programa: string, args: string[]): Promise<string> {
  return new Promise((ok, falha) =>
    execFile(programa, args, { timeout: 60_000, windowsHide: true }, (erro, saida) => (erro ? falha(erro) : ok(String(saida)))),
  );
}

/** Situação do Taverneiro na nuvem: 'ok' ou o motivo do problema. */
async function situacao(): Promise<string> {
  let saida: string;
  try {
    saida = await rodar('ssh', [...opcoesSsh, destino!, 'systemctl is-active taverna; cat ~/taverna-bot/dados/estado.json']);
  } catch {
    return 'não consegui acessar o servidor (máquina parada pela Oracle ou sem internet)';
  }
  const [servico, estado] = saida.trim().split('\n');
  if (servico?.trim() !== 'active') return `o serviço do bot está "${servico?.trim() || 'desconhecido'}"`;
  const em = (() => {
    try {
      return (JSON.parse(estado) as { em?: number }).em;
    } catch {
      return undefined;
    }
  })();
  if (!em || Date.now() - em > SINAL_VELHO) return 'o bot está ligado mas parou de dar sinal (travado?)';
  return 'ok';
}

/** Traz o backup mais novo da nuvem, se ainda não estiver aqui. */
async function trazerBackup() {
  const remotos = (await rodar('ssh', [...opcoesSsh, destino!, 'ls ~/taverna-bot/dados/backups'])).split('\n').map((l) => l.trim()).filter((l) => l.endsWith('.db')).sort();
  const maisNovo = remotos.at(-1);
  if (!maisNovo) return;
  mkdirSync(PASTA_LOCAL, { recursive: true });
  if (existsSync(join(PASTA_LOCAL, maisNovo))) return;
  await rodar('scp', [...opcoesSsh, `${destino}:~/taverna-bot/dados/backups/${maisNovo}`, join(PASTA_LOCAL, maisNovo)]);
  for (const velho of backupsVelhos(readdirSync(PASTA_LOCAL), MANTER)) rmSync(join(PASTA_LOCAL, velho));
  console.log(`💾 Backup da nuvem copiado para ${PASTA_LOCAL}/${maisNovo}.`);
}

const PASTA_ARQUIVOS = `${PASTA_LOCAL}/arquivos`; // barra normal: o tar do Windows e o do Git aceitam
// O banco vivo vai pelo backup diário; segredos, registros do bot e arquivos pela metade ficam de fora.
const FILTRO_ARQUIVOS = "! -path './backups/*' ! -name '*.log' ! -name 'estado.json' ! -name 'supervisor.pid' ! -name 'taverna.db*' ! -name 'bardos.chave' ! -name '*.parcial'";

/** Espelha aqui os arquivos da pasta dados da nuvem, trazendo só o que falta ou mudou (um tar pelo SSH). */
export async function espelharArquivos() {
  const saida = await rodar('ssh', [...opcoesSsh, destino!, `cd ~/taverna-bot/dados && find . -type f ${FILTRO_ARQUIVOS} -printf '%P\\t%s\\t%T@\\n'`]);
  const faltam = arquivosParaTrazer(lerListaRemota(saida), (caminho) => {
    try {
      const st = statSync(join(PASTA_ARQUIVOS, caminho));
      return { tamanho: st.size, em: st.mtimeMs / 1000 };
    } catch {
      return null;
    }
  });
  if (!faltam.length) return;
  mkdirSync(PASTA_ARQUIVOS, { recursive: true });
  await new Promise<void>((ok, falha) => {
    const ssh = spawn('ssh', [...opcoesSsh, destino!, 'cd ~/taverna-bot/dados && tar -cf - -T -'], { windowsHide: true });
    const tar = spawn('tar', ['-xf', '-', '-C', PASTA_ARQUIVOS], { windowsHide: true });
    let erro = '';
    ssh.stderr.on('data', (d) => (erro += d));
    tar.stderr.on('data', (d) => (erro += d));
    ssh.on('error', falha);
    tar.on('error', falha);
    ssh.stdout.pipe(tar.stdin);
    ssh.stdin.end(faltam.join('\n') + '\n');
    tar.on('close', (codigo) => (codigo === 0 ? ok() : falha(new Error(erro.trim() || `tar saiu com ${codigo}`))));
  });
  console.log(`💾 ${faltam.length} arquivo(s) da nuvem copiados para ${PASTA_ARQUIVOS}.`);
}

async function avisarDono(client: Client, texto: string) {
  console.log(`[nuvem] ${texto.replace(/\*\*/g, '')}`);
  const guild = client.guilds.cache.first();
  const dono = guild ? await guild.fetchOwner().catch(() => null) : null;
  await dono?.send(texto).catch(() => {});
}

export function iniciarVigiaNuvem(client: Client) {
  if (!destino) {
    console.log('ℹ️ Vigia da nuvem desligada (falta NUVEM_SSH no .env).');
    return;
  }
  let falhasSeguidas = 0;
  let avisado = false;
  const ciclo = async () => {
    const s = await situacao();
    if (s === 'ok') {
      if (avisado) await avisarDono(client, '✅ O **Taverneiro voltou** ao ar na nuvem.');
      falhasSeguidas = 0;
      avisado = false;
      await trazerBackup().catch((e) => console.error('[nuvem] backup:', (e as Error).message));
      await espelharArquivos().catch((e) => console.error('[nuvem] arquivos:', (e as Error).message));
      return;
    }
    // Duas conferências seguidas com problema (uns 10 a 20 minutos), para não avisar por um soluço da rede.
    if (++falhasSeguidas >= 2 && !avisado) {
      avisado = true;
      await avisarDono(client, `🚨 **O Taverneiro caiu** na nuvem: ${s}.\nSe a Oracle parou a máquina, entre no painel e clique em **Start** na "taverneiro": ${PAINEL}`);
    }
  };
  setTimeout(() => void ciclo().catch((e) => console.error('[nuvem]', e)), 60_000).unref();
  setInterval(() => void ciclo().catch((e) => console.error('[nuvem]', e)), CONFERIR_A_CADA).unref();
}
