// Tempo real do mapa: quem está com a página aberta, os avisos de mudança, os efeitos ao vivo (pings, desenhos,
// movimento de peças, sons) e o cache do estado. Separado do mapa.ts para o servidor HTTP ficar só com as rotas.
//
// Como uma mudança chega às outras telas:
// - Movimento de peça visível: evento pequeno "mov" (a peça anda na hora, ninguém baixa o estado).
// - Outras mudanças: aviso "estado" → cada tela baixa o estado (do cache: montado uma vez por mudança e por pessoa).
// - Efeitos: vão pelo SSE e ficam 15 s guardados com um número (seq) para quem só tem o pulso (túnel que segura o SSE).
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type Ouvinte = { res: ServerResponse; userId: string };
const ouvintes = new Map<number, Set<Ouvinte>>();

/** O número de cada mudança (estado e chat): a página pergunta só "mudou?" e baixa o resto quando muda. */
export const BOOT = randomBytes(4).toString('hex');
const versoes = new Map<number, { estado: number; chat: number }>();
/** Versão interna do cache (muda também no movimento de peça, que não avisa as telas para baixar tudo). */
const versaoCache = new Map<number, number>();
const cache = new Map<number, { versao: number; porPessoa: Map<string, { json: string; gzip?: Buffer }> }>();

/** Abre o canal de tempo real (SSE) de uma pessoa; devolve como fechar. */
export function registrarOuvinte(campanhaId: number, req: IncomingMessage, res: ServerResponse, userId: string) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 2000\n\n');
  const set = ouvintes.get(campanhaId) ?? ouvintes.set(campanhaId, new Set()).get(campanhaId)!;
  const eu: Ouvinte = { res, userId };
  set.add(eu);
  const bate = setInterval(() => res.write(': ok\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(bate);
    set.delete(eu);
  });
}

export const campanhasAbertas = () => [...ouvintes.keys()];
export const quantosOuvindo = (campanhaId: number) => ouvintes.get(campanhaId)?.size ?? 0;

/** Mudou o estado (ou o chat): invalida o cache e avisa as telas. `soPara` restringe a uma pessoa (o mestre). */
export function avisar(campanhaId: number, oQue: 'estado' | 'chat', soPara?: string) {
  const v = versoes.get(campanhaId) ?? { estado: 0, chat: 0 };
  v[oQue]++;
  versoes.set(campanhaId, v);
  if (oQue === 'estado') invalidar(campanhaId);
  for (const o of ouvintes.get(campanhaId) ?? []) if (!soPara || o.userId === soPara) o.res.write(`data: ${oQue}\n\n`);
}

/** O estado mudou, mas as telas já sabem por outro caminho (ex.: o evento "mov"): só o cache precisa refazer. */
export const invalidar = (campanhaId: number) => versaoCache.set(campanhaId, (versaoCache.get(campanhaId) ?? 0) + 1);

// ---------- Efeitos ao vivo ----------

const recentes = new Map<number, { seq: number; tipo: string; dados: string; em: number }[]>();
let seqEfeito = 0;
const GUARDA_MS = 15_000;

/** Manda um efeito para todas as telas e guarda por 15 s (para o pulso de quem não recebe o SSE). */
export function transmitir(campanhaId: number, tipo: 'ping' | 'efeito', json: string) {
  const seq = ++seqEfeito, dados = json.replace(/^\{/, `{"seq":${seq},`), agora = Date.now();
  const lista = (recentes.get(campanhaId) ?? []).filter((e) => agora - e.em < GUARDA_MS).slice(-200);
  lista.push({ seq, tipo, dados, em: agora });
  recentes.set(campanhaId, lista);
  for (const o of ouvintes.get(campanhaId) ?? []) o.res.write(`data: ${tipo}:${dados}\n\n`);
}

export const efeitosDesde = (campanhaId: number, desde: number) =>
  (recentes.get(campanhaId) ?? []).filter((e) => e.seq > desde && Date.now() - e.em < GUARDA_MS).map((e) => ({ tipo: e.tipo, dados: e.dados }));

/** Pulso: resposta pequena com o número das mudanças e os efeitos novos. */
export function pulso(campanhaId: number, desde: number) {
  const v = versoes.get(campanhaId) ?? { estado: 0, chat: 0 };
  return { boot: BOOT, estado: v.estado, chat: v.chat, seq: seqEfeito, lista: efeitosDesde(campanhaId, desde) };
}
export const ultimoSeq = () => seqEfeito;

// ---------- Cache do estado (montado uma vez por mudança e por pessoa) ----------

/** Estado da pessoa em JSON: do cache se nada mudou desde a última montagem. */
export async function estadoEmCache(campanhaId: number, userId: string, montar: () => Promise<unknown>) {
  const versao = versaoCache.get(campanhaId) ?? 0;
  let doMapa = cache.get(campanhaId);
  if (!doMapa || doMapa.versao !== versao) { doMapa = { versao, porPessoa: new Map() }; cache.set(campanhaId, doMapa); }
  const pronto = doMapa.porPessoa.get(userId);
  if (pronto) return pronto;
  const novo = { json: JSON.stringify(await montar()) };
  // Só guarda se ninguém mudou nada enquanto montava (senão a próxima leitura monta de novo).
  if ((versaoCache.get(campanhaId) ?? 0) === versao) doMapa.porPessoa.set(userId, novo);
  return novo;
}

/** Responde JSON já pronto, compactado (gzip) quando o navegador aceita e vale a pena. */
export function responderJson(req: IncomingMessage, res: ServerResponse, item: { json: string; gzip?: Buffer }) {
  const aceita = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  if (aceita && item.json.length > 1500) {
    item.gzip ??= gzipSync(item.json, { level: 4 });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    return void res.end(item.gzip);
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(item.json);
}

/** Campanha apagada: fecha as telas e esquece tudo dela. */
export function encerrarCampanha(campanhaId: number) {
  for (const o of ouvintes.get(campanhaId) ?? []) o.res.end();
  ouvintes.delete(campanhaId);
  recentes.delete(campanhaId);
  cache.delete(campanhaId);
  versoes.delete(campanhaId);
  versaoCache.delete(campanhaId);
}
