import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import type { Client } from 'discord.js';

// Servidor do mapa de verdade (HTTP numa porta livre), com banco isolado e um Discord de mentira.
const anterior = process.cwd();
process.chdir(mkdtempSync(join(tmpdir(), 'taverna-mapa-')));
process.env.MAPA_PORTA = String(40_000 + Math.floor(Math.random() * 20_000));
delete process.env.MAPA_URL;
const { db } = await import('../db.ts');
const { iniciarMapa } = await import('../recursos/mapa.ts');
const { criarSessao } = await import('./mapa.ts');

const SEGREDO = 'segredo-de-teste';
db.prepare("INSERT INTO bot_estado (chave, valor) VALUES ('mapa_segredo', ?)").run(SEGREDO);
const falso = { guilds: { cache: new Map() }, channels: { fetch: async () => null }, users: { fetch: async () => { throw new Error('offline'); } }, user: { id: 'bot' } } as unknown as Client;
const log = console.log;
console.log = () => {};
const servidor = iniciarMapa(falso);
await new Promise((r) => servidor.once('listening', r));
console.log = log;
after(() => { servidor.closeAllConnections(); servidor.close(); db.close(); process.chdir(anterior); });

const base = `http://127.0.0.1:${process.env.MAPA_PORTA}`;
const campanha = Number(db.prepare("INSERT INTO campanhas (guild_id, nome, sistema, mestre_id, criada_em) VALUES ('g', 'Mesa', 'dh', '100000000000000001', 0)").run().lastInsertRowid);
db.prepare("INSERT INTO campanha_personagens (campanha_id, user_id) VALUES (?, '200000000000000002')").run(campanha);

async function chamar(quem: string, acao: string, corpo?: unknown, binario?: Buffer) {
  const r = await fetch(`${base}/api/m/${campanha}/${acao}`, {
    method: corpo === undefined && !binario ? 'GET' : 'POST',
    headers: { cookie: `mapa_sessao=${criarSessao(SEGREDO, quem)}`, 'Content-Type': binario ? 'application/octet-stream' : 'application/json' },
    body: binario ?? (corpo === undefined ? undefined : JSON.stringify(corpo)),
  });
  const tipo = r.headers.get('content-type') ?? '';
  return { status: r.status, corpo: tipo.includes('json') ? await r.json() : await r.arrayBuffer() } as { status: number; corpo: any };
}
const estado = async (quem: string) => (await chamar(quem, 'estado')).corpo;

const FICHA = { nome: 'Lyra', classe: 'Feiticeira', nivel: 1, agilidade: 0, forca: 0, acuidade: 1, instinto: 2, presenca: 1, conhecimento: 0, evasao: 10, pv_max: 6, armadura_max: 3, limiar_maior: 6, limiar_grave: 12 };
// PNG de 1x1 pixel.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('jogador sem ficha entra no mapa como "Novo personagem" e cria a ficha lá dentro', async () => {
  let e = await estado('200000000000000002');
  assert.equal(e.voce.jogador, true);
  assert.equal(e.voce.temFicha, false);
  assert.equal(e.pecas.find((p: any) => p.meu).nome, 'Novo personagem');

  assert.equal((await chamar('200000000000000002', 'ficha', { ...FICHA, limiar_grave: 3 })).status, 400);
  assert.equal((await chamar('100000000000000001', 'ficha', FICHA)).status, 403);
  assert.equal((await chamar('200000000000000002', 'ficha', FICHA)).status, 200);
  e = await estado('200000000000000002');
  assert.equal(e.voce.temFicha, true);
  assert.equal(e.pecas.find((p: any) => p.meu).nome, 'Lyra');

  // Editar a ficha mantém o que já foi marcado na sessão (PV marcados não passam do novo máximo).
  db.prepare("UPDATE fichas_dh SET pv = 5, esperanca = 4 WHERE user_id = '200000000000000002'").run();
  assert.equal((await chamar('200000000000000002', 'ficha', { ...FICHA, pv_max: 4 })).status, 200);
  const salva = db.prepare("SELECT pv, pv_max, esperanca FROM fichas_dh WHERE user_id = '200000000000000002'").get() as { pv: number; pv_max: number; esperanca: number };
  assert.deepEqual({ ...salva }, { pv: 4, pv_max: 4, esperanca: 4 });
});

