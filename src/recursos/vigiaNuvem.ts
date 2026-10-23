import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Client } from 'discord.js';
import { backupsVelhos } from '../lib/manutencao.ts';

// Roda no PC de casa, junto com os bardos (src/bardos.ts): fica de olho no Taverneiro na nuvem.
// - A cada 10 minutos confere por SSH se o serviço está ativo e mandando sinal. Se cair (ou a Oracle parar a
//   máquina por ociosidade), o primeiro bardo avisa o dono do servidor no privado; avisa de novo quando voltar.
// - Traz para cá o backup diário do banco da nuvem (dados/backups-nuvem, guarda os 14 últimos): se a máquina
//   sumir, dá para subir o Taverneiro em outro lugar sem perder nada.
// Configuração no .env: NUVEM_SSH=usuario@ip (sem ela, a vigia fica desligada) e, opcional, NUVEM_CHAVE.

const CONFERIR_A_CADA = 10 * 60_000;
const SINAL_VELHO = 3 * 60_000; // o Taverneiro grava o estado.json a cada 5 s
const PASTA_LOCAL = 'dados/backups-nuvem';
const MANTER = 14;
const PAINEL = 'https://cloud.oracle.com/compute/instances?region=sa-saopaulo-1';

const destino = process.env.NUVEM_SSH;
const chave = process.env.NUVEM_CHAVE ?? join(homedir(), '.ssh', 'taverna_oracle');
const opcoesSsh = ['-i', chave, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new'];

function rodar(programa: string, args: string[]): Promise<string> {
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
