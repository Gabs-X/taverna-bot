import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Client, Message } from 'discord.js';
import { db } from '../db.ts';
import {
  assinarLink,
  chatVisivel,
  criarSessao,
  HISTORICO,
  interpretarEntrada,
  LIMITE_IMAGEM,
  lerCookies,
  lerLink,
  lerSessao,
  LIMITE_TEXTO,
  limitar,
  posicaoInicial,
  rolarEntrada,
  textoParaDiscord,
  tipoImagem,
  type LinhaChat,
  type ResultadoChat,
} from '../lib/mapa.ts';

// Mapa da campanha, estilo Roll20: um site embutido no bot. O /campanha mapa entrega a cada um um link pessoal
// (resposta efêmera no Discord), então o site sabe quem é cada jogador: cada ficha da campanha vira uma peça
// que só o dono (ou o mestre) move, e o chat da mesa guarda as rolagens de todos. O mestre pode rolar escondido
// (só ele vê, nem o histórico dos jogadores recebe) e revelar a rolagem depois com um clique.

const PORTA = Number(process.env.MAPA_PORTA) || 53135;
const ENDERECO = (process.env.MAPA_URL?.trim() || `http://localhost:${PORTA}`).replace(/\/+$/, '');
export const mapaPublico = () => !!process.env.MAPA_URL?.trim();
const PASTA = 'dados/mapas';
const LIMITE_IMAGEM_NPC = 3 * 1024 * 1024;
const SEGURO = ENDERECO.startsWith('https://');
const TABELA_FICHA = { dh: 'fichas_dh', dnd: 'fichas' } as const;

type Campanha = { id: number; guild_id: string; nome: string; sistema: 'dh' | 'dnd'; mestre_id: string; canal_id: string | null };
type Mapa = { campanha_id: number; imagem: string | null; largura: number; altura: number; grade: number; versao: number };
type Peca = { id: number; campanha_id: number; user_id: string | null; nome: string; x: number; y: number; imagem: string | null; versao_img: number; tamanho: number };

/** Segredo que assina os links e as sessões do mapa: sorteado na primeira vez e guardado no banco. */
function segredo() {
  const salvo = (db.prepare("SELECT valor FROM bot_estado WHERE chave = 'mapa_segredo'").get() as { valor: string } | undefined)?.valor;
  if (salvo) return salvo;
  const novo = randomBytes(32).toString('hex');
  db.prepare("INSERT INTO bot_estado (chave, valor) VALUES ('mapa_segredo', ?)").run(novo);
  return novo;
}

/** Link pessoal de quem rodou o /campanha mapa (vale 1 hora; ao abrir, vira uma sessão de 7 dias). */
export function linkDoMapa(campanhaId: number, userId: string, duracao?: number) {
  return `${ENDERECO}/m/${campanhaId}?${new URLSearchParams(assinarLink(segredo(), campanhaId, userId, Date.now(), duracao))}`;
}

const campanhaPorId = (id: number) => db.prepare('SELECT * FROM campanhas WHERE id = ?').get(id) as Campanha | undefined;
const idsJogadores = (id: number) => (db.prepare('SELECT user_id FROM campanha_personagens WHERE campanha_id = ? ORDER BY rowid').all(id) as { user_id: string }[]).map((r) => r.user_id);
const fichaDe = (c: Campanha, u: string) =>
  db.prepare(`SELECT * FROM ${TABELA_FICHA[c.sistema]} WHERE guild_id = ? AND user_id = ?`).get(c.guild_id, u) as Record<string, unknown> | undefined;

function mapaDe(id: number) {
  db.prepare('INSERT OR IGNORE INTO mapas (campanha_id) VALUES (?)').run(id);
  return db.prepare('SELECT * FROM mapas WHERE campanha_id = ?').get(id) as Mapa;
}