test('foto do personagem vai para a peça e é servida só pela sessão', async () => {
  assert.equal((await chamar('200000000000000002', 'ficha/foto', undefined, Buffer.from('não é imagem'))).status, 415);
  assert.equal((await chamar('200000000000000002', 'ficha/foto', undefined, PNG)).status, 200);
  const minha = (await estado('200000000000000002')).pecas.find((p: any) => p.meu);
  assert.match(minha.avatar, /\/foto\/200000000000000002\?v=1$/);
  const img = await chamar('100000000000000001', 'foto/200000000000000002');
  assert.equal(img.status, 200);
  assert.equal(Buffer.from(img.corpo).length, PNG.length);
  // Sem a assinatura certa, o endereço aberto das imagens não entrega nada.
  assert.equal((await fetch(`${base}/img/qualquer.png?k=errada`)).status, 404);
});

test('biblioteca do mestre: cópias numeradas, vida própria e escondida dos jogadores', async () => {
  assert.equal((await chamar('200000000000000002', 'criatura', { nome: 'Goblin' })).status, 403);
  const { corpo } = await chamar('100000000000000001', 'criatura', { tipo: 'inimigo', nome: 'Goblin', pv_max: 7, defesa: 12, ataque: 3, dano: '1d6+1' });
  const id = corpo.id;
  const a = (await chamar('100000000000000001', 'criatura/colocar', { id, x: 100, y: 100 })).corpo;
  const b = (await chamar('100000000000000001', 'criatura/colocar', { id })).corpo;
  assert.equal(a.nome, 'Goblin');
  assert.equal(b.nome, 'Goblin 2');

  assert.equal((await chamar('100000000000000001', 'peca/pv', { peca: a.peca, delta: -3 })).status, 200);
  assert.equal((await chamar('100000000000000001', 'peca/pv', { peca: b.peca, delta: -50 })).status, 200);
  let e = await estado('100000000000000001');
  const pv = (pid: number) => e.pecas.find((p: any) => p.id === pid).ficha.pv_atual;
  assert.equal(pv(a.peca), 4);
  assert.equal(pv(b.peca), 0);
  assert.equal(e.biblioteca[0].noMapa, 2);
  assert.equal(e.pecas.find((p: any) => p.id === a.peca).tipo, 'inimigo');

  const doJogador = await estado('200000000000000002');
  assert.deepEqual(doJogador.biblioteca, []);
  assert.equal(doJogador.pecas.find((p: any) => p.id === a.peca).ficha, null);

  // Baixar a vida máxima na biblioteca puxa as cópias junto.
  assert.equal((await chamar('100000000000000001', 'criatura', { id, tipo: 'inimigo', nome: 'Goblin', pv_max: 3 })).status, 200);
  e = await estado('100000000000000001');
  assert.equal(pv(a.peca), 3);

  // Falar como o inimigo usa o nome da cópia no chat.
  assert.equal((await chamar('100000000000000001', 'chat', { texto: 'Grrr!', como: b.peca })).status, 200);
  const chat = (await chamar('100000000000000001', 'chat')).corpo;
  assert.equal(chat.at(-1).autor, '👹 Goblin 2 (inimigo)');

  assert.equal((await chamar('100000000000000001', 'criatura/remover', { id })).status, 200);
  e = await estado('100000000000000001');
  assert.equal(e.biblioteca.length, 0);
  assert.equal(e.pecas.filter((p: any) => p.npc).length, 0);
});

test('só o dono (ou o mestre) move a peça', async () => {
  const minha = (await estado('200000000000000002')).pecas.find((p: any) => p.meu);
  assert.equal((await chamar('200000000000000002', 'mover', { peca: minha.id, x: 75, y: 125 })).status, 200);
  const movida = (await estado('100000000000000001')).pecas.find((p: any) => p.id === minha.id);
  assert.deepEqual([movida.x, movida.y], [75, 125]);
  const { corpo } = await chamar('100000000000000001', 'criatura', { nome: 'Velho Sábio' });
  const npc = (await chamar('100000000000000001', 'criatura/colocar', { id: corpo.id })).corpo;
  assert.equal((await chamar('200000000000000002', 'mover', { peca: npc.peca, x: 1, y: 1 })).status, 403);
});

