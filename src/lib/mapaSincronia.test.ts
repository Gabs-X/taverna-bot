// Sincronia do mapa com várias pessoas conectadas ao mesmo tempo (servidor de verdade, numa porta própria):
// o que um faz tem de chegar aos outros na hora, pelo caminho certo, sem vazar o que o mestre esconde.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import type { Client } from 'discord.js';

const anterior = process.cwd();
process.chdir(mkdtempSync(join(tmpdir(), 'taverna-sincronia-')));
process.env.MAPA_PORTA = String(54100 + Math.floor(Math.random() * 800));
const { db } = await import('../db.ts');
const { iniciarMapa } = await import('../recursos/mapa.ts');
const { criarSessao } = await import('./mapa.ts');

const SEGREDO = 'segredo-sincronia';
db.prepare("INSERT INTO bot_estado (chave, valor) VALUES ('mapa_segredo', ?)").run(SEGREDO);
const falso = { guilds: { cache: new Map() }, channels: { fetch: async () => null }, users: { fetch: async () => { throw new Error('offline'); } }, user: { id: 'bot' } } as unknown as Client;
const log = console.log;
console.log = () => {};
const servidor = iniciarMapa(falso);
await new Promise((r) => servidor.once('listening', r));
console.log = log;
const abertos: AbortController[] = [];
after(() => { for (const a of abertos) a.abort(); servidor.closeAllConnections(); servidor.close(); db.close(); process.chdir(anterior); });

const base = `http://127.0.0.1:${process.env.MAPA_PORTA}`;
const M = '100000000000000001', A = '200000000000000002', B = '300000000000000003', C = '400000000000000004';
const campanha = Number(db.prepare(`INSERT INTO campanhas (guild_id, nome, sistema, mestre_id, criada_em) VALUES ('g', 'Mesa', 'dh', '${M}', 0)`).run().lastInsertRowid);
for (const u of [A, B, C]) db.prepare('INSERT INTO campanha_personagens (campanha_id, user_id) VALUES (?, ?)').run(campanha, u);

const cookie = (u: string) => ({ cookie: `mapa_sessao=${criarSessao(SEGREDO, u)}` });
async function chamar(quem: string, acao: string, corpo?: unknown) {
  const r = await fetch(`${base}/api/m/${campanha}/${acao}`, {
    method: corpo === undefined ? 'GET' : 'POST', headers: { ...cookie(quem), 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, corpo: (await r.json()) as any };
}
const estado = async (u: string) => (await chamar(u, 'estado')).corpo;

/** Uma tela aberta: guarda tudo o que chega pelo tempo real (SSE). */
async function tela(u: string) {
  const ctl = new AbortController(); abertos.push(ctl);
  const r = await fetch(`${base}/api/m/${campanha}/eventos`, { headers: cookie(u), signal: ctl.signal });
  const leitor = r.body!.getReader(), dec = new TextDecoder();
  const linhas: string[] = [];
  let resto = '';
  (async () => {
    try {
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) return;
        resto += dec.decode(value);
        const partes = resto.split('\n\n'); resto = partes.pop()!;
        for (const p of partes) if (p.startsWith('data: ')) linhas.push(p.slice(6));
      }
    } catch { /* fechou */ }
  })();
  return {
    linhas,
    /** Espera chegar uma linha que passe no teste (até 1,5 s). */
    async esperar(teste: (l: string) => boolean, ms = 1500) {
      const ini = Date.now();
      while (Date.now() - ini < ms) { const l = linhas.find(teste); if (l) return l; await new Promise((r) => setTimeout(r, 5)); }
      return null;
    },
    limpar() { linhas.length = 0; },
  };
}
const mov = (l: string) => l.startsWith('efeito:') && l.includes('"tipo":"mov"');

// As peças dos jogadores nascem quando o estado é montado pela primeira vez.
await estado(M);

test('movimento de um jogador chega a todas as outras telas em poucos milissegundos, sem baixar o estado', async () => {
  const telas = await Promise.all([tela(M), tela(B), tela(C)]);
  await new Promise((r) => setTimeout(r, 50));
  const peca = (await estado(A)).pecas.find((p: { userId: string }) => p.userId === A);
  const ini = Date.now();
  assert.equal((await chamar(A, 'mover', { peca: peca.id, x: 333, y: 444 })).status, 200);
  for (const t of telas) {
    const l = await t.esperar(mov);
    assert.ok(l, 'o movimento não chegou');
    const d = JSON.parse(l!.slice(7));
    assert.deepEqual([d.peca, d.x, d.y, d.quem], [peca.id, 333, 444, A]);
    assert.ok(!t.linhas.includes('estado'), 'movimento simples não deve mandar baixar o estado');
  }
  assert.ok(Date.now() - ini < 500, `demorou ${Date.now() - ini} ms`);
  // O estado (do cache) já mostra a posição nova para quem baixar depois.
  assert.deepEqual(((await estado(B)).pecas.find((p: { id: number }) => p.id === peca.id) as { x: number; y: number }), { ...((await estado(B)).pecas.find((p: { id: number }) => p.id === peca.id)), x: 333, y: 444 });
});