/** Cria a peça de quem entrou na campanha e tira a de quem saiu. Roda a cada leitura do estado. */
function sincronizarPecas(c: Campanha, m: Mapa) {
  const jogadores = idsJogadores(c.id);
  const existentes = db.prepare('SELECT * FROM mapa_pecas WHERE campanha_id = ?').all(c.id) as Peca[];
  for (const p of existentes) {
    if (p.user_id && !jogadores.includes(p.user_id)) db.prepare('DELETE FROM mapa_pecas WHERE id = ?').run(p.id);
  }
  let n = existentes.length;
  for (const u of jogadores) {
    const nome = String(fichaDe(c, u)?.nome ?? 'Personagem');
    const atual = existentes.find((p) => p.user_id === u);
    if (atual) {
      if (atual.nome !== nome) db.prepare('UPDATE mapa_pecas SET nome = ? WHERE id = ?').run(nome, atual.id);
      continue;
    }
    const { x, y } = posicaoInicial(n++, m.grade);
    db.prepare('INSERT OR IGNORE INTO mapa_pecas (campanha_id, user_id, nome, x, y) VALUES (?, ?, ?, ?, ?)').run(c.id, u, nome, x, y);
  }
}

// ---------- Tempo real (SSE): quem está com a página aberta recebe o aviso quando alguém mexe ----------

type Ouvinte = { res: ServerResponse; userId: string };
const ouvintes = new Map<number, Set<Ouvinte>>();

/** "estado" recarrega mapa e peças; "chat" recarrega só o chat. Rolagem escondida avisa só o mestre. */
function avisar(campanhaId: number, oQue: 'estado' | 'chat', soMestre = false) {
  const mestre = soMestre ? campanhaPorId(campanhaId)?.mestre_id : undefined;
  for (const o of ouvintes.get(campanhaId) ?? []) {
    if (!soMestre || o.userId === mestre) o.res.write(`data: ${oQue}\n\n`);
  }
}

/** Para o bot avisar as telas abertas quando a campanha muda pelo Discord (jogador entrou/saiu, mestre trocou). */
export const avisarMapa = (campanhaId: number) => avisar(campanhaId, 'estado');

// ---------- Estado enviado à página ----------

let discord: Client | undefined;

async function quem(guildId: string, userId: string) {
  const guild = discord?.guilds.cache.get(guildId);
  const membro = guild ? await guild.members.fetch(userId).catch(() => null) : null;
  const usuario = membro?.user ?? (await discord?.users.fetch(userId).catch(() => null));
  return {
    nome: membro?.displayName ?? usuario?.globalName ?? usuario?.username ?? 'Jogador',
    avatar: (membro ?? usuario)?.displayAvatarURL({ size: 128, extension: 'png' }) ?? null,
  };
}

async function montarEstado(c: Campanha, userId: string) {
  const m = mapaDe(c.id);
  sincronizarPecas(c, m);
  const pecas = db.prepare('SELECT * FROM mapa_pecas WHERE campanha_id = ? ORDER BY id').all(c.id) as Peca[];
  const souMestre = c.mestre_id === userId;
  const donos = new Map<string, Awaited<ReturnType<typeof quem>>>();
  const ids = new Set([c.mestre_id, userId, ...pecas.map((p) => p.user_id).filter((u): u is string => !!u)]);
  await Promise.all([...ids].map(async (u) => donos.set(u, await quem(c.guild_id, u))));

  return {
    campanha: { nome: c.nome, sistema: c.sistema, mestre: donos.get(c.mestre_id)?.nome ?? 'Mestre' },
    voce: { id: userId, mestre: souMestre, ...donos.get(userId)! },
    mapa: { versao: m.versao, temImagem: !!m.imagem, largura: m.largura, altura: m.altura, grade: m.grade },
    pecas: pecas.map((p) => {
      const meu = p.user_id === userId;
      // A ficha completa só aparece para o dono da peça e para o mestre; os outros veem nome, classe e nível.
      const ficha = p.user_id ? fichaDe(c, p.user_id) : undefined;
      let dadosFicha: Record<string, unknown> | undefined;
      if (ficha) {
        const { guild_id: _g, user_id: _u, ...resto } = ficha;
        dadosFicha = meu || souMestre ? resto : { nome: resto.nome, classe: resto.classe, nivel: resto.nivel };
      }
      return {
        id: p.id,
        nome: p.nome,
        x: p.x,
        y: p.y,
        npc: !p.user_id,
        meu,
        podeMover: souMestre || meu,
        jogador: p.user_id ? (donos.get(p.user_id)?.nome ?? null) : null,
        tamanho: p.tamanho,
        avatar: p.user_id ? (donos.get(p.user_id)?.avatar ?? null) : p.imagem ? `/api/m/${c.id}/peca-imagem/${p.id}?v=${p.versao_img}` : null,
        ficha: dadosFicha ?? null,
      };
    }),
  };
}

