import type { Client, Guild } from 'discord.js';
import { BARDOS, CANAIS } from '../config.ts';
import { canalTexto } from '../lib/servidor.ts';

// O Taverneiro (na nuvem) de olho nos bardos (no PC de casa): se todos ficarem offline por mais de 10 minutos
// (PC desligado, internet caiu...), avisa no #logs e no privado do dono; avisa de novo quando voltarem.

const CONFERIR_A_CADA = 2 * 60_000;
const TOLERANCIA = 10 * 60_000; // reinícios rápidos dos bardos não contam

let offlineDesde: number | undefined;
let avisado = false;

const bardosOnline = (guild: Guild) =>
  BARDOS.some((b) => {
    const status = guild.members.cache.get(b.id)?.presence?.status;
    return !!status && status !== 'offline';
  });

async function avisar(guild: Guild, texto: string) {
  console.log(`[bardos] ${texto.replace(/\*\*/g, '')}`);
  await canalTexto(guild, CANAIS.logs)?.send({ content: texto, allowedMentions: { parse: [] } }).catch(() => {});
  const dono = await guild.fetchOwner().catch(() => null);
  await dono?.send(texto).catch(() => {});
}

async function conferir(client: Client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  const agora = Date.now();
  if (bardosOnline(guild)) {
    if (avisado) await avisar(guild, '🎵 Os bardos **voltaram**: a música está de pé de novo.');
    offlineDesde = undefined;
    avisado = false;
    return;
  }
  offlineDesde ??= agora;
  if (!avisado && agora - offlineDesde >= TOLERANCIA) {
    avisado = true;
    await avisar(guild, '🔇 Os bardos (música) estão **offline há mais de 10 minutos**. O PC de casa deve estar desligado ou sem internet. O resto do bot segue normal.');
  }
}

export function iniciarVigiaBardos(client: Client) {
  // Espera um ciclo antes da primeira conferência: as presenças chegam aos poucos depois de ligar.
  setInterval(() => void conferir(client).catch((e) => console.error('[bardos]', e)), CONFERIR_A_CADA).unref();
}