test('vários jogadores mexendo ao mesmo tempo: todos os movimentos chegam, cada um com o seu número', async () => {
  const mestre = await tela(M);
  await new Promise((r) => setTimeout(r, 50));
  const pecas = (await estado(M)).pecas.filter((p: { userId: string | null }) => p.userId) as { id: number; userId: string }[];
  const rodadas = 5;
  await Promise.all(pecas.flatMap((p, k) => Array.from({ length: rodadas }, (_, i) => chamar(p.userId, 'mover', { peca: p.id, x: 100 + i * 10, y: 100 + k * 50 }))));
  const ini = Date.now();
  while (mestre.linhas.filter(mov).length < pecas.length * rodadas && Date.now() - ini < 2000) await new Promise((r) => setTimeout(r, 10));
  const seqs = mestre.linhas.filter(mov).map((l) => JSON.parse(l.slice(7)).seq as number);
  assert.equal(seqs.length, pecas.length * rodadas);
  assert.equal(new Set(seqs).size, seqs.length, 'números repetidos');
  assert.deepEqual([...seqs].sort((a, b) => a - b), seqs, 'chegaram fora de ordem');
});

test('peça escondida do mestre: o movimento vai pelo estado, e o jogador nem recebe a posição', async () => {
  const cr = (await chamar(M, 'criatura', { tipo: 'inimigo', nome: 'Espião', pv_max: 3 })).corpo;
  const npc = (await chamar(M, 'criatura/colocar', { id: cr.id, x: 50, y: 50 })).corpo;
  assert.equal((await chamar(M, 'peca/esconder', { peca: npc.peca, escondida: true })).status, 200);
  const jogador = await tela(A);
  await new Promise((r) => setTimeout(r, 50));
  jogador.limpar();
  await chamar(M, 'mover', { peca: npc.peca, x: 600, y: 600 });
  assert.ok(await jogador.esperar((l) => l === 'estado'), 'o aviso de estado não chegou');
  assert.ok(!jogador.linhas.some(mov), 'a posição da peça escondida vazou num evento');
  assert.ok(!(await estado(A)).pecas.some((p: { id: number }) => p.id === npc.peca));
});

test('quem só tem o pulso (sem SSE) recebe os movimentos e sabe quando baixar o estado', async () => {
  const antes = (await chamar(B, 'pulso/0')).corpo;
  const peca = (await estado(C)).pecas.find((p: { userId: string }) => p.userId === C);
  await chamar(C, 'mover', { peca: peca.id, x: 222, y: 111 });
  const depois = (await chamar(B, `pulso/${antes.seq}`)).corpo;
  const m = depois.lista.map((e: { dados: string }) => JSON.parse(e.dados)).find((d: { tipo: string }) => d.tipo === 'mov');
  assert.deepEqual([m.peca, m.x, m.y], [peca.id, 222, 111]);
  assert.equal(depois.estado, antes.estado, 'movimento simples não muda o número do estado');
  await chamar(M, 'grupo/ouro', { delta: 5 });
  assert.ok((await chamar(B, `pulso/${depois.seq}`)).corpo.estado > antes.estado, 'mudança de verdade muda o número');
});

test('ficha mudada pelo Discord (fora do mapa) chega às telas abertas', async () => {
  db.prepare("INSERT INTO fichas_dh (guild_id, user_id, nome, classe, nivel, agilidade, forca, acuidade, instinto, presenca, conhecimento, evasao, pv_max, armadura_max, limiar_maior, limiar_grave) VALUES ('g', ?, 'Lyra', 'Bardo', 1, 0, 0, 0, 0, 0, 0, 10, 6, 3, 6, 12)").run(A);
  const t = await tela(M);
  await new Promise((r) => setTimeout(r, 4300)); // primeira conferência guarda a assinatura
  t.limpar();
  db.prepare("UPDATE fichas_dh SET pv = 3 WHERE guild_id = 'g' AND user_id = ?").run(A); // como o /dh pv faria
  assert.ok(await t.esperar((l) => l === 'estado', 5000), 'a tela não foi avisada');
  assert.equal((await estado(M)).pecas.find((p: { userId: string }) => p.userId === A).ficha.pv, 3);
});

test('estado vem compactado (gzip) quando o navegador aceita', async () => {
  const r = await fetch(`${base}/api/m/${campanha}/estado`, { headers: { ...cookie(M), 'Accept-Encoding': 'gzip' } });
  assert.equal(r.status, 200);
  const e = (await r.json()) as { campanha: { nome: string } }; // o fetch descompacta sozinho
  assert.equal(e.campanha.nome, 'Mesa');
});