test('combate no Daggerheart: holofote, nova rodada e Medo do Mestre', async () => {
  const J = '200000000000000002';
  assert.equal((await chamar(J, 'combate/iniciar', {})).status, 403);
  assert.equal((await chamar('100000000000000001', 'combate/iniciar', {})).status, 200);
  let e = await estado(J);
  assert.equal(e.combate.ativo, true);
  assert.equal(e.combate.rodada, 1);
  const minha = e.pecas.find((p: any) => p.meu);
  assert.equal((await chamar(J, 'combate/agiu', { peca: minha.id, agiu: true })).status, 200);
  assert.equal((await estado(J)).pecas.find((p: any) => p.meu).agiu, true);
  assert.equal((await chamar('100000000000000001', 'combate/proximo', {})).status, 200);
  e = await estado(J);
  assert.equal(e.combate.rodada, 2);
  assert.equal(e.pecas.find((p: any) => p.meu).agiu, false);
  assert.equal((await chamar('100000000000000001', 'medo', { delta: 3 })).corpo.medo, 3);
  assert.equal((await estado(J)).medo, 3);
  assert.equal((await chamar('100000000000000001', 'combate/encerrar', {})).status, 200);
  assert.equal((await estado(J)).combate.ativo, false);
});

test('ataque clicando no alvo: acerta a Dificuldade, rola o dano e marca PV pelos limiares', async () => {
  const M = '100000000000000001';
  const J = '200000000000000002';
  const { corpo } = await chamar(M, 'criatura', { tipo: 'inimigo', nome: 'Bandido', pv_max: 3, defesa: 1, dano: '5', limiar_maior: 4, limiar_grave: 8 });
  const alvo = (await chamar(M, 'criatura/colocar', { id: corpo.id })).corpo.peca;
  const r = await chamar(J, 'ataque', { alvo, dano: '5', traco: 'instinto' });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.acertou, true); // Dificuldade 1: qualquer dualidade acerta
  const e = await estado(M);
  assert.equal(e.pecas.find((p: any) => p.id === alvo).ficha.pv_atual, 1); // 5 de dano ≥ Maior 4: marca 2
  const chat = (await chamar(M, 'chat')).corpo;
  assert.match(chat.at(-1).texto, /acertou Bandido.*5 de dano \(2 PV marcados · Muito ferido\)/);
  assert.equal(chat.at(-3).texto, '⚔️ Ataque em Bandido');

  // O jogador vê só o estado da vida; o mestre pode mostrar o número ou esconder.
  assert.deepEqual((await estado(J)).pecas.find((p: any) => p.id === alvo).vida, { frac: null, texto: 'Muito ferido' });
  await chamar(M, 'vida-inimigos', { modo: 'exata' });
  assert.equal((await estado(J)).pecas.find((p: any) => p.id === alvo).vida.texto, '1/3 PV');
  await chamar(M, 'vida-inimigos', { modo: 'escondida' });
  assert.equal((await estado(J)).pecas.find((p: any) => p.id === alvo).vida, null);
  assert.equal((await chamar(J, 'ataque', { alvo: (await estado(J)).voce.pecaId, dano: '1' })).status, 400);
});