const lerChat = (c: Campanha, userId: string) => {
  const linhas = db.prepare('SELECT * FROM mapa_chat WHERE campanha_id = ? ORDER BY id DESC LIMIT ?').all(c.id, HISTORICO) as LinhaChat[];
  return chatVisivel(linhas.reverse(), c.mestre_id === userId);
};

/** Nome que aparece no chat: o personagem (e quem joga), ou o mestre. */
async function autorDe(c: Campanha, userId: string) {
  const { nome } = await quem(c.guild_id, userId);
  if (c.mestre_id === userId) return `🐉 ${nome} (mestre)`;
  const personagem = fichaDe(c, userId)?.nome;
  return personagem ? `${personagem} (${nome})` : nome;
}

/** Manda ao canal do Discord ligado à campanha (se houver) o que foi dito no chat do mapa. */
async function espelharNoDiscord(c: Campanha, conteudo: string) {
  if (!c.canal_id) return;
  const canal = await discord?.channels.fetch(c.canal_id).catch(() => null);
  if (!canal?.isTextBased() || !('send' in canal)) return;
  await canal.send({ content: conteudo.slice(0, 1900), allowedMentions: { parse: [] } }).catch((e: Error) => console.error('[mapa] não consegui escrever no canal do Discord:', e.message));
}

/** Grava uma linha no chat da mesa, avisa as telas abertas e (se não for escondida) repete no canal do Discord. */
function gravarChat(c: Campanha, userId: string, autor: string, tipo: LinhaChat['tipo'], texto: string, resultado: ResultadoChat | null, secreta: boolean, paraDiscord = true) {
  db.prepare('INSERT INTO mapa_chat (campanha_id, user_id, autor, tipo, texto, resultado, secreta, criada_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    c.id,
    userId,
    autor,
    tipo,
    texto,
    resultado ? JSON.stringify(resultado) : null,
    secreta ? 1 : 0,
    Date.now(),
  );
  // Guarda só as últimas mensagens de cada mesa.
  db.prepare('DELETE FROM mapa_chat WHERE campanha_id = ? AND id <= (SELECT id FROM mapa_chat WHERE campanha_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)').run(c.id, c.id, HISTORICO * 2);
  avisar(c.id, 'chat', secreta);
  if (paraDiscord && !secreta) void espelharNoDiscord(c, textoParaDiscord(autor, tipo, texto, resultado));
}

/** Mensagem escrita no canal do Discord ligado a uma campanha: aparece no chat do mapa (só de quem está na mesa). */
export async function aoMensagemDiscord(m: Message) {
  if (m.author.bot || !m.inGuild() || !m.content) return;
  const c = db.prepare('SELECT * FROM campanhas WHERE guild_id = ? AND canal_id = ?').get(m.guildId, m.channelId) as Campanha | undefined;
  if (!c || (c.mestre_id !== m.author.id && !idsJogadores(c.id).includes(m.author.id))) return;
  const texto = m.cleanContent.trim().slice(0, LIMITE_TEXTO);
  if (texto) gravarChat(c, m.author.id, await autorDe(c, m.author.id), 'msg', texto, null, false, false);
}

// ---------- Servidor HTTP ----------

const PAGINA = readFileSync(new URL('../mapa/pagina.html', import.meta.url), 'utf8');

