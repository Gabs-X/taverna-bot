import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Client } from 'discord.js';
import { CANAIS } from '../config.ts';
import { db } from '../db.ts';
import { backupsVelhos, ficouFora, nomeBackup } from '../lib/manutencao.ts';
import { canalTexto } from '../lib/servidor.ts';
import { duracaoTexto } from '../lib/tela.ts';

// Aviso de queda e backup diário do banco.

const PASTA_BACKUPS = 'dados/backups';
const MANTER_BACKUPS = 7;

// Último sinal de vida da execução anterior (o index regrava o estado.json a cada 5 s). Lido ao carregar o
// módulo, antes da primeira regravação.
const ultimoSinal = (() => {
  try {
    return (JSON.parse(readFileSync('dados/estado.json', 'utf8')) as { em?: number }).em;
  } catch {
    return undefined;
  }
})();

/** Avisa no #logs e no privado do dono do servidor quanto tempo o bot ficou fora. */
async function avisarQueda(client: Client) {
  const fora = ficouFora(ultimoSinal, Date.now());
  if (!fora) return;
  const de = Math.floor(ultimoSinal! / 1000);
  const texto =
    `⚠️ **Fiquei fora do ar** de <t:${de}:f> até <t:${Math.floor(Date.now() / 1000)}:t> (${duracaoTexto(fora)}).\n` +
    'Costuma ser o PC desligado ou suspenso, ou a internet caindo. Já voltei ao normal.';
  console.log(`⚠️ Fiquei fora do ar por ${duracaoTexto(fora)}.`);
  for (const guild of client.guilds.cache.values()) {
    await canalTexto(guild, CANAIS.logs)?.send({ content: texto, allowedMentions: { parse: [] } }).catch(() => {});
    const dono = await guild.fetchOwner().catch(() => null);
    await dono?.send(texto).catch(() => {});
  }
}

/** Cópia do banco uma vez por dia (VACUUM INTO copia com o bot rodando, sem travar), guardando os 7 últimos. */
function fazerBackup() {
  const nome = nomeBackup(Date.now());
  const destino = join(PASTA_BACKUPS, nome);
  if (existsSync(destino)) return;
  mkdirSync(PASTA_BACKUPS, { recursive: true });
  db.exec(`VACUUM INTO '${destino.replaceAll('\\', '/')}'`);
  for (const velho of backupsVelhos(readdirSync(PASTA_BACKUPS), MANTER_BACKUPS)) rmSync(join(PASTA_BACKUPS, velho));
  console.log(`💾 Backup do banco salvo em ${destino}.`);
}

export function iniciarManutencao(client: Client) {
  avisarQueda(client).catch((e) => console.error('[queda]', e));
  const backup = () => {
    try {
      fazerBackup();
    } catch (e) {
      console.error('[backup]', e);
    }
  };
  backup();
  setInterval(backup, 3_600_000).unref();
}