test('condições e recursos da ficha pelo mapa', async () => {
  const J = '200000000000000002';
  const e = await estado(J);
  const minha = e.voce.pecaId;
  const outra = e.pecas.find((p: any) => !p.meu).id;
  assert.equal((await chamar(J, 'peca/condicao', { peca: minha, condicao: 'envenenado', ligar: true })).status, 200);
  assert.equal((await chamar(J, 'peca/condicao', { peca: outra, condicao: 'caido', ligar: true })).status, 403);
  assert.equal((await chamar(J, 'peca/condicao', { peca: minha, condicao: 'pegando-fogo', ligar: true })).status, 400);
  assert.deepEqual((await estado(J)).pecas.find((p: any) => p.meu).condicoes, ['envenenado']);
  assert.equal((await chamar(J, 'ficha/recurso', { campo: 'esperanca', delta: 9 })).corpo.valor, 6);
  assert.equal((await chamar(J, 'ficha/recurso', { campo: 'pv_max', delta: 9 })).status, 400);
  assert.equal((await chamar(J, 'ficha/recurso', { user: '100000000000000001', campo: 'pv', delta: 1 })).status, 403);
});

test('névoa e peça escondida: o jogador nem recebe o que está coberto', async () => {
  const M = '100000000000000001';
  const J = '200000000000000002';
  const { corpo } = await chamar(M, 'criatura', { tipo: 'inimigo', nome: 'Espreitador' });
  const peca = (await chamar(M, 'criatura/colocar', { id: corpo.id, x: 1025, y: 525 })).corpo.peca; // casa (20, 10)
  const vejo = async () => (await estado(J)).pecas.some((p: any) => p.id === peca);
  assert.equal(await vejo(), true);
  await chamar(M, 'nevoa/ligar', { ligada: true });
  assert.equal(await vejo(), false);
  assert.equal((await estado(M)).pecas.some((p: any) => p.id === peca), true); // o mestre vê tudo
  assert.ok((await estado(J)).mapa.nevoa.bits);
  await chamar(M, 'nevoa/pintar', { c0: 19, r0: 9, c1: 21, r1: 11, revelar: true });
  assert.equal(await vejo(), true);
  await chamar(M, 'peca/esconder', { peca, escondida: true });
  assert.equal(await vejo(), false);
  await chamar(M, 'peca/esconder', { peca, escondida: false });
  await chamar(M, 'nevoa/ligar', { ligada: false });
  assert.equal(await vejo(), true);
  assert.equal((await chamar(J, 'nevoa/tudo', { revelar: true })).status, 403);
});

test('cenas: cada uma com as suas peças do mestre; os jogadores vão junto', async () => {
  const M = '100000000000000001';
  const J = '200000000000000002';
  const antes = await estado(M);
  const doMestre = antes.pecas.filter((p: any) => p.npc).map((p: any) => p.id);
  assert.ok(doMestre.length > 0);
  const nova = (await chamar(M, 'cena/nova', { nome: 'Masmorra' })).corpo.id;
  let e = await estado(M);
  assert.equal(e.mapa.cena, 'Masmorra');
  assert.deepEqual(e.cenas.map((c: any) => [c.nome, c.ativa]), [['Primeira cena', false], ['Masmorra', true]]);
  assert.equal(e.pecas.filter((p: any) => p.npc).length, 0);
  assert.equal((await estado(J)).voce.pecaId !== null, true);
  assert.equal((await chamar(M, 'cena/apagar', { id: nova })).status, 400);
  await chamar(M, 'cena/abrir', { id: e.cenas[0].id });
  e = await estado(M);
  assert.deepEqual(e.pecas.filter((p: any) => p.npc).map((p: any) => p.id), doMestre);
  assert.equal((await chamar(M, 'cena/renomear', { id: nova, nome: 'Cripta' })).status, 200);
  assert.equal((await chamar(M, 'cena/apagar', { id: nova })).status, 200);
  assert.equal((await estado(M)).cenas.length, 1);
});

test('handouts: o mestre mostra uma imagem para a mesa toda e pode esconder ou apagar', async () => {
  const M = '100000000000000001';
  const J = '200000000000000002';
  assert.equal((await chamar(J, 'handout?titulo=Carta', undefined, PNG)).status, 403);
  const { corpo } = await chamar(M, 'handout?titulo=Carta%20do%20vil%C3%A3o', undefined, PNG);
  let e = await estado(J);
  assert.equal(e.handout.titulo, 'Carta do vilão');
  assert.equal(e.handouts.length, 1);
  assert.equal(Buffer.from((await chamar(J, `handout-imagem/${corpo.id}`)).corpo).length, PNG.length);
  await chamar(M, 'handout/mostrar', { id: null });
  assert.equal((await estado(J)).handout, null);
  await chamar(M, 'handout/apagar', { id: corpo.id });
  e = await estado(J);
  assert.equal(e.handouts.length, 0);
});