const json = (res: ServerResponse, status: number, corpo: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
};
const texto = (res: ServerResponse, status: number, titulo: string, msg: string) => {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>${titulo}</title><body style="font-family:system-ui;background:#1d1029;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>${titulo}</h1><p>${msg}</p></div>`,
  );
};
const cookie = (nome: string, valor: string, segundos: number) => `${nome}=${valor}; Path=/; Max-Age=${segundos}; HttpOnly; SameSite=Lax${SEGURO ? '; Secure' : ''}`;

async function lerCorpo(req: IncomingMessage, limite: number) {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const p of req) {
    total += (p as Buffer).length;
    if (total > limite) throw new Error('grande');
    partes.push(p as Buffer);
  }
  return Buffer.concat(partes);
}
async function lerJson<T>(req: IncomingMessage, limite = 4_000): Promise<Partial<T>> {
  try {
    return JSON.parse((await lerCorpo(req, limite)).toString() || '{}') as Partial<T>;
  } catch {
    return {};
  }
}

const ABRA_DE_NOVO = 'Abra o mapa pelo comando <code>/campanha mapa</code> no Discord: o link é pessoal e liga o site à sua conta.';

async function tratar(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', ENDERECO);
  const rota = url.pathname;
  if (!discord) return texto(res, 503, 'Calma', 'O bot ainda está ligando. Tente de novo em instantes.');

  if (rota === '/') return texto(res, 200, '🗺️ Mapas da Taverna', ABRA_DE_NOVO);

  const pagina = rota.match(/^\/m\/(\d+)$/);
  const api = rota.match(/^\/api\/m\/(\d+)\/([a-z0-9/-]+)$/);
  if (!pagina && !api) return texto(res, 404, 'Não achei', 'Esse endereço não existe.');
  const campanhaId = Number((pagina ?? api)![1]);

  // Entrada pelo link do Discord: troca o link pessoal por um cookie de sessão e limpa o endereço.
  if (pagina && url.searchParams.has('k')) {
    const u = lerLink(segredo(), campanhaId, { u: url.searchParams.get('u'), v: url.searchParams.get('v'), k: url.searchParams.get('k') });
    if (!u) return texto(res, 403, 'Link vencido', `Esse link já venceu ou não é válido. ${ABRA_DE_NOVO}`);
    res.writeHead(302, { Location: rota, 'Set-Cookie': cookie('mapa_sessao', criarSessao(segredo(), u), 7 * 86400), 'Referrer-Policy': 'no-referrer' });
    return void res.end();
  }

  const userId = lerSessao(segredo(), lerCookies(req.headers.cookie).mapa_sessao);
  if (!userId) return api ? json(res, 401, { erro: 'Sessão vencida: abra o mapa de novo pelo /campanha mapa.' }) : texto(res, 401, 'Quem é você? 🎲', ABRA_DE_NOVO);

  const c = campanhaPorId(campanhaId);
  if (!c) return api ? json(res, 404, { erro: 'Campanha apagada.' }) : texto(res, 404, 'Campanha não encontrada', 'Ela pode ter sido apagada.');
  const souMestre = c.mestre_id === userId;
  if (!souMestre && !idsJogadores(c.id).includes(userId)) {
    return api
      ? json(res, 403, { erro: 'Você não está nessa campanha.' })
      : texto(res, 403, 'Mesa fechada 🚪', 'Você não está nessa campanha. Peça ao mestre para usar <code>/campanha adicionar</code>.');
  }

  if (pagina) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
    return void res.end(PAGINA);
  }

  const acao = api![2];
  if (req.method === 'POST') {
    // Defesa contra outro site mandando o navegador do jogador agir por ele.
    const origem = req.headers.origin;
    if (origem && origem !== new URL(ENDERECO).origin && origem !== `http://${req.headers.host}`) return json(res, 403, { erro: 'Origem não permitida.' });
  }

  if (req.method === 'GET') {
    if (acao === 'estado') return json(res, 200, await montarEstado(c, userId));
    if (acao === 'chat') return json(res, 200, lerChat(c, userId));

    if (acao === 'eventos') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      const set = ouvintes.get(c.id) ?? ouvintes.set(c.id, new Set()).get(c.id)!;
      const eu: Ouvinte = { res, userId };
      set.add(eu);
      const bate = setInterval(() => res.write(': ok\n\n'), 25_000);
      req.on('close', () => {
        clearInterval(bate);
        set.delete(eu);
      });
      return;
    }

    if (acao === 'imagem') {
      const m = mapaDe(c.id);
      if (!m.imagem) return json(res, 404, { erro: 'Sem imagem.' });
      try {
        const dados = readFileSync(`${PASTA}/${m.imagem}`);
        const tipo = tipoImagem(dados);
        if (!tipo) throw new Error('arquivo inválido');
        res.writeHead(200, { 'Content-Type': tipo.mime, 'Cache-Control': 'private, max-age=31536000', 'X-Content-Type-Options': 'nosniff' });
        return void res.end(dados);
      } catch {
        return json(res, 404, { erro: 'Sem imagem.' });
      }
    }
    const pecaImg = acao.match(/^peca-imagem\/(\d+)$/);
    if (pecaImg) {
      const p = db.prepare('SELECT * FROM mapa_pecas WHERE id = ? AND campanha_id = ?').get(Number(pecaImg[1]), c.id) as Peca | undefined;
      if (!p?.imagem) return json(res, 404, { erro: 'Sem imagem.' });
      try {
        const dados = readFileSync(`${PASTA}/${p.imagem}`);
        const tipo = tipoImagem(dados);
        if (!tipo) throw new Error('arquivo inválido');
        res.writeHead(200, { 'Content-Type': tipo.mime, 'Cache-Control': 'private, max-age=31536000', 'X-Content-Type-Options': 'nosniff' });
        return void res.end(dados);
      } catch {
        return json(res, 404, { erro: 'Sem imagem.' });
      }
    }
    return json(res, 404, { erro: 'Não achei.' });
  }

  if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });

  if (acao === 'mover') {
    const b = await lerJson<{ peca: number; x: number; y: number }>(req);
    const p = db.prepare('SELECT * FROM mapa_pecas WHERE id = ? AND campanha_id = ?').get(Number(b.peca), c.id) as Peca | undefined;
    if (!p) return json(res, 404, { erro: 'Peça não encontrada.' });
    if (!souMestre && p.user_id !== userId) return json(res, 403, { erro: 'Você só move o seu personagem.' });
    const m = mapaDe(c.id);
    db.prepare('UPDATE mapa_pecas SET x = ?, y = ? WHERE id = ?').run(limitar(b.x, 0, m.largura, p.x), limitar(b.y, 0, m.altura, p.y), p.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // Chat da mesa: mensagem ou rolagem. Quem rola é o servidor; escondida só o mestre pode.
  if (acao === 'chat') {
    const b = await lerJson<{ texto: string; como: number | null }>(req);
    let entrada;
    try {
      entrada = interpretarEntrada(String(b.texto ?? ''));
    } catch (e) {
      return json(res, 400, { erro: (e as Error).message });
    }
    const secreta = entrada.tipo !== 'msg' && entrada.secreta;
    if (secreta && !souMestre) return json(res, 403, { erro: 'Só o mestre rola escondido. Use /r para rolar para a mesa.' });
    const resultado = entrada.tipo === 'msg' ? null : rolarEntrada(entrada);
    const txt = entrada.tipo === 'msg' ? entrada.texto : entrada.rotulo;
    // O mestre pode falar e rolar pelos NPCs dele: o chat mostra o nome do NPC.
    let autor = await autorDe(c, userId);
    if (b.como !== undefined && b.como !== null) {
      if (!souMestre) return json(res, 403, { erro: 'Só o mestre fala por um NPC.' });
      const npc = db.prepare('SELECT * FROM mapa_pecas WHERE id = ? AND campanha_id = ? AND user_id IS NULL').get(Number(b.como), c.id) as Peca | undefined;
      if (!npc) return json(res, 404, { erro: 'Esse NPC não está mais no mapa.' });
      autor = `🎭 ${npc.nome} (NPC)`;
    }
    gravarChat(c, userId, autor, entrada.tipo, txt, resultado, secreta);
    return json(res, 200, { ok: true });
  }

  // Daqui para baixo, só o mestre da campanha.
  if (!souMestre) return json(res, 403, { erro: 'Só o mestre faz isso.' });

  if (acao === 'chat/revelar') {
    const b = await lerJson<{ id: number }>(req);
    const r = db.prepare('UPDATE mapa_chat SET secreta = 0, revelada = 1 WHERE id = ? AND campanha_id = ? AND secreta = 1').run(Number(b.id), c.id);
    if (!r.changes) return json(res, 404, { erro: 'Essa rolagem já está à mostra.' });
    avisar(c.id, 'chat');
    const l = db.prepare('SELECT * FROM mapa_chat WHERE id = ?').get(Number(b.id)) as LinhaChat | undefined;
    if (l) void espelharNoDiscord(c, textoParaDiscord(l.autor, l.tipo, l.texto, l.resultado ? (JSON.parse(l.resultado) as ResultadoChat) : null).replace(/^(\S+)/, '$1 👁️'));
    return json(res, 200, { ok: true });
  }

  if (acao === 'chat/limpar') {
    db.prepare('DELETE FROM mapa_chat WHERE campanha_id = ?').run(c.id);
    avisar(c.id, 'chat');
    return json(res, 200, { ok: true });
  }

  if (acao === 'mapa') {
    let dados: Buffer;
    try {
      dados = await lerCorpo(req, LIMITE_IMAGEM);
    } catch {
      return json(res, 413, { erro: `Imagem grande demais (máximo ${LIMITE_IMAGEM / 1024 / 1024} MB).` });
    }
    const tipo = tipoImagem(dados);
    if (!tipo) return json(res, 415, { erro: 'Use uma imagem PNG, JPG, WEBP ou GIF.' });
    const m = mapaDe(c.id);
    mkdirSync(PASTA, { recursive: true });
    const arquivo = `${c.id}-${Date.now()}.${tipo.ext}`;
    writeFileSync(`${PASTA}/${arquivo}`, dados);
    if (m.imagem) rmSync(`${PASTA}/${m.imagem}`, { force: true });
    const largura = Math.round(limitar(url.searchParams.get('l'), 100, 20_000, m.largura));
    const altura = Math.round(limitar(url.searchParams.get('a'), 100, 20_000, m.altura));
    db.prepare('UPDATE mapas SET imagem = ?, largura = ?, altura = ?, versao = versao + 1 WHERE campanha_id = ?').run(arquivo, largura, altura, c.id);
    // Peças que ficaram fora do mapa novo voltam para dentro.
    db.prepare('UPDATE mapa_pecas SET x = MIN(x, ?), y = MIN(y, ?) WHERE campanha_id = ?').run(largura, altura, c.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'npc/imagem') {
    const p = db.prepare('SELECT * FROM mapa_pecas WHERE id = ? AND campanha_id = ? AND user_id IS NULL').get(Number(url.searchParams.get('peca')), c.id) as Peca | undefined;
    if (!p) return json(res, 404, { erro: 'NPC não encontrado.' });
    let dados: Buffer;
    try {
      dados = await lerCorpo(req, LIMITE_IMAGEM_NPC);
    } catch {
      return json(res, 413, { erro: `Imagem grande demais para um NPC (máximo ${LIMITE_IMAGEM_NPC / 1024 / 1024} MB).` });
    }
    const tipo = tipoImagem(dados);
    if (!tipo) return json(res, 415, { erro: 'Use uma imagem PNG, JPG, WEBP ou GIF.' });
    mkdirSync(PASTA, { recursive: true });
    const arquivo = `npc-${c.id}-${p.id}-${Date.now()}.${tipo.ext}`;
    writeFileSync(`${PASTA}/${arquivo}`, dados);
    if (p.imagem) rmSync(`${PASTA}/${p.imagem}`, { force: true });
    db.prepare('UPDATE mapa_pecas SET imagem = ?, versao_img = versao_img + 1 WHERE id = ?').run(arquivo, p.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  const b = await lerJson<{ grade: number; nome: string; peca: number; tamanho: number }>(req);

  // Tamanho em casas (0,5 a 6, de meio em meio): o mestre aumenta monstros e diminui familiares.
  if (acao === 'peca/tamanho') {
    const tamanho = Math.round(limitar(b.tamanho, 0.5, 6, 1) * 2) / 2;
    const r = db.prepare('UPDATE mapa_pecas SET tamanho = ? WHERE id = ? AND campanha_id = ?').run(tamanho, Number(b.peca), c.id);
    if (!r.changes) return json(res, 404, { erro: 'Peça não encontrada.' });
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'npc/imagem/remover') {
    const p = db.prepare('SELECT * FROM mapa_pecas WHERE id = ? AND campanha_id = ? AND user_id IS NULL').get(Number(b.peca), c.id) as Peca | undefined;
    if (!p) return json(res, 404, { erro: 'NPC não encontrado.' });
    if (p.imagem) rmSync(`${PASTA}/${p.imagem}`, { force: true });
    db.prepare('UPDATE mapa_pecas SET imagem = NULL, versao_img = versao_img + 1 WHERE id = ?').run(p.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'grade') {
    db.prepare('UPDATE mapas SET grade = ?, versao = versao + 1 WHERE campanha_id = ?').run(Math.round(limitar(b.grade, 10, 400, 50)), c.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'npc') {
    const m = mapaDe(c.id);
    const n = (db.prepare('SELECT COUNT(*) AS n FROM mapa_pecas WHERE campanha_id = ?').get(c.id) as { n: number }).n;
    const { x, y } = posicaoInicial(n, m.grade);
    const nome = String(b.nome ?? '').trim().slice(0, 40) || 'NPC';
    db.prepare('INSERT INTO mapa_pecas (campanha_id, user_id, nome, x, y) VALUES (?, NULL, ?, ?, ?)').run(c.id, nome, x, y);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'npc/remover') {
    const npc = db.prepare('SELECT * FROM mapa_pecas WHERE id = ? AND campanha_id = ? AND user_id IS NULL').get(Number(b.peca), c.id) as Peca | undefined;
    if (npc?.imagem) rmSync(`${PASTA}/${npc.imagem}`, { force: true });
    db.prepare('DELETE FROM mapa_pecas WHERE id = ? AND campanha_id = ? AND user_id IS NULL').run(Number(b.peca), c.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { erro: 'Ação desconhecida.' });
}

/** Apaga mapa, imagem, peças e chat de uma campanha (chamado quando ela é apagada). */
export function apagarMapa(campanhaId: number) {
  const m = db.prepare('SELECT imagem FROM mapas WHERE campanha_id = ?').get(campanhaId) as { imagem: string | null } | undefined;
  if (m?.imagem) rmSync(`${PASTA}/${m.imagem}`, { force: true });
  for (const p of db.prepare('SELECT imagem FROM mapa_pecas WHERE campanha_id = ? AND imagem IS NOT NULL').all(campanhaId) as { imagem: string }[]) rmSync(`${PASTA}/${p.imagem}`, { force: true });
  db.prepare('DELETE FROM mapa_pecas WHERE campanha_id = ?').run(campanhaId);
  db.prepare('DELETE FROM mapa_chat WHERE campanha_id = ?').run(campanhaId);
  db.prepare('DELETE FROM mapas WHERE campanha_id = ?').run(campanhaId);
  for (const o of ouvintes.get(campanhaId) ?? []) o.res.end();
  ouvintes.delete(campanhaId);
}

export function iniciarMapa(client: Client) {
  discord = client;
  const servidor = createServer((req, res) => {
    tratar(req, res).catch((e) => {
      console.error('[mapa]', e);
      if (!res.headersSent) json(res, 500, { erro: 'Deu ruim aqui. Tente de novo.' });
      else res.end();
    });
  });
  servidor.on('error', (e) => console.error(`[mapa] não consegui abrir a porta ${PORTA}:`, e.message));
  servidor.listen(PORTA, '0.0.0.0', () => console.log(`🗺️ Mapa das campanhas em ${ENDERECO}`));
}
