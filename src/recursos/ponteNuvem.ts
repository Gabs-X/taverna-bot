import { spawn } from 'node:child_process';
import type { FilaTocando, PedidoMusica } from '../lib/ambientes.ts';
import { executarDoMapa, filasTocando } from './musica.ts';
import { destino, opcoesSsh, rodar } from './vigiaNuvem.ts';

// Roda no PC de casa, junto com os bardos: liga a música ao mapa das campanhas, que fica no Taverneiro na nuvem.
// O mapa é aberto para a internet por um túnel da Cloudflare cujo endereço muda, então os bardos entram pelo mesmo
// SSH da vigia: um túnel local (porta 53136 aqui → porta do mapa lá) e a chave que o Taverneiro grava em
// dados/bardos.chave. Nada de porta aberta em casa. Sem NUVEM_SSH no .env, a ponte fica desligada.

const PORTA_LOCAL = Number(process.env.PONTE_PORTA) || 53136;
const PORTA_MAPA = Number(process.env.NUVEM_MAPA_PORTA) || 53135;
const BASE = `http://127.0.0.1:${PORTA_LOCAL}`;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

let chave: string | undefined;

export function iniciarPonteNuvem() {
  if (!destino) return;
  abrirTunel();
  void ouvirSempre();
}

/** Túnel SSH que fica de pé enquanto os bardos rodam (volta sozinho se cair). */
function abrirTunel() {
  const ssh = spawn(
    'ssh',
    [...opcoesSsh, '-N', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-L', `${PORTA_LOCAL}:127.0.0.1:${PORTA_MAPA}`, destino!],
    { windowsHide: true, stdio: 'ignore' },
  );
  ssh.on('exit', () => setTimeout(abrirTunel, 15_000));
  process.once('exit', () => ssh.kill());
}

async function ouvirSempre() {
  for (;;) {
    try {
      chave ??= (await rodar('ssh', [...opcoesSsh, destino!, 'cat ~/taverna-bot/dados/bardos.chave'])).trim();
      await ouvir(chave);
    } catch (e) {
      if ((e as Error).message === 'chave') chave = undefined;
    }
    await espera(10_000);
  }
}

/** Fica escutando os pedidos do mapa (SSE). Volta quando a conexão cai. */
async function ouvir(k: string) {
  const r = await fetch(`${BASE}/bardos/eventos`, { headers: { 'x-bardos': k } });
  if (r.status === 401) throw new Error('chave');
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
  console.log('🌉 Ponte com o mapa da nuvem ligada.');
  const estado = setInterval(() => void enviar({ estado: filasTocando() }), 10_000);
  void enviar({ estado: filasTocando() });
  const decodificar = new TextDecoder();
  let resto = '';
  try {
    for await (const pedaco of r.body) {
      resto += decodificar.decode(pedaco as Uint8Array, { stream: true });
      for (let i = resto.indexOf('\n\n'); i >= 0; i = resto.indexOf('\n\n')) {
        const bloco = resto.slice(0, i);
        resto = resto.slice(i + 2);
        const dados = bloco.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
        if (dados) void atender(JSON.parse(dados) as PedidoMusica & { id: string });
      }
    }
  } finally {
    clearInterval(estado);
    console.log('🌉 Ponte com o mapa caiu; tentando de novo.');
  }
}

async function atender(pedido: PedidoMusica & { id: string }) {
  let resposta: { ok: boolean; msg: string };
  try {
    resposta = { ok: true, msg: await executarDoMapa(pedido) };
  } catch (e) {
    console.error('[ponte] pedido do mapa:', (e as Error).message);
    resposta = { ok: false, msg: (e as Error).message };
  }
  await enviar({ id: pedido.id, ...resposta, estado: filasTocando() });
}

async function enviar(corpo: { id?: string; ok?: boolean; msg?: string; estado: FilaTocando[] }) {
  if (!chave) return;
  await fetch(`${BASE}/bardos/resposta`, { method: 'POST', headers: { 'x-bardos': chave, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).catch(() => {});
}