test('ping chega na tela de todos pelo tempo real', async () => {
  const M = '100000000000000001';
  const J = '200000000000000002';
  const controle = new AbortController();
  const r = await fetch(`${base}/api/m/${campanha}/eventos`, { headers: { cookie: `mapa_sessao=${criarSessao(SEGREDO, M)}` }, signal: controle.signal });
  const leitor = r.body!.getReader();
  await chamar(J, 'ping', { x: 100, y: 200 });
  let texto = '';
  while (!texto.includes('ping:')) texto += new TextDecoder().decode((await leitor.read()).value);
  controle.abort();
  const dados = JSON.parse(texto.slice(texto.indexOf('ping:') + 5).split('\n')[0]);
  assert.deepEqual(dados, { x: 100, y: 200, quem: J });
});

test('ponte com os bardos: só entra com a chave, recebe o pedido do mestre e devolve a resposta', async () => {
  const M = '100000000000000001';
  const { readFileSync } = await import('node:fs');
  const chave = readFileSync('dados/bardos.chave', 'utf8').trim();
  assert.equal((await fetch(`${base}/bardos/eventos`)).status, 401);
  assert.equal((await fetch(`${base}/bardos/eventos`, { headers: { 'x-bardos': chave, 'cf-connecting-ip': '1.2.3.4' } })).status, 401);

  // Sem call da mesa ainda: o mapa avisa antes de incomodar os bardos.
  assert.equal((await chamar(M, 'musica', { acao: 'pular' })).status, 400);
  db.prepare("UPDATE campanhas SET canal_voz_id = '300000000000000003', canal_id = '400000000000000004' WHERE id = ?").run(campanha);
  assert.equal((await chamar(M, 'musica', { acao: 'pular' })).status, 502); // ninguém na ponte

  const controle = new AbortController();
  const r = await fetch(`${base}/bardos/eventos`, { headers: { 'x-bardos': chave }, signal: controle.signal });
  const leitor = r.body!.getReader();
  const pedido = chamar(M, 'musica', { acao: 'ambiente', tipo: 'taverna' });
  let texto = '';
  while (!texto.includes('data:')) texto += new TextDecoder().decode((await leitor.read()).value);
  const recebido = JSON.parse(texto.slice(texto.indexOf('data:') + 5).split('\n')[0]);
  assert.equal(recebido.acao, 'ambiente');
  assert.equal(recebido.tipo, 'taverna');
  assert.equal(recebido.canalVozId, '300000000000000003');
  const estadoFila = [{ guildId: 'g', canalId: '300000000000000003', bardo: 'Claudinho', titulo: 'Taverna', pausado: false, volume: 35, ambiente: 'taverna' }];
  await fetch(`${base}/bardos/resposta`, { method: 'POST', headers: { 'x-bardos': chave, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: recebido.id, ok: true, msg: 'Tocando', estado: estadoFila }) });
  const resposta = await pedido;
  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.msg, 'Tocando');
  const e = await estado(M);
  assert.equal(e.musica.ponte, true);
  assert.equal(e.musica.fila.bardo, 'Claudinho');
  assert.equal((await estado('200000000000000002')).musica, null);
  controle.abort();
});

test('grupo: ouro e inventário compartilhados, com registro no chat', async () => {
  const J = '200000000000000002';
  assert.equal((await chamar(J, 'grupo/ouro', { delta: 50 })).status, 200);
  assert.equal((await chamar(J, 'grupo/ouro', { delta: -80 })).status, 200); // não fica negativo
  assert.equal((await estado(J)).grupo.ouro, 0);
  await chamar(J, 'grupo/item', { item: 'Poção de cura', qtd: 2 });
  await chamar(J, 'grupo/item', { item: 'poção de cura', qtd: 1 }); // mesmo item, junta
  let itens = (await estado(J)).grupo.itens;
  assert.deepEqual(itens.map((i: any) => [i.item, i.qtd]), [['Poção de cura', 3]]);
  await chamar(J, 'grupo/item/qtd', { id: itens[0].id, delta: -1 });
  assert.match((await chamar(J, 'chat')).corpo.at(-1).texto, /Usou 1× Poção de cura \(sobram 2\)/);
  await chamar(J, 'grupo/item/remover', { id: itens[0].id });
  itens = (await estado(J)).grupo.itens;
  assert.equal(itens.length, 0);
  assert.equal((await chamar(J, 'grupo/item', { item: '' })).status, 400);
});

test('diário: cada sessão finalizada aparece com o registro, e o mestre escreve as notas', async () => {
  const M = '100000000000000001';
  const J = '200000000000000002';
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync('dados/campanhas', { recursive: true });
  writeFileSync(`dados/campanhas/${campanha}-mesa-teste.txt`, 'Campanha: Mesa\n[20:00] Lyra: olá');
  const id = Number(db.prepare('INSERT INTO campanha_sessoes (campanha_id, inicio, fim, mensagens, rolagens, arquivo) VALUES (?, 1, 2, 1, 0, ?)').run(campanha, `${campanha}-mesa-teste.txt`).lastInsertRowid);
  const e = await estado(J);
  assert.equal(e.diario[0].id, id);
  const r = await fetch(`${base}/api/m/${campanha}/diario/${id}`, { headers: { cookie: `mapa_sessao=${criarSessao(SEGREDO, J)}` } });
  assert.match(await r.text(), /Lyra: olá/);
  assert.equal((await chamar(J, 'diario/notas', { id, notas: 'x' })).status, 403);
  assert.equal((await chamar(M, 'diario/notas', { id, notas: 'O grupo achou a cripta.' })).status, 200);
  assert.equal((await estado(J)).diario[0].notas, 'O grupo achou a cripta.');
});

test('fala escrita direto no canal sai como o personagem; mestre e fora do personagem ficam como estão', async () => {
  const { aoMensagemDiscord } = await import('../recursos/mapa.ts');
  db.prepare("UPDATE campanhas SET canal_id = 'canal-da-mesa' WHERE id = ?").run(campanha);
  const enviadas: any[] = [];
  const canal = {
    id: 'canal-da-mesa',
    type: 0,
    guild: { members: { me: {} } },
    permissionsFor: () => ({ has: () => true }),
    fetchWebhooks: async () => [],
    createWebhook: async () => ({ token: 't', owner: { id: 'bot' }, send: async (x: unknown) => enviadas.push(x) }),
  };
  const mensagem = (autor: string, conteudo: string) => {
    const m = {
      apagada: false,
      author: { id: autor, bot: false },
      webhookId: null,
      inGuild: () => true,
      guildId: 'g',
      channelId: 'canal-da-mesa',
      channel: canal,
      content: conteudo,
      cleanContent: conteudo,
      reference: null,
      stickers: { size: 0 },
      poll: null,
      attachments: new Map(),
      delete: async () => { m.apagada = true; },
    };
    return m;
  };

  const fala = mensagem('200000000000000002', 'Eu saco a espada!');
  await aoMensagemDiscord(fala as never);
  assert.equal(fala.apagada, true);
  assert.equal(enviadas.length, 1);
  assert.equal(enviadas[0].username, 'Lyra');
  assert.equal(enviadas[0].content, 'Eu saco a espada!');

  const ooc = mensagem('200000000000000002', '(já volto)');
  const doMestre = mensagem('100000000000000001', 'Rolem iniciativa.');
  await aoMensagemDiscord(ooc as never);
  await aoMensagemDiscord(doMestre as never);
  assert.equal(ooc.apagada || doMestre.apagada, false);
  assert.equal(enviadas.length, 1);

  // As três aparecem no chat do mapa.
  const chat = (await chamar('100000000000000001', 'chat')).corpo.map((l: any) => l.texto);
  for (const t of ['Eu saco a espada!', '(já volto)', 'Rolem iniciativa.']) assert.ok(chat.includes(t), t);
});
