import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ChannelType, OverwriteType, PermissionFlagsBits, type Client, type Message, type TextChannel, type Webhook } from 'discord.js';
import { db } from '../db.ts';
import { AMBIENTES, ehAmbiente, lerComandoMusica, type FilaTocando, type PedidoMusica } from '../lib/ambientes.ts';
import { alternarCondicao, ehCondicao, estadoDaVida, ordenarIniciativa, perdaDeVida, proximoTurno, resolverAtaque } from '../lib/combate.ts';
import { rolar } from '../lib/dados.ts';
import { MAX_ESPERANCA, MAX_MEDO } from '../lib/daggerheart.ts';
import { modificador } from '../lib/dnd35.ts';
import { dimensoesNevoa, gravarNevoa, lerNevoa, MAX_CASAS_NEVOA, nevoaToda, pecaNaNevoa, pintarNevoa, revelarRaio } from '../lib/nevoa.ts';
import { esquecerMesa, estadoDaMesa, lerMesa, registrarHistorico, tratarMesa, type Mesa } from './mapaMesa.ts';
import { validarDesenho } from '../lib/mesa.ts';
import { CARTA, CARTAS, CLASSES, DOMINIOS, ESTAGIOS, dominiosTocados, limites, lugarAoEscolher, motivoParaNaoEscolher, moverCarta, type CartaDoPersonagem } from '../lib/cartasDH.ts';
import { foraDoPersonagem, nomeDaCopia, nomeDeWebhook, validarCriatura, validarFicha, type Criatura, type FichaDH, type FichaDnd } from '../lib/fichaMapa.ts';
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
  textoDoPersonagem,
  textoParaDiscord,
  tipoImagem,
  type LinhaChat,
  type ResultadoChat,
  type ResultadoLinha,
} from '../lib/mapa.ts';

// Mapa da campanha, estilo Roll20: um site embutido no bot. O /sessao mapa entrega a cada um um link pessoal
// (resposta efêmera no Discord), então o site sabe quem é cada jogador. O jogador cria a ficha e põe a foto do
// personagem ali mesmo; cada jogador vira uma peça que só ele (ou o mestre) move. O mestre guarda NPCs e inimigos
// numa biblioteca da campanha e arrasta para o mapa quantas cópias quiser. O chat da mesa guarda as rolagens de todos
// e sai no canal do Discord com o nome e a foto de quem fala (o personagem, o NPC ou o mestre).

const PORTA = Number(process.env.MAPA_PORTA) || 53135;
const ENDERECO = (process.env.MAPA_URL?.trim() || `http://localhost:${PORTA}`).replace(/\/+$/, '');
export const mapaPublico = () => !!process.env.MAPA_URL?.trim();
const PASTA = 'dados/mapas';
const LIMITE_IMAGEM_PECA = 3 * 1024 * 1024;
const SEGURO = ENDERECO.startsWith('https://');
const TABELA_FICHA = { dh: 'fichas_dh', dnd: 'fichas' } as const;

type Campanha = { id: number; guild_id: string; nome: string; sistema: 'dh' | 'dnd'; mestre_id: string; canal_id: string | null; canal_voz_id: string | null };
type Mapa = {
  campanha_id: number; imagem: string | null; largura: number; altura: number; grade: number; versao: number;
  combate: number; rodada: number; vez: number | null; vida_inimigos: 'escondida' | 'estado' | 'exata';
  nevoa_ligada: number; nevoa: string | null; cena_id: number | null; handout_id: number | null; visao: number; cortina: number;
};
type Peca = {
  id: number; campanha_id: number; user_id: string | null; nome: string; x: number; y: number; imagem: string | null; versao_img: number; tamanho: number;
  criatura_id: number | null; tipo: string | null; pv: number | null; condicoes: string; iniciativa: number | null; agiu: number;
  escondida: number; cena_id: number | null;
};
type Cena = {
  id: number; campanha_id: number; nome: string; imagem: string | null; largura: number; altura: number; grade: number;
  nevoa_ligada: number; nevoa: string | null; ambiente: string | null; notas: string;
};

type Elemento = { id: number; campanha_id: number; cena_id: number | null; imagem: string; x: number; y: number; largura: number; altura: number; rotacao: number; oculto: number; ordem: number };
type DesenhoSalvo = { id: number; tipo: string; pontos: string; cor: string; espessura: number; preenchido: number; oculto: number };
/** Elementos e desenhos da cena aberta (sem cenas, os que não têm cena). */
const elementosDaCena = (c: { id: number }, m: { cena_id: number | null }) =>
  db.prepare('SELECT * FROM mapa_elementos WHERE campanha_id = ? AND cena_id IS ? ORDER BY ordem, id').all(c.id, m.cena_id) as Elemento[];
const desenhosDaCena = (c: { id: number }, m: { cena_id: number | null }) =>
  db.prepare('SELECT * FROM mapa_desenhos WHERE campanha_id = ? AND cena_id IS ? ORDER BY id').all(c.id, m.cena_id) as DesenhoSalvo[];

/** Peças da cena aberta: os jogadores (que andam junto entre as cenas) e as peças do mestre desta cena. */
const pecasDaCena = (c: { id: number }, m: Mapa) =>
  db.prepare('SELECT * FROM mapa_pecas WHERE campanha_id = ? AND (user_id IS NOT NULL OR cena_id IS NULL OR cena_id = ?) ORDER BY id').all(c.id, m.cena_id ?? -1) as Peca[];
const cenasDe = (id: number) => db.prepare('SELECT * FROM mapa_cenas WHERE campanha_id = ? ORDER BY id').all(id) as Cena[];

/** Névoa da cena aberta já lida (bits, colunas e linhas). */
function nevoaDe(m: Mapa) {
  const { cols, rows } = dimensoesNevoa(m.largura, m.altura, m.grade);
  return { cols, rows, bits: lerNevoa(m.nevoa, cols, rows) };
}
type CriaturaSalva = {
  id: number; campanha_id: number; tipo: 'npc' | 'inimigo'; nome: string; imagem: string | null; versao_img: number; tamanho: number;
  pv_max: number | null; defesa: number | null; ataque: number | null; dano: string; limiar_maior: number | null; limiar_grave: number | null; notas: string;
  iniciativa: number | null;
};
type Foto = { imagem: string; versao: number };

/** Segredo que assina os links e as sessões do mapa: sorteado na primeira vez e guardado no banco. */
function segredo() {
  const salvo = (db.prepare("SELECT valor FROM bot_estado WHERE chave = 'mapa_segredo'").get() as { valor: string } | undefined)?.valor;
  if (salvo) return salvo;
  const novo = randomBytes(32).toString('hex');
  db.prepare("INSERT INTO bot_estado (chave, valor) VALUES ('mapa_segredo', ?)").run(novo);
  return novo;
}

/** Link pessoal de quem rodou o /sessao mapa (vale 1 hora; ao abrir, vira uma sessão de 7 dias). */
export function linkDoMapa(campanhaId: number, userId: string, duracao?: number) {
  return `${ENDERECO}/m/${campanhaId}?${new URLSearchParams(assinarLink(segredo(), campanhaId, userId, Date.now(), duracao))}`;
}

const campanhaPorId = (id: number) => db.prepare('SELECT * FROM campanhas WHERE id = ?').get(id) as Campanha | undefined;
const idsJogadores = (id: number) => (db.prepare('SELECT user_id FROM campanha_personagens WHERE campanha_id = ? ORDER BY rowid').all(id) as { user_id: string }[]).map((r) => r.user_id);
const fichaDe = (c: Campanha, u: string) =>
  db.prepare(`SELECT * FROM ${TABELA_FICHA[c.sistema]} WHERE guild_id = ? AND user_id = ?`).get(c.guild_id, u) as Record<string, unknown> | undefined;
const fotoDe = (c: Campanha, u: string) =>
  db.prepare('SELECT imagem, versao FROM personagem_fotos WHERE guild_id = ? AND user_id = ? AND sistema = ?').get(c.guild_id, u, c.sistema) as Foto | undefined;
const criaturasDe = (id: number) => db.prepare('SELECT * FROM campanha_criaturas WHERE campanha_id = ? ORDER BY tipo, nome COLLATE NOCASE').all(id) as CriaturaSalva[];
const criaturaPorId = (c: Campanha, id: unknown) =>
  db.prepare('SELECT * FROM campanha_criaturas WHERE id = ? AND campanha_id = ?').get(Number(id), c.id) as CriaturaSalva | undefined;
const pecaDoMestre = (c: Campanha, id: unknown) =>
  db.prepare('SELECT * FROM mapa_pecas WHERE id = ? AND campanha_id = ? AND user_id IS NULL').get(Number(id), c.id) as Peca | undefined;

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
    // Quem ainda não criou a ficha (agora ela nasce no próprio mapa) aparece como "Novo personagem".
    const nome = String(fichaDe(c, u)?.nome ?? 'Novo personagem');
    const atual = existentes.find((p) => p.user_id === u);
    if (atual) {
      if (atual.nome !== nome) db.prepare('UPDATE mapa_pecas SET nome = ? WHERE id = ?').run(nome, atual.id);
      continue;
    }
    const { x, y } = posicaoInicial(n++, m.grade);
    db.prepare('INSERT OR IGNORE INTO mapa_pecas (campanha_id, user_id, nome, x, y) VALUES (?, ?, ?, ?, ?)').run(c.id, u, nome, x, y);
  }
}

// ---------- Imagens ----------

const assinarArquivo = (arquivo: string) => createHmac('sha256', segredo()).update(`img:${arquivo}`).digest('base64url').slice(0, 24);
/** Endereço aberto (sem login) de uma imagem do mapa, para o Discord buscar a foto do personagem no webhook. */
const imagemPublica = (arquivo: string | null | undefined) =>
  arquivo && SEGURO ? `${ENDERECO}/img/${encodeURIComponent(arquivo)}?k=${assinarArquivo(arquivo)}` : null;

function salvarImagem(dados: Buffer, prefixo: string) {
  const tipo = tipoImagem(dados);
  if (!tipo) return null;
  mkdirSync(PASTA, { recursive: true });
  const arquivo = `${prefixo}-${Date.now()}.${tipo.ext}`;
  writeFileSync(`${PASTA}/${arquivo}`, dados);
  return arquivo;
}
const apagarImagem = (arquivo: string | null | undefined) => {
  if (arquivo) rmSync(`${PASTA}/${arquivo}`, { force: true });
};

function servirImagem(res: ServerResponse, arquivo: string | null | undefined) {
  try {
    if (!arquivo || arquivo.includes('/') || arquivo.includes('\\')) throw new Error('sem imagem');
    const dados = readFileSync(`${PASTA}/${arquivo}`);
    const tipo = tipoImagem(dados);
    if (!tipo) throw new Error('arquivo inválido');
    res.writeHead(200, { 'Content-Type': tipo.mime, 'Cache-Control': 'private, max-age=31536000', 'X-Content-Type-Options': 'nosniff' });
    return void res.end(dados);
  } catch {
    return json(res, 404, { erro: 'Sem imagem.' });
  }
}

// ---------- Livro de regras (um PDF por servidor e sistema, consultado pelo mapa) ----------

const PASTA_LIVROS = 'dados/livros';
// O túnel da Cloudflare recusa envios acima de 100 MB; livros maiores são copiados direto para dados/livros.
export const LIMITE_LIVRO = 95 * 1024 * 1024;
export const arquivoLivro = (c: { guild_id: string; sistema: string }) => `${PASTA_LIVROS}/${c.guild_id}-${c.sistema}.pdf`;

function infoLivro(c: Campanha) {
  try {
    const st = statSync(arquivoLivro(c));
    return st.isFile() && st.size > 0 ? { tamanho: st.size, versao: Math.floor(st.mtimeMs) } : null;
  } catch {
    return null;
  }
}

/** Faixa pedida no cabeçalho Range ("bytes=ini-fim", "bytes=ini-" ou "bytes=-últimos"); null = o arquivo todo; 'invalida' = 416. */
export function faixaPedida(range: string | undefined, total: number): { ini: number; fim: number } | null | 'invalida' {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range?.trim() ?? '');
  if (!m || (!m[1] && !m[2])) return null;
  let ini: number, fim: number;
  if (!m[1]) {
    ini = Math.max(0, total - Number(m[2]));
    fim = total - 1;
  } else {
    ini = Number(m[1]);
    fim = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
  }
  return ini > fim || ini >= total ? 'invalida' : { ini, fim };
}

/** Entrega o PDF em pedaços (Range): o leitor do navegador abre as páginas sem baixar o livro inteiro antes. */
function servirLivro(req: IncomingMessage, res: ServerResponse, c: Campanha) {
  const info = infoLivro(c);
  if (!info) return json(res, 404, { erro: 'Esta mesa ainda não tem o livro de regras.' });
  const total = info.tamanho;
  const etag = `"${info.versao}-${total}"`;
  const base = {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="Livro-${c.sistema === 'dh' ? 'Daggerheart' : 'DnD'}.pdf"`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=86400',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  };
  // If-Range com outra versão: manda o arquivo todo de novo.
  const ifRange = req.headers['if-range'];
  const faixa = ifRange && ifRange !== etag ? null : faixaPedida(req.headers.range, total);
  if (faixa === 'invalida') {
    res.writeHead(416, { 'Content-Range': `bytes */${total}` });
    return void res.end();
  }
  const { ini, fim } = faixa ?? { ini: 0, fim: total - 1 };
  res.writeHead(faixa ? 206 : 200, { ...base, 'Content-Length': fim - ini + 1, ...(faixa ? { 'Content-Range': `bytes ${ini}-${fim}/${total}` } : {}) });
  if (req.method === 'HEAD') return void res.end();
  const leitura = createReadStream(arquivoLivro(c), { start: ini, end: fim });
  leitura.on('error', () => res.destroy());
  res.on('close', () => leitura.destroy());
  leitura.pipe(res);
}

/** Grava o corpo do pedido direto no disco (sem guardar tudo na memória), parando se passar do limite. */
function gravarCorpo(req: IncomingMessage, destino: string, limite: number) {
  return new Promise<number>((ok, falha) => {
    let total = 0;
    const saida = createWriteStream(destino);
    req.on('data', (p: Buffer) => {
      total += p.length;
      if (total > limite) {
        req.unpipe(saida);
        saida.destroy();
        falha(new Error('grande'));
      }
    });
    req.on('error', falha);
    saida.on('error', falha);
    saida.on('finish', () => ok(total));
    req.pipe(saida);
  });
}

// ---------- Cartas do Daggerheart (imagens em dados/cartas/dh, fora do repositório) ----------

const PASTA_CARTAS = 'dados/cartas/dh';
const temImagensDeCartas = () => existsSync(`${PASTA_CARTAS}/p`);
const cartasDe = (c: { guild_id: string }, u: string) =>
  (db.prepare('SELECT carta, lugar, usada FROM personagem_cartas WHERE guild_id = ? AND user_id = ? ORDER BY criada_em').all(c.guild_id, u) as { carta: string; lugar: CartaDoPersonagem['lugar']; usada: number }[])
    .filter((m) => CARTA.has(m.carta))
    .map((m) => ({ carta: m.carta, lugar: m.lugar, usada: !!m.usada }));
const extrasDe = (c: { guild_id: string }, u: string) =>
  (db.prepare('SELECT extras FROM personagem_cartas_extras WHERE guild_id = ? AND user_id = ?').get(c.guild_id, u) as { extras: number } | undefined)?.extras ?? 0;
/** Cartas de domínio extras: as que o mestre libera e as que o jogador ganhou como avanço ao subir de nível (na guia da ficha). */
function extrasTotais(c: { guild_id: string }, u: string, ficha: Record<string, unknown> | undefined) {
  let doAvanco = 0;
  try {
    const g = JSON.parse(String(ficha?.guia || '{}')) as { cartasAvanco?: number };
    doAvanco = Math.max(0, Math.min(10, Math.floor(Number(g.cartasAvanco) || 0)));
  } catch {}
  return extrasDe(c, u) + doAvanco;
}
const assinarCarta = (id: string) => assinarArquivo(`carta:${id}`);
/** Endereço aberto (assinado) da imagem da carta, para o Discord mostrar no webhook. */
const cartaPublica = (id: string) => (SEGURO && temImagensDeCartas() ? `${ENDERECO}/carta/${id}.jpg?k=${assinarCarta(id)}` : null);

function servirCarta(res: ServerResponse, tamanho: string, id: string) {
  if (!CARTA.has(id) || !/^[pg]$/.test(tamanho)) return json(res, 404, { erro: 'Carta não encontrada.' });
  try {
    const dados = readFileSync(`${PASTA_CARTAS}/${tamanho}/${id}.jpg`);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=604800', 'X-Content-Type-Options': 'nosniff' });
    return void res.end(dados);
  } catch {
    return json(res, 404, { erro: 'A imagem desta carta não está no servidor.' });
  }
}

/** Cartas do personagem e o que a ficha permite (para a prancheta). */
function pranchetaDe(c: Campanha, u: string) {
  const ficha = fichaDe(c, u), minhas = cartasDe(c, u), extras = extrasTotais(c, u, ficha);
  return { minhas, extras, limites: limites({ classe: ficha?.classe as string, nivel: ficha?.nivel as number }, minhas, extras), tocados: dominiosTocados(minhas) };
}

// ---------- Tempo real (SSE): quem está com a página aberta recebe o aviso quando alguém mexe ----------

type Ouvinte = { res: ServerResponse; userId: string };
const ouvintes = new Map<number, Set<Ouvinte>>();

/** "estado" recarrega mapa e peças; "chat" recarrega só o chat. Rolagem escondida avisa só o mestre. */
// Número de cada mudança (estado e chat) por campanha: a página pergunta só "mudou?" (pulso) e baixa o resto
// apenas quando muda. O BOOT muda a cada vez que o bot liga, para a página não confundir os números.
const BOOT = randomBytes(4).toString('hex');
const versoes = new Map<number, { estado: number; chat: number }>();
function avisar(campanhaId: number, oQue: 'estado' | 'chat', soMestre = false) {
  const v = versoes.get(campanhaId) ?? { estado: 0, chat: 0 };
  v[oQue]++;
  versoes.set(campanhaId, v);
  const mestre = soMestre ? campanhaPorId(campanhaId)?.mestre_id : undefined;
  for (const o of ouvintes.get(campanhaId) ?? []) {
    if (!soMestre || o.userId === mestre) o.res.write(`data: ${oQue}\n\n`);
  }
}

/** Para o bot avisar as telas abertas quando a campanha muda pelo Discord (jogador entrou/saiu, mestre trocou). */
// Pings e efeitos ficam guardados por alguns segundos com um número: quem não recebe o tempo real
// (o túnel às vezes segura o SSE) busca pelo efeitos/<n> e a página ignora os repetidos.
const recentes = new Map<number, { seq: number; tipo: string; dados: string; em: number }[]>();
let seqEfeito = 0;
function transmitir(campanhaId: number, tipo: 'ping' | 'efeito', json: string) {
  const seq = ++seqEfeito, dados = json.replace(/^\{/, `{"seq":${seq},`), agora = Date.now();
  const lista = (recentes.get(campanhaId) ?? []).filter((e) => agora - e.em < 15_000).slice(-150);
  lista.push({ seq, tipo, dados, em: agora });
  recentes.set(campanhaId, lista);
  for (const o of ouvintes.get(campanhaId) ?? []) o.res.write(`data: ${tipo}:${dados}\n\n`);
}
const efeitosDesde = (campanhaId: number, desde: number) =>
  (recentes.get(campanhaId) ?? []).filter((e) => e.seq > desde && Date.now() - e.em < 15_000).map((e) => ({ tipo: e.tipo, dados: e.dados }));

export const avisarMapa = (campanhaId: number) => avisar(campanhaId, 'estado');

/** Aviso grande na tela de todos que estão com o mapa aberto (sessão começou, sessão encerrada...). */
export function anunciarNoMapa(campanhaId: number, aviso: { titulo: string; texto: string; tipo: 'inicio' | 'fim' }) {
  transmitir(campanhaId, 'efeito', JSON.stringify({ tipo: 'anuncio', titulo: aviso.titulo, texto: aviso.texto, momento: aviso.tipo }));
  avisar(campanhaId, 'estado');
}

// ---------- Ponte com os bardos (música da mesa) ----------
// Os bardos rodam no PC de casa e entram por um túnel SSH (ponteNuvem.ts): só aceitamos conexão local, sem cabeçalho
// da Cloudflare (quem vem da internet passa por ela) e com a chave de dados/bardos.chave.

const ARQUIVO_CHAVE = 'dados/bardos.chave';
let chaveBardos = '';
const pontes = new Set<ServerResponse>();
const pendentes = new Map<string, (r: { ok: boolean; msg: string }) => void>();
let filasBardos: FilaTocando[] = [];

function prepararChaveBardos() {
  try {
    chaveBardos = readFileSync(ARQUIVO_CHAVE, 'utf8').trim();
  } catch {
    // primeira vez
  }
  if (chaveBardos.length < 32) {
    chaveBardos = randomBytes(32).toString('hex');
    mkdirSync('dados', { recursive: true });
    writeFileSync(ARQUIVO_CHAVE, chaveBardos, { mode: 0o600 });
  }
}

function ehBardo(req: IncomingMessage) {
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  const deFora = !!(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['cf-ray']);
  const veio = Buffer.from(String(req.headers['x-bardos'] ?? ''));
  const certa = Buffer.from(chaveBardos);
  return local && !deFora && !!chaveBardos && veio.length === certa.length && timingSafeEqual(veio, certa);
}

/** IDs dos bardos (a ponte do PC de casa conta ao conectar; fica guardado para o /sessao iniciar). */
export const idsDosBardos = () =>
  String((db.prepare("SELECT valor FROM bot_estado WHERE chave = 'bardos_ids'").get() as { valor: string } | undefined)?.valor ?? '')
    .split(',')
    .filter((x) => /^\d{17,20}$/.test(x));

/** Libera a call (e o canal de texto, para avisarem o que tocam) da campanha para os bardos. Devolve quantos ficaram sem acesso. */
export async function liberarBardos(canais: { voz?: string | null; texto?: string | null }) {
  const ids = idsDosBardos();
  let falhas = 0;
  for (const [id, regras] of [
    [canais.voz, { ViewChannel: true, Connect: true, Speak: true }],
    [canais.texto, { ViewChannel: true, SendMessages: true, EmbedLinks: true, ReadMessageHistory: true }],
  ] as const) {
    if (!id || !ids.length) continue;
    const canal = await discord?.channels.fetch(id).catch(() => null);
    if (!canal || !('permissionOverwrites' in canal)) continue;
    for (const bardo of ids) {
      if (canal.permissionOverwrites.cache.has(bardo)) continue;
      await canal.permissionOverwrites.edit(bardo, regras, { type: OverwriteType.Member, reason: 'Bardos tocam na call da mesa' }).catch((e: Error) => {
        falhas++;
        console.error('[mapa] não consegui liberar a call para o bardo:', e.message);
      });
    }
  }
  return falhas;
}

const REACOES_MAPA = ['👍', '👎', '😂', '😱', '😡', '❤️', '🤔', '🎉', '💀', '🙏'];
const ultimoEfeito = new Map<string, number>();

/** Manda um pedido de música aos bardos e espera a resposta (ou desiste em 25 s). */
function pedirAosBardos(pedido: PedidoMusica): Promise<{ ok: boolean; msg: string }> {
  const ponte = [...pontes][0];
  if (!ponte) return Promise.resolve({ ok: false, msg: 'Os bardos estão sem ligação com o mapa (o PC da música está desligado?).' });
  const id = randomBytes(6).toString('hex');
  ponte.write(`data: ${JSON.stringify({ id, ...pedido })}\n\n`);
  return new Promise((ok) => {
    pendentes.set(id, ok);
    setTimeout(() => {
      if (pendentes.delete(id)) ok({ ok: false, msg: 'Os bardos não responderam a tempo.' });
    }, 25_000).unref();
  });
}

/** O que está tocando na call da mesa (para o painel do mestre). */
function musicaDaMesa(c: Campanha) {
  return {
    ponte: pontes.size > 0,
    fila: c.canal_voz_id ? (filasBardos.find((f) => f.guildId === c.guild_id && f.canalId === c.canal_voz_id) ?? null) : null,
    temCall: !!c.canal_voz_id,
    ambientes: Object.entries(AMBIENTES).map(([id, a]) => ({ id, nome: a.nome })),
  };
}

async function tratarBardos(req: IncomingMessage, res: ServerResponse, rota: string) {
  if (!ehBardo(req)) return json(res, 401, { erro: 'Não autorizado.' });
  if (rota === '/bardos/eventos' && req.method === 'GET') {
    const ids = String(req.headers['x-bardos-ids'] ?? '').split(',').map((x) => x.trim()).filter((x) => /^\d{17,20}$/.test(x)).slice(0, 5);
    if (ids.length) db.prepare("INSERT INTO bot_estado (chave, valor) VALUES ('bardos_ids', ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").run(ids.join(','));
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': ponte\n\n');
    pontes.add(res);
    const bate = setInterval(() => res.write(': ok\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(bate);
      pontes.delete(res);
    });
    return;
  }
  if (rota === '/bardos/resposta' && req.method === 'POST') {
    const b = await lerJson<{ id: string; ok: boolean; msg: string; estado: FilaTocando[] }>(req, 64_000);
    if (Array.isArray(b.estado)) {
      const antes = JSON.stringify(filasBardos);
      filasBardos = b.estado;
      // Mudou o que toca: as telas dos mestres atualizam o painel de música.
      if (JSON.stringify(filasBardos) !== antes) for (const id of ouvintes.keys()) avisar(id, 'estado', true);
    }
    if (b.id) pendentes.get(b.id)?.({ ok: !!b.ok, msg: String(b.msg ?? '') });
    if (b.id) pendentes.delete(b.id);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { erro: 'Não achei.' });
}

const ultimoPing = new Map<string, number>();

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

const urlFoto = (c: Campanha, u: string, f: Foto) => `/api/m/${c.id}/foto/${u}?v=${f.versao}`;
const urlCriatura = (c: Campanha, cr: CriaturaSalva) => (cr.imagem ? `/api/m/${c.id}/criatura-imagem/${cr.id}?v=${cr.versao_img}` : null);

/** Ficha que o mestre vê numa peça da biblioteca (cada cópia tem a sua vida). */
function fichaDaCriatura(cr: CriaturaSalva, p: Peca) {
  return {
    tipo: cr.tipo,
    pv_atual: cr.pv_max === null ? null : (p.pv ?? cr.pv_max),
    pv_max: cr.pv_max,
    defesa: cr.defesa,
    ataque: cr.ataque,
    dano: cr.dano,
    limiar_maior: cr.limiar_maior,
    limiar_grave: cr.limiar_grave,
    notas: cr.notas,
    iniciativa: cr.iniciativa,
  };
}

/** Vida de uma peça do mestre como os jogadores a veem (o mestre escolhe: escondida, só o estado ou o número). */
function vidaParaJogadores(m: Mapa, cr: CriaturaSalva | undefined, p: Peca) {
  if (!cr || cr.pv_max === null || m.vida_inimigos === 'escondida') return null;
  const restante = p.pv ?? cr.pv_max;
  return m.vida_inimigos === 'exata'
    ? { frac: Math.max(0, Math.min(1, restante / cr.pv_max)), texto: `${restante}/${cr.pv_max} PV` }
    : { frac: null, texto: estadoDaVida(restante, cr.pv_max) };
}
const lerMedo = (g: string) => (db.prepare('SELECT medo FROM dh_medo WHERE guild_id = ?').get(g) as { medo: number } | undefined)?.medo ?? 0;

function handoutDe(c: Campanha, id: number | null) {
  const h = id ? (db.prepare('SELECT id, titulo FROM mapa_handouts WHERE id = ? AND campanha_id = ?').get(id, c.id) as { id: number; titulo: string } | undefined) : undefined;
  return h ? { id: h.id, titulo: h.titulo, url: `/api/m/${c.id}/handout-imagem/${h.id}` } : null;
}

async function montarEstado(c: Campanha, userId: string) {
  const m = mapaDe(c.id);
  sincronizarPecas(c, m);
  const souMestre = c.mestre_id === userId;
  const nevoa = m.nevoa_ligada ? nevoaDe(m) : null;
  // Os jogadores nem recebem as peças do mestre escondidas ou debaixo da névoa (não dá para espiar pelo navegador).
  const pecas = pecasDaCena(c, m).filter(
    (p) => souMestre || p.user_id || (!m.cortina && !p.escondida && !(nevoa && pecaNaNevoa(nevoa.bits, nevoa.cols, nevoa.rows, m.grade, p.x, p.y))),
  );
  const cenaAtiva = m.cena_id ? (db.prepare('SELECT nome FROM mapa_cenas WHERE id = ?').get(m.cena_id) as { nome: string } | undefined) : undefined;
  const criaturas = criaturasDe(c.id);
  const porCriatura = new Map(criaturas.map((cr) => [cr.id, cr]));
  const donos = new Map<string, Awaited<ReturnType<typeof quem>>>();
  const ids = new Set([c.mestre_id, userId, ...pecas.map((p) => p.user_id).filter((u): u is string => !!u)]);
  await Promise.all([...ids].map(async (u) => donos.set(u, await quem(c.guild_id, u))));
  const minha = pecas.find((p) => p.user_id === userId);

  return {
    campanha: { nome: c.nome, sistema: c.sistema, mestre: donos.get(c.mestre_id)?.nome ?? 'Mestre', mestreId: c.mestre_id, mestreAvatar: donos.get(c.mestre_id)?.avatar ?? null, discord: linkDiscord(c) },
    voce: { id: userId, mestre: souMestre, jogador: !!minha, pecaId: minha?.id ?? null, temFicha: !!fichaDe(c, userId), ...donos.get(userId)! },
    mapa: {
      versao: m.versao, temImagem: !!m.imagem, largura: m.largura, altura: m.altura, grade: m.grade,
      nevoa: nevoa ? { cols: nevoa.cols, rows: nevoa.rows, bits: gravarNevoa(nevoa.bits) } : null,
      cena: cenaAtiva?.nome ?? null,
      visao: m.visao,
      cortina: !!m.cortina,
      gif: /\.gif$/i.test(m.imagem ?? ''),
    },
    handout: handoutDe(c, m.handout_id),
    livro: (() => {
      const l = infoLivro(c);
      return l ? { tamanho: l.tamanho, url: `/api/m/${c.id}/livro?v=${l.versao}` } : null;
    })(),
    handouts: (db.prepare('SELECT id FROM mapa_handouts WHERE campanha_id = ? ORDER BY id DESC').all(c.id) as { id: number }[]).map((h) => handoutDe(c, h.id)),
    musica: souMestre ? musicaDaMesa(c) : null,
    diario: (db.prepare('SELECT id, inicio, fim, mensagens, rolagens, notas FROM campanha_sessoes WHERE campanha_id = ? ORDER BY inicio DESC LIMIT 100').all(c.id) as Record<string, unknown>[]).map((s) => ({ ...s })),
    grupo: {
      ouro: (db.prepare('SELECT ouro FROM campanhas WHERE id = ?').get(c.id) as { ouro: number }).ouro,
      itens: (db.prepare('SELECT id, item, qtd FROM campanha_inventario WHERE campanha_id = ? ORDER BY item COLLATE NOCASE').all(c.id) as Record<string, unknown>[]).map((i) => ({ ...i })),
    },
    cenas: souMestre ? cenasDe(c.id).map((cn) => ({ id: cn.id, nome: cn.nome, ativa: cn.id === m.cena_id, ambiente: cn.ambiente, notas: cn.notas })) : [],
    ...estadoDaMesa({ c, userId, souMestre }),
    // Elementos (imagens soltas) e desenhos do mestre: os escondidos só o mestre recebe; com a cortina fechada, ninguém.
    elementos: elementosDaCena(c, m).filter((e) => souMestre || (!e.oculto && !m.cortina)).map((e) => ({
      id: e.id, x: e.x, y: e.y, largura: e.largura, altura: e.altura, rotacao: e.rotacao, oculto: !!e.oculto,
      url: `/api/m/${c.id}/elemento-imagem/${e.id}?a=${encodeURIComponent(e.imagem)}`, gif: /\.gif$/i.test(e.imagem),
    })),
    desenhos: desenhosDaCena(c, m).filter((d) => souMestre || (!d.oculto && !m.cortina)).map((d) => ({
      id: d.id, tipo: d.tipo, pontos: JSON.parse(d.pontos) as [number, number][], cor: d.cor, espessura: d.espessura, preenchido: !!d.preenchido, oculto: !!d.oculto,
    })),
    pecas: pecas.map((p) => {
      const meu = p.user_id === userId;
      const cr = p.criatura_id ? porCriatura.get(p.criatura_id) : undefined;
      // A ficha completa só aparece para o dono da peça e para o mestre; os outros veem nome, classe e nível.
      const ficha = p.user_id ? fichaDe(c, p.user_id) : undefined;
      let dadosFicha: Record<string, unknown> | null = null;
      let prancheta: ReturnType<typeof pranchetaDe> | null = null;
      if (ficha) {
        const { guild_id: _g, user_id: _u, ...resto } = ficha;
        // O grupo vê a vida dos companheiros; o resto da ficha fica com o dono e o mestre.
        dadosFicha = meu || souMestre ? resto : { nome: resto.nome, classe: resto.classe, nivel: resto.nivel, pv: resto.pv, pv_atual: resto.pv_atual, pv_max: resto.pv_max };
        if ((meu || souMestre) && c.sistema === 'dh' && p.user_id) prancheta = pranchetaDe(c, p.user_id);
      } else if (cr && souMestre) dadosFicha = fichaDaCriatura(cr, p);
      const foto = p.user_id ? fotoDe(c, p.user_id) : undefined;
      let avatar: string | null;
      if (p.user_id) avatar = foto ? urlFoto(c, p.user_id, foto) : (donos.get(p.user_id)?.avatar ?? null);
      else if (p.imagem) avatar = `/api/m/${c.id}/peca-imagem/${p.id}?v=${p.versao_img}`;
      else avatar = cr ? urlCriatura(c, cr) : null;
      return {
        id: p.id,
        nome: p.nome,
        x: p.x,
        y: p.y,
        npc: !p.user_id,
        tipo: p.user_id ? 'jogador' : p.tipo === 'inimigo' ? 'inimigo' : 'npc',
        userId: p.user_id,
        criaturaId: cr?.id ?? null,
        meu,
        podeMover: souMestre || meu,
        jogador: p.user_id ? (donos.get(p.user_id)?.nome ?? null) : null,
        tamanho: p.tamanho,
        avatar,
        imagemPropria: !!p.imagem,
        // GIF animado: a página redesenha o mapa sem parar enquanto houver um na tela.
        gif: /\.gif$/i.test((p.user_id ? foto?.imagem : p.imagem ?? cr?.imagem) ?? ''),
        ficha: dadosFicha,
        vida: !p.user_id && !souMestre ? vidaParaJogadores(m, cr, p) : null,
        condicoes: p.condicoes ? p.condicoes.split(',') : [],
        iniciativa: p.iniciativa,
        agiu: !!p.agiu,
        escondida: !!p.escondida,
        prancheta,
      };
    }),
    combate: {
      ativo: !!m.combate,
      rodada: m.rodada,
      vez: m.vez,
      ordem: m.combate ? ordenarIniciativa(pecas).map((p) => p.id) : [],
    },
    medo: c.sistema === 'dh' ? lerMedo(c.guild_id) : null,
    vidaInimigos: souMestre ? m.vida_inimigos : undefined,
    // A biblioteca de NPCs e inimigos é só do mestre: os jogadores não sabem o que vem pela frente.
    biblioteca: souMestre
      ? criaturas.map((cr) => ({
          id: cr.id, tipo: cr.tipo, nome: cr.nome, tamanho: cr.tamanho, pv_max: cr.pv_max, defesa: cr.defesa, ataque: cr.ataque, dano: cr.dano,
          limiar_maior: cr.limiar_maior, limiar_grave: cr.limiar_grave, notas: cr.notas, iniciativa: cr.iniciativa, avatar: urlCriatura(c, cr),
          noMapa: pecas.filter((p) => p.criatura_id === cr.id).length,
        }))
      : [],
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

// ---------- Espelho no Discord (webhook com o nome e a foto de quem fala) ----------

const webhooks = new Map<string, Webhook>();

async function webhookDe(canal: TextChannel) {
  const salvo = webhooks.get(canal.id);
  if (salvo) return salvo;
  const lista = await canal.fetchWebhooks();
  const meu =
    lista.find((w) => w.owner?.id === discord?.user?.id && !!w.token) ??
    (await canal.createWebhook({ name: 'Mesa da Taverna', reason: 'Mensagens do mapa com o nome e a foto do personagem' }));
  webhooks.set(canal.id, meu);
  return meu;
}

/** Quem "fala" no Discord: o NPC (pela peça), o personagem do jogador (nome e foto da ficha) ou o mestre. */
async function personaDe(c: Campanha, userId: string, pecaId: number | null | undefined) {
  if (pecaId) {
    const npc = db.prepare('SELECT * FROM mapa_pecas WHERE id = ? AND campanha_id = ?').get(pecaId, c.id) as Peca | undefined;
    const cr = npc?.criatura_id ? criaturaPorId(c, npc.criatura_id) : undefined;
    if (npc) return { nome: npc.nome, avatar: imagemPublica(npc.imagem ?? cr?.imagem) };
  }
  const eu = await quem(c.guild_id, userId);
  if (c.mestre_id === userId) return { nome: `${eu.nome} (mestre)`, avatar: eu.avatar };
  const ficha = fichaDe(c, userId);
  return { nome: String(ficha?.nome ?? eu.nome), avatar: imagemPublica(fotoDe(c, userId)?.imagem) ?? eu.avatar };
}

type Fala = { userId: string; pecaId: number | null | undefined; autor: string; tipo: LinhaChat['tipo']; texto: string; resultado: ResultadoLinha | null };

/** Manda ao canal do Discord ligado à campanha (se houver) o que foi dito no chat do mapa. */
async function espelharNoDiscord(c: Campanha, f: Fala, revelada = false) {
  if (!c.canal_id) return;
  const canal = await discord?.channels.fetch(c.canal_id).catch(() => null);
  if (!canal?.isTextBased() || !('send' in canal)) return;
  const olho = revelada ? '👁️ ' : '';
  // Carta usada: vai com a imagem dela (endereço assinado; só com o mapa em https).
  const imagemCarta = f.resultado?.tipo === 'carta' ? cartaPublica(f.resultado.id) : null;
  const embeds = imagemCarta && f.resultado?.tipo === 'carta' ? [{ title: f.resultado.nome, image: { url: imagemCarta }, color: 0xd9a441 }] : [];
  if (canal.type === ChannelType.GuildText) {
    try {
      const p = await personaDe(c, f.userId, f.pecaId);
      const nome = nomeDeWebhook(p.nome);
      if (nome) {
        const w = await webhookDe(canal);
        await w.send({ content: (olho + textoDoPersonagem(f.tipo, f.texto, f.resultado)).slice(0, 1900), username: nome, avatarURL: p.avatar ?? undefined, embeds, allowedMentions: { parse: [] } });
        return;
      }
    } catch (e) {
      // Sem permissão de webhook ou webhook apagado à mão: esquece o guardado e manda como o bot mesmo.
      webhooks.delete(canal.id);
      console.error('[mapa] webhook do canal:', (e as Error).message);
    }
  }
  let conteudo = textoParaDiscord(f.autor, f.tipo, f.texto, f.resultado);
  if (revelada) conteudo = conteudo.replace(/^(\S+)/, '$1 👁️');
  await canal.send({ content: conteudo.slice(0, 1900), embeds, allowedMentions: { parse: [] } }).catch((e: Error) => console.error('[mapa] não consegui escrever no canal do Discord:', e.message));
}

/** Grava uma linha no chat da mesa, avisa as telas abertas e (se não for escondida) repete no canal do Discord. */
function gravarChat(c: Campanha, userId: string, autor: string, tipo: LinhaChat['tipo'], texto: string, resultado: ResultadoLinha | null, secreta: boolean, paraDiscord = true, pecaId: number | null = null) {
  db.prepare('INSERT INTO mapa_chat (campanha_id, user_id, autor, tipo, texto, resultado, secreta, criada_em, peca_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    c.id,
    userId,
    autor,
    tipo,
    texto,
    resultado ? JSON.stringify(resultado) : null,
    secreta ? 1 : 0,
    Date.now(),
    pecaId,
  );
  // Guarda só as últimas mensagens de cada mesa.
  db.prepare('DELETE FROM mapa_chat WHERE campanha_id = ? AND id <= (SELECT id FROM mapa_chat WHERE campanha_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)').run(c.id, c.id, HISTORICO * 2);
  avisar(c.id, 'chat', secreta);
  if (paraDiscord && !secreta) void espelharNoDiscord(c, { userId, pecaId, autor, tipo, texto, resultado });
}

/** Mensagem escrita no canal do Discord ligado a uma campanha: aparece no chat do mapa (só de quem está na mesa). */
export async function aoMensagemDiscord(m: Message) {
  if (m.author.bot || m.webhookId || !m.inGuild() || !m.content) return;
  const c = db.prepare('SELECT * FROM campanhas WHERE guild_id = ? AND canal_id = ?').get(m.guildId, m.channelId) as Campanha | undefined;
  if (!c || (c.mestre_id !== m.author.id && !idsJogadores(c.id).includes(m.author.id))) return;
  const texto = m.cleanContent.trim().slice(0, LIMITE_TEXTO);
  if (!texto) return;
  await falarComoPersonagem(c, m);
  gravarChat(c, m.author.id, await autorDe(c, m.author.id), 'msg', texto, null, false, false);
}

/**
 * O jogador escreveu direto no canal: a mensagem é refeita pelo webhook com o nome e a foto do personagem e a original sai.
 * Fica como está quando é do mestre, fora do personagem ("(", "//", "ooc"), resposta, figurinha, enquete,
 * de quem ainda não tem ficha, ou quando o bot não pode gerenciar webhooks e mensagens no canal.
 */
async function falarComoPersonagem(c: Campanha, m: Message<true>) {
  if (c.mestre_id === m.author.id || foraDoPersonagem(m.content)) return false;
  if (m.reference || m.stickers.size || m.poll) return false;
  const canal = m.channel;
  if (canal.type !== ChannelType.GuildText) return false;
  const eu = canal.guild.members.me;
  const pode = eu ? canal.permissionsFor(eu) : null;
  if (!pode?.has(PermissionFlagsBits.ManageWebhooks) || !pode.has(PermissionFlagsBits.ManageMessages)) return false;
  if (!fichaDe(c, m.author.id)?.nome) return false;
  const p = await personaDe(c, m.author.id, null);
  const nome = nomeDeWebhook(p.nome);
  if (!nome) return false;
  try {
    const w = await webhookDe(canal);
    await w.send({
      content: m.content,
      username: nome,
      avatarURL: p.avatar ?? undefined,
      files: [...m.attachments.values()].map((a) => ({ attachment: a.url, name: a.name })),
      allowedMentions: { parse: [] },
    });
  } catch (e) {
    // Webhook apagado ou anexo grande demais: a mensagem original fica.
    webhooks.delete(canal.id);
    console.error('[mapa] não consegui refazer a fala como o personagem:', (e as Error).message);
    return false;
  }
  await m.delete().catch((e: Error) => console.error('[mapa] não consegui apagar a fala original:', e.message));
  return true;
}

// ---------- Ficha do jogador (criada no mapa) ----------

function salvarFichaDH(c: Campanha, u: string, f: FichaDH) {
  db.prepare(
    `INSERT INTO fichas_dh
      (guild_id, user_id, nome, classe, ancestralidade, comunidade, nivel, agilidade, forca, acuidade, instinto, presenca, conhecimento,
       evasao, proficiencia, pv_max, pv, estresse_max, estresse, esperanca, armadura_max, armadura, limiar_maior, limiar_grave, experiencias, guia)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 2, ?, 0, ?, ?, ?, ?)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET
       nome = excluded.nome, classe = excluded.classe, ancestralidade = excluded.ancestralidade, comunidade = excluded.comunidade,
       nivel = excluded.nivel, agilidade = excluded.agilidade, forca = excluded.forca, acuidade = excluded.acuidade, instinto = excluded.instinto,
       presenca = excluded.presenca, conhecimento = excluded.conhecimento, evasao = excluded.evasao, proficiencia = excluded.proficiencia,
       pv_max = excluded.pv_max, pv = MIN(fichas_dh.pv, excluded.pv_max), estresse_max = excluded.estresse_max,
       estresse = MIN(fichas_dh.estresse, excluded.estresse_max), armadura_max = excluded.armadura_max,
       armadura = MIN(fichas_dh.armadura, excluded.armadura_max), limiar_maior = excluded.limiar_maior, limiar_grave = excluded.limiar_grave,
       experiencias = excluded.experiencias, guia = excluded.guia`,
  ).run(
    c.guild_id, u, f.nome, f.classe, f.ancestralidade, f.comunidade, f.nivel, f.agilidade, f.forca, f.acuidade, f.instinto, f.presenca, f.conhecimento,
    f.evasao, f.proficiencia, f.pv_max, f.estresse_max, f.armadura_max, f.limiar_maior, f.limiar_grave, f.experiencias, f.guia,
  );
}

function salvarFichaDnd(c: Campanha, u: string, f: FichaDnd) {
  db.prepare(
    `INSERT INTO fichas
      (guild_id, user_id, nome, classe, raca, nivel, forca, destreza, constituicao, inteligencia, sabedoria, carisma,
       pv_max, pv_atual, ca, bba, fort, ref, von, ini_extra, pericias)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')
     ON CONFLICT (guild_id, user_id) DO UPDATE SET
       nome = excluded.nome, classe = excluded.classe, raca = excluded.raca, nivel = excluded.nivel, forca = excluded.forca,
       destreza = excluded.destreza, constituicao = excluded.constituicao, inteligencia = excluded.inteligencia, sabedoria = excluded.sabedoria,
       carisma = excluded.carisma, pv_max = excluded.pv_max, pv_atual = MIN(fichas.pv_atual, excluded.pv_max), ca = excluded.ca,
       bba = excluded.bba, fort = excluded.fort, ref = excluded.ref, von = excluded.von, ini_extra = excluded.ini_extra`,
  ).run(
    c.guild_id, u, f.nome, f.classe, f.raca, f.nivel, f.forca, f.destreza, f.constituicao, f.inteligencia, f.sabedoria, f.carisma,
    f.pv_max, f.pv_max, f.ca, f.bba, f.fort, f.ref, f.von, f.ini_extra,
  );
}

// ---------- Cenas ----------

/**
 * Troca a cena aberta: guarda a de agora (imagem, grade e névoa) na tabela de cenas e traz a outra para a tabela mapas.
 * O combate acaba e os jogadores vão junto, no mesmo lugar (puxados para dentro se o mapa novo for menor).
 */
function abrirCena(c: Campanha, m: Mapa, cena: Cena) {
  if (m.cena_id) {
    db.prepare('UPDATE mapa_cenas SET imagem = ?, largura = ?, altura = ?, grade = ?, nevoa_ligada = ?, nevoa = ? WHERE id = ?').run(
      m.imagem, m.largura, m.altura, m.grade, m.nevoa_ligada, m.nevoa, m.cena_id,
    );
  }
  db.prepare(
    `UPDATE mapas SET imagem = ?, largura = ?, altura = ?, grade = ?, nevoa_ligada = ?, nevoa = ?, cena_id = ?, versao = versao + 1,
     combate = 0, rodada = 0, vez = NULL WHERE campanha_id = ?`,
  ).run(cena.imagem, cena.largura, cena.altura, cena.grade, cena.nevoa_ligada, cena.nevoa, cena.id, c.id);
  db.prepare('UPDATE mapa_pecas SET iniciativa = NULL, agiu = 0 WHERE campanha_id = ?').run(c.id);
  db.prepare('UPDATE mapa_pecas SET x = MIN(x, ?), y = MIN(y, ?) WHERE campanha_id = ? AND user_id IS NOT NULL').run(cena.largura, cena.altura, c.id);
  aoTrocarCena?.(c, cena);
}
/** Gancho para a música da cena (ligado pela ponte com os bardos). */
let aoTrocarCena: ((c: Campanha, cena: Cena) => void) | undefined;

// ---------- Dano do ataque ----------

/** Desconta o dano do alvo (cópia da biblioteca ou personagem de jogador) e diz como ficou, do jeito que a mesa pode ver. */
function aplicarDano(c: Campanha, alvo: Peca, cr: CriaturaSalva | undefined, ficha: Record<string, unknown> | undefined, dano: number) {
  if (cr && cr.pv_max !== null) {
    const perda = perdaDeVida(c.sistema, dano, { maior: cr.limiar_maior, grave: cr.limiar_grave });
    const depois = Math.max(0, (alvo.pv ?? cr.pv_max) - perda);
    db.prepare('UPDATE mapa_pecas SET pv = ? WHERE id = ?').run(depois, alvo.id);
    const modo = mapaDe(c.id).vida_inimigos;
    const como = modo === 'exata' ? `${depois}/${cr.pv_max} PV` : modo === 'estado' ? estadoDaVida(depois, cr.pv_max) : null;
    const marcas = c.sistema === 'dh' ? `${perda} PV marcado${perda === 1 ? '' : 's'}` : null;
    return [marcas, como].filter(Boolean).join(' · ') || null;
  }
  if (ficha && alvo.user_id) {
    if (c.sistema === 'dh') {
      const perda = perdaDeVida('dh', dano, { maior: Number(ficha.limiar_maior), grave: Number(ficha.limiar_grave) });
      const marcados = Math.min(Number(ficha.pv_max), Number(ficha.pv) + perda);
      db.prepare('UPDATE fichas_dh SET pv = ? WHERE guild_id = ? AND user_id = ?').run(marcados, c.guild_id, alvo.user_id);
      if (marcados >= Number(ficha.pv_max) && Number(ficha.pv) < Number(ficha.pv_max)) registrarHistorico(c.guild_id, alvo.user_id, '💀 Marcou o último PV: hora do Movimento de Morte.');
      return `${perda} PV marcado${perda === 1 ? '' : 's'} · ${Number(ficha.pv_max) - marcados}/${ficha.pv_max} livres`;
    }
    const pv = Math.max(-10, Number(ficha.pv_atual) - dano);
    db.prepare('UPDATE fichas SET pv_atual = ? WHERE guild_id = ? AND user_id = ?').run(pv, c.guild_id, alvo.user_id);
    if (pv <= 0 && Number(ficha.pv_atual) > 0) registrarHistorico(c.guild_id, alvo.user_id, `💀 Caiu com ${pv} PV.`);
    return `${pv}/${ficha.pv_max} PV`;
  }
  return null;
}

// ---------- Biblioteca: criar e pôr no mapa (usado pela rota e pelo bestiário) ----------

function criarCriatura(c: Campanha, v: Criatura) {
  const novo = db.prepare(
    `INSERT INTO campanha_criaturas (campanha_id, tipo, nome, tamanho, pv_max, defesa, ataque, dano, limiar_maior, limiar_grave, notas, iniciativa, criada_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(c.id, v.tipo, v.nome, v.tamanho, v.pv_max, v.defesa, v.ataque, v.dano, v.limiar_maior, v.limiar_grave, v.notas, v.iniciativa, Date.now());
  return Number(novo.lastInsertRowid);
}

/** Põe uma cópia da biblioteca no mapa: Goblin, Goblin 2... cada uma com a sua vida. Devolve o erro em texto. */
function colocarCriatura(c: Campanha, crId: number, bx?: unknown, by?: unknown): { peca: number; nome: string } | string {
  const cr = criaturaPorId(c, crId);
  if (!cr) return 'Personagem da biblioteca não encontrado.';
  const m = mapaDe(c.id);
  const pecas = db.prepare('SELECT nome FROM mapa_pecas WHERE campanha_id = ?').all(c.id) as { nome: string }[];
  if (pecas.length >= 200) return 'O mapa já tem 200 peças. Tire algumas antes.';
  const padrao = posicaoInicial(pecas.length, m.grade);
  const x = limitar(bx, 0, m.largura, padrao.x);
  const y = limitar(by, 0, m.altura, padrao.y);
  const nome = nomeDaCopia(cr.nome, pecas.map((p) => p.nome));
  // Entrou no meio de um combate de D&D: já rola a iniciativa e entra na ordem.
  const iniciativa = m.combate && c.sistema === 'dnd' ? rolar('1d20').total + (cr.iniciativa ?? 0) : null;
  const nova = db.prepare('INSERT INTO mapa_pecas (campanha_id, user_id, nome, x, y, tamanho, criatura_id, tipo, pv, iniciativa, cena_id) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    c.id, nome, x, y, cr.tamanho, cr.id, cr.tipo, cr.pv_max, iniciativa, m.cena_id,
  );
  return { peca: Number(nova.lastInsertRowid), nome };
}

/** Com a névoa ligada e a visão dos personagens ativa, o personagem revela as casas em volta ao andar. */
function revelarVisao(c: Campanha, p: { user_id: string | null; x: number; y: number }) {
  if (!p.user_id) return false;
  const m = mapaDe(c.id);
  if (!m.nevoa_ligada || !m.visao) return false;
  const { cols, rows, bits } = nevoaDe(m);
  if (!revelarRaio(bits, cols, rows, Math.floor(p.x / m.grade), Math.floor(p.y / m.grade), m.visao)) return false;
  db.prepare('UPDATE mapas SET nevoa = ? WHERE campanha_id = ?').run(gravarNevoa(bits), c.id);
  return true;
}

/** O que as rotas do mapaMesa.ts usam do mapa. */
function mesaDe(c: Campanha, userId: string, souMestre: boolean): Mesa {
  return {
    c, userId, souMestre,
    avisar: (soMestre = false) => avisar(c.id, 'estado', soMestre),
    falar: async (texto, opcoes = {}) => {
      const quemFala = opcoes.como ?? userId;
      gravarChat(c, quemFala, await autorDe(c, quemFala), 'msg', texto.slice(0, LIMITE_TEXTO), null, false, opcoes.discord ?? true);
    },
    ficha: (u) => fichaDe(c, u),
    jogadores: () => idsJogadores(c.id),
    mapa: () => mapaDe(c.id),
    tocar: async (comando) => {
      if (!c.canal_voz_id) return { ok: false, msg: 'A mesa ainda não tem call: abra a sessão com /sessao iniciar.' };
      await liberarBardos({ voz: c.canal_voz_id, texto: c.canal_id });
      return pedirAosBardos({ ...comando, guildId: c.guild_id, canalVozId: c.canal_voz_id, canalTextoId: c.canal_id });
    },
    abrirCena: async (id) => {
      const cena = db.prepare('SELECT * FROM mapa_cenas WHERE id = ? AND campanha_id = ?').get(id, c.id) as Cena | undefined;
      if (!cena) return false;
      const m = mapaDe(c.id);
      if (m.cena_id !== cena.id) {
        abrirCena(c, m, cena);
        gravarChat(c, userId, await autorDe(c, userId), 'msg', `🎬 Nova cena: ${cena.nome}`, null, false);
      }
      return true;
    },
    mostrarHandout: (id) => {
      if (id && !db.prepare('SELECT 1 FROM mapa_handouts WHERE id = ? AND campanha_id = ?').get(id, c.id)) return false;
      mapaDe(c.id);
      db.prepare('UPDATE mapas SET handout_id = ? WHERE campanha_id = ?').run(id, c.id);
      return true;
    },
    criarCriatura: (v) => criarCriatura(c, v),
    colocarCriatura: (id, x, y) => colocarCriatura(c, id, x, y),
    nomeDe: async (u) => (await quem(c.guild_id, u)).nome,
  };
}
const ROTAS_MESA = /^(area(\/|$)|descanso(\/|$)|musica\/(pedir|cancelar|pedido)$|relogio\/|visao$|cortina$|cena\/notas$|roteiro\/|bestiario\/)/;

// ---------- Servidor HTTP ----------

const PAGINA = readFileSync(new URL('../mapa/pagina.html', import.meta.url), 'utf8');

const json = (res: ServerResponse, status: number, corpo: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
};
/** Endereço do canal da campanha no Discord (ou do servidor), para o botão das páginas de aviso. */
const linkDiscord = (c: Campanha | undefined) => (c ? `https://discord.com/channels/${c.guild_id}${c.canal_id ? '/' + c.canal_id : ''}` : null);

/** Página curta de aviso (link vencido, mesa fechada...), no tema da taverna, com um botão opcional para o Discord. */
const texto = (res: ServerResponse, status: number, titulo: string, msg: string, botao?: { url: string; rotulo: string } | null) => {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titulo}</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box; font-family: Georgia, 'Palatino Linotype', serif;
    background: radial-gradient(ellipse at top, #3a2414, #140b05 70%); color: #2b1a08; }
  .caixa { max-width: 460px; width: 100%; text-align: center; padding: 28px 26px; border-radius: 18px; background: linear-gradient(180deg, #fbf1d8, #ead6a8);
    border: 2px solid #b8862f; box-shadow: 0 20px 60px rgba(0, 0, 0, .6), inset 0 0 30px rgba(122, 82, 24, .25); }
  h1 { margin: 0 0 10px; font-size: 24px; letter-spacing: .03em; } p { margin: 0 0 6px; line-height: 1.5; font-size: 16px; }
  code { background: #3b2814; color: #fbe7b5; padding: 2px 7px; border-radius: 6px; font-size: 14px; }
  a.botao { display: inline-block; margin-top: 16px; padding: 11px 20px; border-radius: 10px; background: linear-gradient(180deg, #ffe39a, #d9a441); color: #2b1a08;
    text-decoration: none; font-weight: 700; border: 1px solid #7a5218; box-shadow: 0 3px 10px rgba(0, 0, 0, .35); }
  .passos { text-align: left; margin: 14px auto 0; max-width: 340px; font-size: 15px; } .passos li { margin: 4px 0; }
</style>
<div class="caixa"><h1>${titulo}</h1><p>${msg}</p>${botao ? `<a class="botao" href="${botao.url}">${botao.rotulo}</a>` : ''}</div></html>`);
};
/** Como voltar para o mapa: o link é pessoal e sai do Discord. */
const VOLTAR = `<ol class="passos"><li>Abra o Discord, no canal da campanha.</li><li>Digite <code>/sessao mapa</code>.</li><li>Clique em <b>Abrir o mapa</b>: o link novo é só seu.</li></ol>`;
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
/** Lê a imagem enviada (peça, criatura ou foto do personagem) e guarda com o prefixo dado. */
async function receberImagem(req: IncomingMessage, res: ServerResponse, prefixo: string) {
  let dados: Buffer;
  try {
    dados = await lerCorpo(req, LIMITE_IMAGEM_PECA);
  } catch {
    json(res, 413, { erro: `Imagem grande demais (máximo ${LIMITE_IMAGEM_PECA / 1024 / 1024} MB).` });
    return null;
  }
  const arquivo = salvarImagem(dados, prefixo);
  if (!arquivo) json(res, 415, { erro: 'Use uma imagem PNG, JPG, WEBP ou GIF.' });
  return arquivo;
}

const ABRA_DE_NOVO = 'Abra o mapa pelo comando <code>/sessao mapa</code> no Discord: o link é pessoal e liga o site à sua conta.';

async function tratar(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', ENDERECO);
  const rota = url.pathname;
  if (!discord) return texto(res, 503, 'Calma', 'O bot ainda está ligando. Tente de novo em instantes.');

  if (rota === '/') return texto(res, 200, '🗺️ Mapas da Taverna', ABRA_DE_NOVO);

  if (rota.startsWith('/bardos/')) return tratarBardos(req, res, rota);

  // Imagem aberta para o Discord (foto do personagem e do NPC no webhook): só com a assinatura certa.
  const publica = rota.match(/^\/img\/([A-Za-z0-9._-]+)$/);
  if (publica) {
    const arquivo = publica[1];
    const certa = Buffer.from(assinarArquivo(arquivo));
    const veio = Buffer.from(url.searchParams.get('k') ?? '');
    if (veio.length !== certa.length || !timingSafeEqual(veio, certa) || !existsSync(`${PASTA}/${arquivo}`)) return json(res, 404, { erro: 'Sem imagem.' });
    return servirImagem(res, arquivo);
  }

  const cartaAberta = rota.match(/^\/carta\/([a-z0-9-]+)\.jpg$/);
  if (cartaAberta) {
    const certa = Buffer.from(assinarCarta(cartaAberta[1]));
    const veio = Buffer.from(url.searchParams.get('k') ?? '');
    if (veio.length !== certa.length || !timingSafeEqual(veio, certa)) return json(res, 404, { erro: 'Sem imagem.' });
    return servirCarta(res, 'g', cartaAberta[1]);
  }

  const pagina = rota.match(/^\/m\/(\d+)$/);
  const api = rota.match(/^\/api\/m\/(\d+)\/([a-z0-9/-]+)$/);
  if (!pagina && !api) return texto(res, 404, 'Não achei', 'Esse endereço não existe.');
  const campanhaId = Number((pagina ?? api)![1]);

  // Entrada pelo link do Discord: troca o link pessoal por um cookie de sessão e limpa o endereço.
  if (pagina && url.searchParams.has('k')) {
    const u = lerLink(segredo(), campanhaId, { u: url.searchParams.get('u'), v: url.searchParams.get('v'), k: url.searchParams.get('k') });
    if (!u) {
      const dc = linkDiscord(campanhaPorId(campanhaId));
      return texto(res, 403, '⏳ Esse link venceu', `Os links do mapa valem por pouco tempo, para ninguém entrar com o link de outra pessoa. Pegue um novo em segundos:${VOLTAR}`, dc ? { url: dc, rotulo: '💬 Ir para o canal no Discord' } : null);
    }
    res.writeHead(302, { Location: rota, 'Set-Cookie': cookie('mapa_sessao', criarSessao(segredo(), u), 7 * 86400), 'Referrer-Policy': 'no-referrer' });
    return void res.end();
  }

  const userId = lerSessao(segredo(), lerCookies(req.headers.cookie).mapa_sessao);
  if (!userId) {
    if (api) return json(res, 401, { erro: 'Sessão vencida: abra o mapa de novo pelo /sessao mapa.', vencida: true });
    const dc = linkDiscord(campanhaPorId(campanhaId));
    return texto(res, 401, '🎲 Quem é você?', `O mapa não sabe quem você é neste navegador (o acesso dura 7 dias). Entre pelo seu link pessoal:${VOLTAR}`, dc ? { url: dc, rotulo: '💬 Ir para o canal no Discord' } : null);
  }

  const c = campanhaPorId(campanhaId);
  if (!c) return api ? json(res, 404, { erro: 'Campanha apagada.' }) : texto(res, 404, 'Campanha não encontrada', 'Ela pode ter sido apagada.');
  const souMestre = c.mestre_id === userId;
  const souJogador = idsJogadores(c.id).includes(userId);
  if (!souMestre && !souJogador) {
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

  if ((req.method === 'GET' || req.method === 'HEAD') && acao === 'livro') return servirLivro(req, res, c);

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

    const desde = acao.match(/^efeitos\/(\d+)$/);
    if (desde) return json(res, 200, { seq: seqEfeito, lista: efeitosDesde(c.id, Number(desde[1])) });
    // Pulso: resposta pequena com o número das mudanças e os efeitos novos. A página só baixa o estado
    // ou o chat quando o número muda (antes baixava tudo a cada 3 s).
    const pulso = acao.match(/^pulso\/(\d+)$/);
    if (pulso) {
      const v = versoes.get(c.id) ?? { estado: 0, chat: 0 };
      return json(res, 200, { boot: BOOT, estado: v.estado, chat: v.chat, seq: seqEfeito, lista: efeitosDesde(c.id, Number(pulso[1])) });
    }
    if (acao === 'imagem') return servirImagem(res, mapaDe(c.id).imagem);
    if (acao === 'cartas/catalogo') {
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return json(res, 200, { cartas: CARTAS, dominios: DOMINIOS, classes: CLASSES, estagios: ESTAGIOS, imagens: temImagensDeCartas() });
    }
    const imgCarta = acao.match(/^carta\/([pg])\/([a-z0-9-]+)$/);
    if (imgCarta) return servirCarta(res, imgCarta[1], imgCarta[2]);
    const opcoes = acao.match(/^cartas\/opcoes\/(\d+)$/);
    if (opcoes) {
      const alvo = opcoes[1];
      if (alvo !== userId && !souMestre) return json(res, 403, { erro: 'Você só vê as suas opções.' });
      const p = pranchetaDe(c, alvo), ficha = fichaDe(c, alvo);
      const f = { classe: ficha?.classe as string, nivel: ficha?.nivel as number };
      return json(res, 200, { ...p, motivos: Object.fromEntries(CARTAS.map((k) => [k.id, motivoParaNaoEscolher(k.id, f, p.minhas, p.extras)])) });
    }
    const pecaImg = acao.match(/^peca-imagem\/(\d+)$/);
    if (pecaImg) {
      const p = db.prepare('SELECT imagem FROM mapa_pecas WHERE id = ? AND campanha_id = ?').get(Number(pecaImg[1]), c.id) as { imagem: string | null } | undefined;
      return servirImagem(res, p?.imagem);
    }
    const foto = acao.match(/^foto\/(\d+)$/);
    if (foto) return servirImagem(res, idsJogadores(c.id).includes(foto[1]) ? fotoDe(c, foto[1])?.imagem : null);
    // Registro de uma sessão do diário (o mesmo arquivo do /sessao finalizar; rolagens escondidas não entram).
    const registro = acao.match(/^diario\/(\d+)$/);
    if (registro) {
      const sessao = db.prepare('SELECT arquivo FROM campanha_sessoes WHERE id = ? AND campanha_id = ?').get(Number(registro[1]), c.id) as { arquivo: string | null } | undefined;
      try {
        if (!sessao?.arquivo || /[\\/]/.test(sessao.arquivo)) throw new Error('sem registro');
        const conteudo = readFileSync(`dados/campanhas/${sessao.arquivo}`, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return void res.end(conteudo);
      } catch {
        return json(res, 404, { erro: 'O registro dessa sessão não está mais no servidor.' });
      }
    }
    const imgHandout = acao.match(/^handout-imagem\/(\d+)$/);
    if (imgHandout) {
      const h = db.prepare('SELECT imagem FROM mapa_handouts WHERE id = ? AND campanha_id = ?').get(Number(imgHandout[1]), c.id) as { imagem: string } | undefined;
      return servirImagem(res, h?.imagem);
    }
    const imgElemento = acao.match(/^elemento-imagem\/(\d+)$/);
    if (imgElemento) {
      const e = db.prepare('SELECT imagem, oculto FROM mapa_elementos WHERE id = ? AND campanha_id = ?').get(Number(imgElemento[1]), c.id) as { imagem: string; oculto: number } | undefined;
      return servirImagem(res, e && (souMestre || !e.oculto) ? e.imagem : null);
    }
    const imgCriatura = acao.match(/^criatura-imagem\/(\d+)$/);
    if (imgCriatura) return servirImagem(res, criaturaPorId(c, imgCriatura[1])?.imagem);
    const daMesa = lerMesa(mesaDe(c, userId, souMestre), acao);
    if (daMesa) return json(res, daMesa.status, daMesa.corpo);
    return json(res, 404, { erro: 'Não achei.' });
  }

  if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });

  if (ROTAS_MESA.test(acao)) {
    const r = await tratarMesa(mesaDe(c, userId, souMestre), acao, await lerJson<Record<string, unknown>>(req, 8_000));
    return r ? json(res, r.status, r.corpo) : json(res, souMestre ? 404 : 403, { erro: souMestre ? 'Ação desconhecida.' : 'Só o mestre faz isso.' });
  }

  if (acao === 'mover') {
    const b = await lerJson<{ peca: number; x: number; y: number }>(req);
    const p = db.prepare('SELECT * FROM mapa_pecas WHERE id = ? AND campanha_id = ?').get(Number(b.peca), c.id) as Peca | undefined;
    if (!p) return json(res, 404, { erro: 'Peça não encontrada.' });
    if (!souMestre && p.user_id !== userId) return json(res, 403, { erro: 'Você só move o seu personagem.' });
    const m = mapaDe(c.id);
    const x = limitar(b.x, 0, m.largura, p.x), y = limitar(b.y, 0, m.altura, p.y);
    db.prepare('UPDATE mapa_pecas SET x = ?, y = ? WHERE id = ?').run(x, y, p.id);
    revelarVisao(c, { user_id: p.user_id, x, y });
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
    // O mestre pode falar e rolar pelos NPCs e inimigos dele: o chat mostra o nome da peça.
    let autor = await autorDe(c, userId);
    let pecaId: number | null = null;
    if (b.como !== undefined && b.como !== null) {
      if (!souMestre) return json(res, 403, { erro: 'Só o mestre fala por um NPC.' });
      const npc = pecaDoMestre(c, b.como);
      if (!npc) return json(res, 404, { erro: 'Esse NPC não está mais no mapa.' });
      autor = `${npc.tipo === 'inimigo' ? '👹' : '🎭'} ${npc.nome} (${npc.tipo === 'inimigo' ? 'inimigo' : 'NPC'})`;
      pecaId = npc.id;
    }
    gravarChat(c, userId, autor, entrada.tipo, txt, resultado, secreta, true, pecaId);
    return json(res, 200, { ok: true });
  }

  // A ficha do jogador nasce e muda aqui (no sistema da campanha). O mestre não tem ficha na própria mesa.
  if (acao === 'ficha') {
    if (!souJogador) return json(res, 403, { erro: 'Só quem joga na campanha tem ficha nela.' });
    const b = await lerJson<Record<string, unknown>>(req, 8_000);
    const r = validarFicha(c.sistema, b);
    if (!r.ok) return json(res, 400, { erro: r.erro });
    const antes = fichaDe(c, userId);
    const nova = r.valores as { nome: string; classe: string; nivel: number };
    if (!antes) registrarHistorico(c.guild_id, userId, `✨ ${nova.nome} nasceu: ${nova.classe}, nível ${nova.nivel}.`);
    else if (Number(antes.nivel) < nova.nivel) registrarHistorico(c.guild_id, userId, `⬆️ Subiu para o nível ${nova.nivel}.`);
    if (c.sistema === 'dh') salvarFichaDH(c, userId, r.valores as FichaDH);
    else salvarFichaDnd(c, userId, r.valores as FichaDnd);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'ficha/foto') {
    if (!souJogador) return json(res, 403, { erro: 'Só quem joga na campanha tem foto de personagem.' });
    const arquivo = await receberImagem(req, res, `pj-${c.guild_id}-${userId}`);
    if (!arquivo) return;
    const antiga = fotoDe(c, userId);
    db.prepare(
      `INSERT INTO personagem_fotos (guild_id, user_id, sistema, imagem, versao) VALUES (?, ?, ?, ?, 1)
       ON CONFLICT (guild_id, user_id, sistema) DO UPDATE SET imagem = excluded.imagem, versao = personagem_fotos.versao + 1`,
    ).run(c.guild_id, userId, c.sistema, arquivo);
    apagarImagem(antiga?.imagem);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'ficha/foto/remover') {
    apagarImagem(fotoDe(c, userId)?.imagem);
    db.prepare('DELETE FROM personagem_fotos WHERE guild_id = ? AND user_id = ? AND sistema = ?').run(c.guild_id, userId, c.sistema);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // Ataque clicando no alvo: rola contra a defesa dele e, se acertar, rola o dano e desconta da vida.
  if (acao === 'ataque') {
    const b = await lerJson<Record<string, unknown>>(req);
    const alvo = db.prepare('SELECT * FROM mapa_pecas WHERE id = ? AND campanha_id = ?').get(Number(b.alvo), c.id) as Peca | undefined;
    if (!alvo) return json(res, 404, { erro: 'O alvo não está mais no mapa.' });
    const vazio = (v: unknown) => v === undefined || v === null || v === '';
    let autor = await autorDe(c, userId);
    let pecaId: number | null = null;
    let atacante: string;
    let bonus: number;
    let dano = String(b.dano ?? '').replace(/\s/g, '').toLowerCase();
    if (!vazio(b.como)) {
      if (!souMestre) return json(res, 403, { erro: 'Só o mestre ataca por um NPC.' });
      const npc = pecaDoMestre(c, b.como);
      if (!npc) return json(res, 404, { erro: 'Esse NPC não está mais no mapa.' });
      const cr = npc.criatura_id ? criaturaPorId(c, npc.criatura_id) : undefined;
      autor = `${npc.tipo === 'inimigo' ? '👹' : '🎭'} ${npc.nome} (${npc.tipo === 'inimigo' ? 'inimigo' : 'NPC'})`;
      pecaId = npc.id;
      atacante = npc.nome;
      bonus = vazio(b.bonus) ? (cr?.ataque ?? 0) : Number(b.bonus);
      if (!dano) dano = cr?.dano ?? '';
    } else {
      const ficha = souJogador ? fichaDe(c, userId) : undefined;
      if (!ficha && !souMestre) return json(res, 400, { erro: 'Crie o seu personagem antes de atacar.' });
      if (alvo.user_id === userId) return json(res, 400, { erro: 'Você não pode atacar a si mesmo.' });
      atacante = String(ficha?.nome ?? 'O mestre');
      if (!vazio(b.bonus)) bonus = Number(b.bonus);
      else if (c.sistema === 'dh') bonus = Number(ficha?.[String(b.traco ?? 'agilidade')] ?? 0);
      else bonus = Number(ficha?.bba ?? 0) + modificador(Number(ficha?.forca ?? 10));
    }
    if (alvo.id === pecaId) return json(res, 400, { erro: 'Uma peça não ataca a si mesma.' });
    if (!Number.isInteger(bonus) || Math.abs(bonus) > 60) return json(res, 400, { erro: 'Bônus de ataque inválido.' });
    const vantagem = b.vantagem === 1 ? 1 : b.vantagem === -1 ? -1 : 0;
    const sinal = bonus >= 0 ? `+${bonus}` : `${bonus}`;
    const rotulo = `⚔️ Ataque em ${alvo.nome}`.slice(0, 60);
    const comando =
      c.sistema === 'dh'
        ? `/dh ${sinal}${vantagem > 0 ? ' vantagem' : vantagem < 0 ? ' desvantagem' : ''} # ${rotulo}`
        : `/r ${vantagem > 0 ? '2d20kh1' : vantagem < 0 ? '2d20kl1' : '1d20'}${bonus ? sinal : ''} # ${rotulo}`;
    let entradaAtaque;
    let entradaDano;
    try {
      entradaAtaque = interpretarEntrada(comando);
      entradaDano = dano ? interpretarEntrada(`/r ${dano} # ${`🩸 Dano em ${alvo.nome}`.slice(0, 60)}`) : null;
    } catch (e) {
      return json(res, 400, { erro: `Dano: ${(e as Error).message}` });
    }
    if (entradaAtaque.tipo === 'msg' || entradaDano?.tipo === 'msg') return json(res, 400, { erro: 'Ataque inválido.' });
    const crAlvo = alvo.criatura_id ? criaturaPorId(c, alvo.criatura_id) : undefined;
    const fichaAlvo = alvo.user_id ? fichaDe(c, alvo.user_id) : undefined;
    const defesa = crAlvo ? crAlvo.defesa : fichaAlvo ? Number(c.sistema === 'dh' ? fichaAlvo.evasao : fichaAlvo.ca) : null;
    const rolagem = rolarEntrada(entradaAtaque);
    gravarChat(c, userId, autor, entradaAtaque.tipo, entradaAtaque.rotulo, rolagem, false, true, pecaId);
    const r = resolverAtaque(rolagem, defesa);
    let desfecho: string;
    if (!r) desfecho = `🎯 ${atacante} atacou ${alvo.nome}: total ${rolagem.total}. O mestre decide se acertou.`;
    else if (!r.acertou) desfecho = `🛡️ ${atacante} errou ${alvo.nome}.`;
    else {
      desfecho = `💥 ${atacante} acertou ${alvo.nome}${r.critico ? ' com um crítico' : ''}!`;
      if (entradaDano) {
        const rd = rolarEntrada(entradaDano);
        gravarChat(c, userId, autor, 'dados', entradaDano.rotulo, rd, false, true, pecaId);
        const vida = aplicarDano(c, alvo, crAlvo, fichaAlvo, rd.total);
        desfecho += ` ${rd.total} de dano${vida ? ` (${vida})` : ''}.`;
      }
    }
    gravarChat(c, userId, autor, 'msg', desfecho, null, false, true, pecaId);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true, acertou: r?.acertou ?? null });
  }

  // Condições: o mestre em qualquer peça, o jogador na dele.
  if (acao === 'peca/condicao') {
    const b = await lerJson<{ peca: number; condicao: string; ligar: boolean }>(req);
    const p = db.prepare('SELECT * FROM mapa_pecas WHERE id = ? AND campanha_id = ?').get(Number(b.peca), c.id) as Peca | undefined;
    if (!p) return json(res, 404, { erro: 'Peça não encontrada.' });
    if (!souMestre && p.user_id !== userId) return json(res, 403, { erro: 'Você só muda as condições do seu personagem.' });
    if (!ehCondicao(b.condicao)) return json(res, 400, { erro: 'Condição desconhecida.' });
    db.prepare('UPDATE mapa_pecas SET condicoes = ? WHERE id = ?').run(alternarCondicao(p.condicoes, b.condicao, !!b.ligar), p.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // PV, Estresse, Esperança e Armadura do personagem (o dono ou o mestre), sem sair do mapa.
  if (acao === 'ficha/recurso') {
    const b = await lerJson<{ user: string; campo: string; delta: number }>(req);
    const alvo = String(b.user ?? userId);
    if (alvo !== userId && !souMestre) return json(res, 403, { erro: 'Você só mexe na sua ficha.' });
    if (!idsJogadores(c.id).includes(alvo)) return json(res, 404, { erro: 'Esse jogador não está na campanha.' });
    const limites: Record<string, string | number> = c.sistema === 'dh' ? { pv: 'pv_max', estresse: 'estresse_max', esperanca: MAX_ESPERANCA, armadura: 'armadura_max' } : { pv_atual: 'pv_max' };
    const campo = String(b.campo);
    if (!Object.hasOwn(limites, campo)) return json(res, 400, { erro: 'Campo desconhecido.' });
    const ficha = fichaDe(c, alvo);
    if (!ficha) return json(res, 404, { erro: 'Esse personagem ainda não tem ficha.' });
    const max = typeof limites[campo] === 'number' ? (limites[campo] as number) : Number(ficha[limites[campo] as string]);
    const novo = Math.min(max, Math.max(campo === 'pv_atual' ? -10 : 0, Number(ficha[campo]) + Math.trunc(Number(b.delta) || 0)));
    db.prepare(`UPDATE ${TABELA_FICHA[c.sistema]} SET ${campo} = ? WHERE guild_id = ? AND user_id = ?`).run(novo, c.guild_id, alvo);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true, valor: novo });
  }

  // Holofote do Daggerheart: quem já agiu nesta rodada (o mestre marca qualquer um, o jogador o dele).
  if (acao === 'combate/agiu') {
    const b = await lerJson<{ peca: number; agiu: boolean }>(req);
    const p = db.prepare('SELECT * FROM mapa_pecas WHERE id = ? AND campanha_id = ?').get(Number(b.peca), c.id) as Peca | undefined;
    if (!p) return json(res, 404, { erro: 'Peça não encontrada.' });
    if (!souMestre && p.user_id !== userId) return json(res, 403, { erro: 'Você só marca o seu personagem.' });
    db.prepare('UPDATE mapa_pecas SET agiu = ? WHERE id = ?').run(b.agiu ? 1 : 0, p.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // ---------- Grupo: ouro e inventário compartilhados (qualquer um da mesa mexe; o chat registra) ----------
  if (acao.startsWith('grupo/')) {
    const b = await lerJson<Record<string, unknown>>(req);
    const autor = await autorDe(c, userId);
    const registrar = (texto: string) => gravarChat(c, userId, autor, 'msg', texto.slice(0, LIMITE_TEXTO), null, false);
    if (acao === 'grupo/ouro') {
      const delta = Math.trunc(Number(b.delta));
      if (!delta || Math.abs(delta) > 1_000_000) return json(res, 400, { erro: 'Quanto de ouro?' });
      const atual = (db.prepare('SELECT ouro FROM campanhas WHERE id = ?').get(c.id) as { ouro: number }).ouro;
      const novo = Math.max(0, atual + delta);
      db.prepare('UPDATE campanhas SET ouro = ? WHERE id = ?').run(novo, c.id);
      registrar(`💰 ${delta > 0 ? `+${delta}` : `${novo - atual}`} de ouro para o grupo (agora ${novo}).`);
    } else if (acao === 'grupo/item') {
      const item = String(b.item ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
      const qtd = Math.trunc(Number(b.qtd ?? 1));
      if (!item) return json(res, 400, { erro: 'Qual item?' });
      if (!(qtd >= 1 && qtd <= 9999)) return json(res, 400, { erro: 'Quantidade de 1 a 9999.' });
      const igual = db.prepare('SELECT id FROM campanha_inventario WHERE campanha_id = ? AND item = ? COLLATE NOCASE').get(c.id, item) as { id: number } | undefined;
      if (igual) db.prepare('UPDATE campanha_inventario SET qtd = MIN(qtd + ?, 9999) WHERE id = ?').run(qtd, igual.id);
      else {
        const total = (db.prepare('SELECT COUNT(*) AS n FROM campanha_inventario WHERE campanha_id = ?').get(c.id) as { n: number }).n;
        if (total >= 200) return json(res, 400, { erro: 'O inventário chegou a 200 itens.' });
        db.prepare('INSERT INTO campanha_inventario (campanha_id, item, qtd, criada_em) VALUES (?, ?, ?, ?)').run(c.id, item, qtd, Date.now());
      }
      registrar(`🎒 Guardou ${qtd}× ${item} no inventário do grupo.`);
    } else if (acao === 'grupo/item/qtd' || acao === 'grupo/item/remover') {
      const it = db.prepare('SELECT * FROM campanha_inventario WHERE id = ? AND campanha_id = ?').get(Number(b.id), c.id) as { id: number; item: string; qtd: number } | undefined;
      if (!it) return json(res, 404, { erro: 'Esse item não está mais no inventário.' });
      const novo = acao === 'grupo/item/remover' ? 0 : Math.min(9999, it.qtd + Math.trunc(Number(b.delta) || 0));
      if (novo <= 0) db.prepare('DELETE FROM campanha_inventario WHERE id = ?').run(it.id);
      else db.prepare('UPDATE campanha_inventario SET qtd = ? WHERE id = ?').run(novo, it.id);
      registrar(novo <= 0 ? `🎒 Tirou ${it.item} do inventário do grupo.` : novo < it.qtd ? `🎒 Usou ${it.qtd - novo}× ${it.item} (sobram ${novo}).` : `🎒 Guardou ${novo - it.qtd}× ${it.item} (agora ${novo}).`);
    } else return json(res, 404, { erro: 'Ação desconhecida.' });
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // Ping: um "olha aqui" no mapa que aparece na tela de todos por um instante (não fica guardado).
  if (acao === 'ping') {
    const b = await lerJson<{ x: number; y: number }>(req);
    const agora = Date.now();
    if (agora - (ultimoPing.get(userId) ?? 0) < 600) return json(res, 200, { ok: false });
    ultimoPing.set(userId, agora);
    const m = mapaDe(c.id);
    const dados = JSON.stringify({ x: limitar(b.x, 0, m.largura, 0), y: limitar(b.y, 0, m.altura, 0), quem: userId });
    transmitir(c.id, 'ping', dados);
    return json(res, 200, { ok: true });
  }

  // Efeitos ao vivo para a mesa toda: traço de desenho, reação em cima da peça e "olhem aqui" do mestre.
  if (acao === 'efeito') {
    const b = await lerJson<{ tipo: string; id: string; pontos: unknown; fim: boolean; emoji: string; peca: number; x: number; y: number; a: unknown; b: unknown }>(req, 16_000);
    const agora = Date.now(), chave = `${userId}:${b.tipo}`;
    if (agora - (ultimoEfeito.get(chave) ?? 0) < (b.tipo === 'laser' || b.tipo === 'regua' ? (b.fim ? 0 : 60) : 500)) return json(res, 200, { ok: false });
    const m = mapaDe(c.id);
    let ef: Record<string, unknown>;
    if (b.tipo === 'laser') {
      const pontos = (Array.isArray(b.pontos) ? b.pontos : []).slice(0, 60)
        .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2)
        .map(([x, y]) => [Math.round(limitar(x, 0, m.largura, 0)), Math.round(limitar(y, 0, m.altura, 0))]);
      if (!pontos.length) return json(res, 400, { erro: 'Traço vazio.' });
      ef = { tipo: 'laser', id: String(b.id ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 12), pontos, fim: !!b.fim };
    } else if (b.tipo === 'reacao') {
      if (!REACOES_MAPA.includes(String(b.emoji))) return json(res, 400, { erro: 'Reação desconhecida.' });
      const p = db.prepare('SELECT id, user_id FROM mapa_pecas WHERE id = ? AND campanha_id = ?').get(Number(b.peca), c.id) as { id: number; user_id: string | null } | undefined;
      if (!p) return json(res, 404, { erro: 'Peça não encontrada.' });
      if (!souMestre && p.user_id !== userId) return json(res, 403, { erro: 'Você só reage com o seu personagem.' });
      ef = { tipo: 'reacao', emoji: b.emoji, peca: p.id };
    } else if (b.tipo === 'regua') {
      const ponto = (v: unknown) => (Array.isArray(v) && v.length === 2 ? [Math.round(limitar(v[0], 0, m.largura, 0)), Math.round(limitar(v[1], 0, m.altura, 0))] : null);
      const a = ponto(b.a), z = ponto(b.b);
      if (!a || !z) return json(res, 400, { erro: 'Régua inválida.' });
      ef = { tipo: 'regua', a, b: z, fim: !!b.fim };
    } else if (b.tipo === 'foco') {
      if (!souMestre) return json(res, 403, { erro: 'Só o mestre chama a atenção de todos.' });
      ef = { tipo: 'foco', x: Math.round(limitar(b.x, 0, m.largura, 0)), y: Math.round(limitar(b.y, 0, m.altura, 0)) };
    } else return json(res, 400, { erro: 'Efeito desconhecido.' });
    ultimoEfeito.set(chave, agora); // só os aceitos contam no limite
    const dados = JSON.stringify({ ...ef, quem: userId });
    transmitir(c.id, 'efeito', dados);
    return json(res, 200, { ok: true });
  }

  if (acao.startsWith('cartas/')) {
    if (c.sistema !== 'dh') return json(res, 400, { erro: 'Cartas são do Daggerheart.' });
    const b = await lerJson<{ carta: string; user: string; para: string; descanso: boolean; delta: number }>(req);
    const alvo = String(b.user ?? userId);
    if (alvo !== userId && !souMestre) return json(res, 403, { erro: 'Você só mexe nas suas cartas.' });
    if (!idsJogadores(c.id).includes(alvo)) return json(res, 404, { erro: 'Esse jogador não está na mesa.' });
    const ficha = fichaDe(c, alvo);
    if (!ficha) return json(res, 400, { erro: 'Crie a ficha do personagem antes de escolher as cartas.' });
    const minhas = cartasDe(c, alvo), carta = CARTA.get(String(b.carta ?? ''));
    const personagem = String(ficha.nome ?? 'O personagem');
    const jogador = (await quem(c.guild_id, alvo)).nome;
    const fala = (texto: string, resultado: ResultadoLinha | null = null, discord = false) =>
      gravarChat(c, alvo, `${personagem} (${jogador})`, 'msg', texto, resultado, false, discord);

    if (acao === 'cartas/escolher') {
      const motivo = motivoParaNaoEscolher(String(b.carta), { classe: ficha.classe as string, nivel: ficha.nivel as number }, minhas, extrasTotais(c, alvo, ficha));
      if (motivo) return json(res, 400, { erro: motivo });
      const lugar = lugarAoEscolher(carta!.id, minhas);
      db.prepare('INSERT INTO personagem_cartas (guild_id, user_id, carta, lugar, criada_em) VALUES (?, ?, ?, ?, ?)').run(c.guild_id, alvo, carta!.id, lugar, Date.now());
      registrarHistorico(c.guild_id, alvo, `🃏 Pegou a carta ${carta!.nome}.`);
      avisar(c.id, 'estado');
      return json(res, 200, { ok: true, lugar });
    }
    if (acao === 'cartas/tirar') {
      if (!carta || !minhas.some((m) => m.carta === carta.id)) return json(res, 404, { erro: 'O personagem não tem esta carta.' });
      db.prepare('DELETE FROM personagem_cartas WHERE guild_id = ? AND user_id = ? AND carta = ?').run(c.guild_id, alvo, carta.id);
      avisar(c.id, 'estado');
      return json(res, 200, { ok: true });
    }
    if (acao === 'cartas/mover') {
      const para = b.para === 'cofre' ? 'cofre' : 'carregamento';
      const r = moverCarta(String(b.carta), para, minhas, !!b.descanso);
      if (r.erro) return json(res, 400, { erro: r.erro });
      if (r.estresse) {
        const atual = Number(ficha.estresse ?? 0), max = Number(ficha.estresse_max ?? 6);
        if (atual + r.estresse > max) return json(res, 400, { erro: `Trazer ${carta!.nome} custa ${r.estresse} de Estresse e só cabem ${max - atual}. No descanso a troca é de graça.` });
        db.prepare('UPDATE fichas_dh SET estresse = estresse + ? WHERE guild_id = ? AND user_id = ?').run(r.estresse, c.guild_id, alvo);
        fala(`🃏 trouxe ${carta!.nome} do Cofre e marcou ${r.estresse} de Estresse.`);
      }
      db.prepare('UPDATE personagem_cartas SET lugar = ? WHERE guild_id = ? AND user_id = ? AND carta = ?').run(para, c.guild_id, alvo, carta!.id);
      avisar(c.id, 'estado');
      return json(res, 200, { ok: true, estresse: r.estresse });
    }
    if (acao === 'cartas/usar') {
      const minha = carta && minhas.find((m) => m.carta === carta.id);
      if (!minha) return json(res, 404, { erro: 'O personagem não tem esta carta.' });
      if (minha.lugar === 'cofre') return json(res, 400, { erro: 'Esta carta está no Cofre. Traga para o Carregamento antes de usar.' });
      db.prepare('UPDATE personagem_cartas SET usada = 1 WHERE guild_id = ? AND user_id = ? AND carta = ?').run(c.guild_id, alvo, carta!.id);
      fala(`🃏 usou a carta ${carta!.nome}`, { tipo: 'carta', id: carta!.id, nome: carta!.nome }, true);
      avisar(c.id, 'estado');
      return json(res, 200, { ok: true });
    }
    if (acao === 'cartas/recarregar') {
      db.prepare('UPDATE personagem_cartas SET usada = 0 WHERE guild_id = ? AND user_id = ? AND carta = ?').run(c.guild_id, alvo, String(b.carta));
      avisar(c.id, 'estado');
      return json(res, 200, { ok: true });
    }
    if (acao === 'cartas/descanso') {
      db.prepare('UPDATE personagem_cartas SET usada = 0 WHERE guild_id = ? AND user_id = ?').run(c.guild_id, alvo);
      fala('🏕️ descansou: as cartas usadas voltaram a ficar prontas.');
      avisar(c.id, 'estado');
      return json(res, 200, { ok: true });
    }
    if (acao === 'cartas/extras') {
      if (!souMestre) return json(res, 403, { erro: 'Só o mestre libera cartas extras.' });
      const novo = Math.max(0, Math.min(20, extrasDe(c, alvo) + Math.round(Number(b.delta) || 0)));
      db.prepare('INSERT INTO personagem_cartas_extras (guild_id, user_id, extras) VALUES (?, ?, ?) ON CONFLICT (guild_id, user_id) DO UPDATE SET extras = excluded.extras').run(c.guild_id, alvo, novo);
      avisar(c.id, 'estado');
      return json(res, 200, { ok: true, extras: novo });
    }
    return json(res, 404, { erro: 'Ação desconhecida.' });
  }

  // Daqui para baixo, só o mestre da campanha.
  if (!souMestre) return json(res, 403, { erro: 'Só o mestre faz isso.' });

  if (acao === 'livro') {
    mkdirSync(PASTA_LIVROS, { recursive: true });
    const destino = arquivoLivro(c), parcial = `${destino}.${process.pid}.parcial`;
    try {
      await gravarCorpo(req, parcial, LIMITE_LIVRO);
      const cabeca = Buffer.alloc(5), fd = openSync(parcial, 'r');
      readSync(fd, cabeca, 0, 5, 0);
      closeSync(fd);
      const inicio = cabeca.toString('latin1');
      if (inicio !== '%PDF-') throw new Error('não é pdf');
      renameSync(parcial, destino);
    } catch (e) {
      rmSync(parcial, { force: true });
      return (e as Error).message === 'grande'
        ? json(res, 413, { erro: `Livro grande demais para enviar pelo mapa (máximo ${LIMITE_LIVRO / 1024 / 1024} MB).` })
        : json(res, 415, { erro: 'Envie o livro em PDF.' });
    }
    gravarChat(c, userId, await autorDe(c, userId), 'msg', '📖 O livro de regras chegou à mesa: abra pelo botão 📖 do mapa.', null, false, false);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'livro/remover') {
    rmSync(arquivoLivro(c), { force: true });
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'combate/iniciar') {
    const pecas = pecasDaCena(c, mapaDe(c.id));
    let texto: string;
    if (c.sistema === 'dnd') {
      // D&D: d20 + Destreza + bônus extra (jogadores) ou o bônus de iniciativa da biblioteca.
      for (const p of pecas) {
        const ficha = p.user_id ? fichaDe(c, p.user_id) : undefined;
        const cr = p.criatura_id ? criaturaPorId(c, p.criatura_id) : undefined;
        const bonus = ficha ? modificador(Number(ficha.destreza)) + Number(ficha.ini_extra ?? 0) : (cr?.iniciativa ?? 0);
        p.iniciativa = rolar('1d20').total + bonus;
        db.prepare('UPDATE mapa_pecas SET iniciativa = ?, agiu = 0 WHERE id = ?').run(p.iniciativa, p.id);
      }
      const ordem = ordenarIniciativa(pecas);
      db.prepare('UPDATE mapas SET combate = 1, rodada = 1, vez = ? WHERE campanha_id = ?').run(ordem[0]?.id ?? null, c.id);
      texto = `⚔️ Combate! Iniciativa: ${ordem.map((p) => `${p.nome} (${p.iniciativa})`).join(', ') || 'ninguém no mapa'}.`;
    } else {
      db.prepare('UPDATE mapa_pecas SET iniciativa = NULL, agiu = 0 WHERE campanha_id = ?').run(c.id);
      db.prepare('UPDATE mapas SET combate = 1, rodada = 1, vez = NULL WHERE campanha_id = ?').run(c.id);
      texto = '⚔️ Combate! O holofote passa entre os personagens; o mestre age quando alguém falha ou rola com Medo.';
    }
    gravarChat(c, userId, await autorDe(c, userId), 'msg', texto.slice(0, LIMITE_TEXTO), null, false);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'combate/proximo') {
    const m = mapaDe(c.id);
    if (!m.combate) return json(res, 400, { erro: 'Não há combate em andamento.' });
    if (c.sistema === 'dh') {
      // Daggerheart: "nova rodada" zera quem já agiu.
      db.prepare('UPDATE mapa_pecas SET agiu = 0 WHERE campanha_id = ?').run(c.id);
      db.prepare('UPDATE mapas SET rodada = rodada + 1, vez = NULL WHERE campanha_id = ?').run(c.id);
    } else {
      const pecas = pecasDaCena(c, m).filter((q) => q.iniciativa !== null);
      const { vez, rodada } = proximoTurno(ordenarIniciativa(pecas).map((p) => p.id), m.vez, m.rodada);
      db.prepare('UPDATE mapas SET vez = ?, rodada = ? WHERE campanha_id = ?').run(vez, rodada, c.id);
    }
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'combate/vez') {
    const b = await lerJson<{ peca: number }>(req);
    const p = db.prepare('SELECT * FROM mapa_pecas WHERE id = ? AND campanha_id = ?').get(Number(b.peca), c.id) as Peca | undefined;
    if (!p) return json(res, 404, { erro: 'Peça não encontrada.' });
    db.prepare('UPDATE mapas SET vez = ? WHERE campanha_id = ?').run(p.id, c.id);
    if (c.sistema === 'dh') db.prepare('UPDATE mapa_pecas SET agiu = 1 WHERE id = ?').run(p.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'combate/iniciativa') {
    const b = await lerJson<{ peca: number; valor: number | null }>(req);
    const valor = b.valor === null || b.valor === undefined || (b.valor as unknown) === '' ? null : Math.round(limitar(b.valor, -20, 99, 0));
    const r = db.prepare('UPDATE mapa_pecas SET iniciativa = ? WHERE id = ? AND campanha_id = ?').run(valor, Number(b.peca), c.id);
    if (!r.changes) return json(res, 404, { erro: 'Peça não encontrada.' });
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'combate/encerrar') {
    db.prepare('UPDATE mapa_pecas SET iniciativa = NULL, agiu = 0 WHERE campanha_id = ?').run(c.id);
    db.prepare('UPDATE mapas SET combate = 0, rodada = 0, vez = NULL WHERE campanha_id = ?').run(c.id);
    gravarChat(c, userId, await autorDe(c, userId), 'msg', '🏳️ Fim do combate.', null, false);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // Medo do Mestre (Daggerheart): o mesmo do /dh medo, do servidor inteiro.
  if (acao === 'medo') {
    if (c.sistema !== 'dh') return json(res, 400, { erro: 'Medo é do Daggerheart.' });
    const b = await lerJson<{ delta: number }>(req);
    const novo = Math.max(0, Math.min(MAX_MEDO, lerMedo(c.guild_id) + Math.trunc(Number(b.delta) || 0)));
    db.prepare('INSERT INTO dh_medo (guild_id, medo) VALUES (?, ?) ON CONFLICT (guild_id) DO UPDATE SET medo = excluded.medo').run(c.guild_id, novo);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true, medo: novo });
  }

  if (acao === 'vida-inimigos') {
    const b = await lerJson<{ modo: string }>(req);
    if (!['escondida', 'estado', 'exata'].includes(String(b.modo))) return json(res, 400, { erro: 'Modo inválido.' });
    mapaDe(c.id);
    db.prepare('UPDATE mapas SET vida_inimigos = ? WHERE campanha_id = ?').run(String(b.modo), c.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'chat/revelar') {
    const b = await lerJson<{ id: number }>(req);
    const r = db.prepare('UPDATE mapa_chat SET secreta = 0, revelada = 1 WHERE id = ? AND campanha_id = ? AND secreta = 1').run(Number(b.id), c.id);
    if (!r.changes) return json(res, 404, { erro: 'Essa rolagem já está à mostra.' });
    avisar(c.id, 'chat');
    const l = db.prepare('SELECT * FROM mapa_chat WHERE id = ?').get(Number(b.id)) as LinhaChat | undefined;
    if (l) {
      const resultado = l.resultado ? (JSON.parse(l.resultado) as ResultadoLinha) : null;
      void espelharNoDiscord(c, { userId: l.user_id, pecaId: l.peca_id, autor: l.autor, tipo: l.tipo, texto: l.texto, resultado }, true);
    }
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
    const m = mapaDe(c.id);
    const arquivo = salvarImagem(dados, String(c.id));
    if (!arquivo) return json(res, 415, { erro: 'Use uma imagem PNG, JPG, WEBP ou GIF.' });
    apagarImagem(m.imagem);
    const largura = Math.round(limitar(url.searchParams.get('l'), 100, 20_000, m.largura));
    const altura = Math.round(limitar(url.searchParams.get('a'), 100, 20_000, m.altura));
    db.prepare('UPDATE mapas SET imagem = ?, largura = ?, altura = ?, versao = versao + 1 WHERE campanha_id = ?').run(arquivo, largura, altura, c.id);
    // Peças que ficaram fora do mapa novo voltam para dentro.
    db.prepare('UPDATE mapa_pecas SET x = MIN(x, ?), y = MIN(y, ?) WHERE campanha_id = ?').run(largura, altura, c.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'npc/imagem') {
    const p = pecaDoMestre(c, url.searchParams.get('peca'));
    if (!p) return json(res, 404, { erro: 'NPC não encontrado.' });
    const arquivo = await receberImagem(req, res, `npc-${c.id}-${p.id}`);
    if (!arquivo) return;
    apagarImagem(p.imagem);
    db.prepare('UPDATE mapa_pecas SET imagem = ?, versao_img = versao_img + 1 WHERE id = ?').run(arquivo, p.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // Handout: imagem que aparece na tela de todos (o mestre envia e ela já abre para a mesa).
  if (acao === 'handout') {
    const titulo = String(url.searchParams.get('titulo') ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Handout';
    const total = (db.prepare('SELECT COUNT(*) AS n FROM mapa_handouts WHERE campanha_id = ?').get(c.id) as { n: number }).n;
    if (total >= 100) return json(res, 400, { erro: 'A campanha chegou a 100 handouts. Apague alguns antes.' });
    let dados: Buffer;
    try {
      dados = await lerCorpo(req, LIMITE_IMAGEM);
    } catch {
      return json(res, 413, { erro: `Imagem grande demais (máximo ${LIMITE_IMAGEM / 1024 / 1024} MB).` });
    }
    const arquivo = salvarImagem(dados, `ho-${c.id}`);
    if (!arquivo) return json(res, 415, { erro: 'Use uma imagem PNG, JPG, WEBP ou GIF.' });
    const id = Number(db.prepare('INSERT INTO mapa_handouts (campanha_id, titulo, imagem, criada_em) VALUES (?, ?, ?, ?)').run(c.id, titulo, arquivo, Date.now()).lastInsertRowid);
    mapaDe(c.id);
    db.prepare('UPDATE mapas SET handout_id = ? WHERE campanha_id = ?').run(id, c.id);
    gravarChat(c, userId, await autorDe(c, userId), 'msg', `📜 Mostrou à mesa: ${titulo}`, null, false);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true, id });
  }

  if (acao === 'criatura/imagem') {
    const cr = criaturaPorId(c, url.searchParams.get('id'));
    if (!cr) return json(res, 404, { erro: 'Personagem da biblioteca não encontrado.' });
    const arquivo = await receberImagem(req, res, `cri-${c.id}-${cr.id}`);
    if (!arquivo) return;
    apagarImagem(cr.imagem);
    db.prepare('UPDATE campanha_criaturas SET imagem = ?, versao_img = versao_img + 1 WHERE id = ?').run(arquivo, cr.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // Elemento novo: a imagem chega como arquivo (antes de ler o corpo como JSON).
  if (acao === 'elemento/novo') {
    const m = mapaDe(c.id);
    const total = (db.prepare('SELECT COUNT(*) AS n FROM mapa_elementos WHERE campanha_id = ?').get(c.id) as { n: number }).n;
    if (total >= 300) return json(res, 400, { erro: 'A campanha chegou a 300 elementos. Apague alguns antes.' });
    const arquivo = await receberImagem(req, res, `${c.id}-elem`);
    if (!arquivo) return;
    // Tamanho inicial: o que a página mediu (proporção da imagem), limitado a 6 casas no lado maior.
    const lMed = limitar(url.searchParams.get('l'), 1, 10_000, m.grade), aMed = limitar(url.searchParams.get('a'), 1, 10_000, m.grade);
    const escala = (m.grade * 2) / Math.max(lMed, aMed);
    const largura = Math.max(8, lMed * escala), altura = Math.max(8, aMed * escala);
    const x = limitar(url.searchParams.get('x'), 0, m.largura, m.largura / 2), y = limitar(url.searchParams.get('y'), 0, m.altura, m.altura / 2);
    const ordem = (db.prepare('SELECT COALESCE(MAX(ordem), 0) + 1 AS o FROM mapa_elementos WHERE campanha_id = ?').get(c.id) as { o: number }).o;
    const novo = db.prepare('INSERT INTO mapa_elementos (campanha_id, cena_id, imagem, x, y, largura, altura, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      c.id, m.cena_id, arquivo, x, y, largura, altura, ordem, Date.now(),
    );
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true, id: Number(novo.lastInsertRowid) });
  }
  const b = await lerJson<Record<string, unknown>>(req, 8_000);

  // Biblioteca: cria (sem id) ou edita (com id) um NPC ou inimigo. As cópias no mapa acompanham tamanho e vida máxima.
  if (acao === 'criatura') {
    const r = validarCriatura(b);
    if (!r.ok) return json(res, 400, { erro: r.erro });
    const v = r.valores;
    if (b.id) {
      const cr = criaturaPorId(c, b.id);
      if (!cr) return json(res, 404, { erro: 'Personagem da biblioteca não encontrado.' });
      db.prepare(
        `UPDATE campanha_criaturas SET tipo = ?, nome = ?, tamanho = ?, pv_max = ?, defesa = ?, ataque = ?, dano = ?, limiar_maior = ?,
         limiar_grave = ?, notas = ?, iniciativa = ? WHERE id = ?`,
      ).run(v.tipo, v.nome, v.tamanho, v.pv_max, v.defesa, v.ataque, v.dano, v.limiar_maior, v.limiar_grave, v.notas, v.iniciativa, cr.id);
      db.prepare('UPDATE mapa_pecas SET tipo = ?, tamanho = ?, pv = CASE WHEN ? IS NULL THEN NULL ELSE MIN(COALESCE(pv, ?), ?) END WHERE criatura_id = ? AND campanha_id = ?').run(
        v.tipo, v.tamanho, v.pv_max, v.pv_max, v.pv_max, cr.id, c.id,
      );
      avisar(c.id, 'estado');
      return json(res, 200, { ok: true, id: cr.id });
    }
    const total = (db.prepare('SELECT COUNT(*) AS n FROM campanha_criaturas WHERE campanha_id = ?').get(c.id) as { n: number }).n;
    if (total >= 300) return json(res, 400, { erro: 'A biblioteca chegou a 300 personagens. Apague alguns antes.' });
    const id = criarCriatura(c, v);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true, id });
  }

  // Apagar da biblioteca tira também as cópias dele do mapa.
  if (acao === 'criatura/remover') {
    const cr = criaturaPorId(c, b.id);
    if (!cr) return json(res, 404, { erro: 'Personagem da biblioteca não encontrado.' });
    for (const p of db.prepare('SELECT imagem FROM mapa_pecas WHERE criatura_id = ? AND campanha_id = ?').all(cr.id, c.id) as { imagem: string | null }[]) apagarImagem(p.imagem);
    db.prepare('DELETE FROM mapa_pecas WHERE criatura_id = ? AND campanha_id = ?').run(cr.id, c.id);
    apagarImagem(cr.imagem);
    db.prepare('DELETE FROM campanha_criaturas WHERE id = ?').run(cr.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'criatura/imagem/remover') {
    const cr = criaturaPorId(c, b.id);
    if (!cr) return json(res, 404, { erro: 'Personagem da biblioteca não encontrado.' });
    apagarImagem(cr.imagem);
    db.prepare('UPDATE campanha_criaturas SET imagem = NULL, versao_img = versao_img + 1 WHERE id = ?').run(cr.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // Põe uma cópia no mapa (arrastada da biblioteca ou pelo botão): Goblin, Goblin 2... cada uma com a sua vida.
  if (acao === 'criatura/colocar') {
    const r = colocarCriatura(c, Number(b.id), b.x, b.y);
    if (typeof r === 'string') return json(res, r.startsWith('O mapa') ? 400 : 404, { erro: r });
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true, ...r });
  }

  // Vida de uma cópia da biblioteca: delta (-7 tira, +5 cura) ou valor exato.
  if (acao === 'peca/pv') {
    const p = pecaDoMestre(c, b.peca);
    const cr = p?.criatura_id ? criaturaPorId(c, p.criatura_id) : undefined;
    if (!p || !cr || cr.pv_max === null) return json(res, 404, { erro: 'Essa peça não tem PV na biblioteca.' });
    const atual = p.pv ?? cr.pv_max;
    const novo = b.valor !== undefined ? Number(b.valor) : atual + Number(b.delta);
    if (!Number.isFinite(novo)) return json(res, 400, { erro: 'Valor de PV inválido.' });
    db.prepare('UPDATE mapa_pecas SET pv = ? WHERE id = ?').run(Math.round(Math.min(cr.pv_max, Math.max(0, novo))), p.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // Tamanho em casas (0,5 a 6, de meio em meio): o mestre aumenta monstros e diminui familiares.
  if (acao === 'peca/tamanho') {
    const tamanho = Math.round(limitar(b.tamanho, 0.5, 6, 1) * 2) / 2;
    const r = db.prepare('UPDATE mapa_pecas SET tamanho = ? WHERE id = ? AND campanha_id = ?').run(tamanho, Number(b.peca), c.id);
    if (!r.changes) return json(res, 404, { erro: 'Peça não encontrada.' });
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'npc/imagem/remover') {
    const p = pecaDoMestre(c, b.peca);
    if (!p) return json(res, 404, { erro: 'NPC não encontrado.' });
    apagarImagem(p.imagem);
    db.prepare('UPDATE mapa_pecas SET imagem = NULL, versao_img = versao_img + 1 WHERE id = ?').run(p.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'grade') {
    db.prepare('UPDATE mapas SET grade = ?, versao = versao + 1 WHERE campanha_id = ?').run(Math.round(limitar(b.grade, 10, 400, 50)), c.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // ---------- Névoa de guerra ----------
  if (acao === 'nevoa/ligar' || acao === 'nevoa/pintar' || acao === 'nevoa/tudo') {
    const m = mapaDe(c.id);
    const { cols, rows, bits } = nevoaDe(m);
    if (cols * rows > MAX_CASAS_NEVOA) return json(res, 400, { erro: 'A grade está pequena demais para a névoa neste mapa: aumente o tamanho da casa.' });
    let novos: Uint8Array = bits;
    if (acao === 'nevoa/tudo') novos = nevoaToda(cols, rows, !!b.revelar);
    if (acao === 'nevoa/pintar') {
      const ponta = (v: unknown, max: number) => Math.round(limitar(v, -1, max, 0));
      novos = pintarNevoa(bits, cols, rows, [ponta(b.c0, cols), ponta(b.r0, rows)], [ponta(b.c1, cols), ponta(b.r1, rows)], !!b.revelar);
    }
    const ligada = acao === 'nevoa/ligar' ? (b.ligada ? 1 : 0) : 1;
    db.prepare('UPDATE mapas SET nevoa_ligada = ?, nevoa = ? WHERE campanha_id = ?').run(ligada, gravarNevoa(novos), c.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // Peça escondida: os jogadores não recebem nem a posição dela até o mestre mostrar.
  if (acao === 'peca/esconder') {
    const p = pecaDoMestre(c, b.peca);
    if (!p) return json(res, 404, { erro: 'Só as peças do mestre podem ser escondidas.' });
    db.prepare('UPDATE mapa_pecas SET escondida = ? WHERE id = ?').run(b.escondida ? 1 : 0, p.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // ---------- Cenas ----------
  if (acao === 'cena/nova') {
    const nome = String(b.nome ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!nome) return json(res, 400, { erro: 'Dê um nome para a cena.' });
    if (cenasDe(c.id).length >= 50) return json(res, 400, { erro: 'A campanha chegou a 50 cenas. Apague alguma antes.' });
    let m = mapaDe(c.id);
    // Primeira vez: o mapa de agora vira a primeira cena (com as peças do mestre que já estão nele).
    if (!m.cena_id) {
      const primeira = Number(db.prepare('INSERT INTO mapa_cenas (campanha_id, nome, criada_em) VALUES (?, ?, ?)').run(c.id, 'Primeira cena', Date.now()).lastInsertRowid);
      db.prepare('UPDATE mapas SET cena_id = ? WHERE campanha_id = ?').run(primeira, c.id);
      db.prepare('UPDATE mapa_pecas SET cena_id = ? WHERE campanha_id = ? AND user_id IS NULL AND cena_id IS NULL').run(primeira, c.id);
      m = mapaDe(c.id);
    }
    const id = Number(db.prepare('INSERT INTO mapa_cenas (campanha_id, nome, grade, criada_em) VALUES (?, ?, ?, ?)').run(c.id, nome, m.grade, Date.now()).lastInsertRowid);
    abrirCena(c, m, db.prepare('SELECT * FROM mapa_cenas WHERE id = ?').get(id) as Cena);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true, id });
  }

  if (acao === 'cena/abrir') {
    const cena = db.prepare('SELECT * FROM mapa_cenas WHERE id = ? AND campanha_id = ?').get(Number(b.id), c.id) as Cena | undefined;
    if (!cena) return json(res, 404, { erro: 'Cena não encontrada.' });
    const m = mapaDe(c.id);
    if (m.cena_id !== cena.id) {
      abrirCena(c, m, cena);
      gravarChat(c, userId, await autorDe(c, userId), 'msg', `🎬 Nova cena: ${cena.nome}`, null, false);
    }
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // ---------- Música da mesa (pelos bardos) ----------
  if (acao === 'musica') {
    const comando = lerComandoMusica(b);
    if (typeof comando === 'string') return json(res, 400, { erro: comando });
    if (!c.canal_voz_id) return json(res, 400, { erro: 'A mesa ainda não tem call: abra a sessão com /sessao iniciar.' });
    await liberarBardos({ voz: c.canal_voz_id, texto: c.canal_id });
    const r = await pedirAosBardos({ ...comando, guildId: c.guild_id, canalVozId: c.canal_voz_id, canalTextoId: c.canal_id });
    avisar(c.id, 'estado', true);
    return json(res, r.ok ? 200 : 502, r.ok ? { ok: true, msg: r.msg } : { erro: r.msg });
  }

  // Trilha da cena: toca sozinha quando o mestre abre a cena.
  if (acao === 'cena/ambiente') {
    const ambiente = b.ambiente ? String(b.ambiente) : null;
    if (ambiente && !ehAmbiente(ambiente)) return json(res, 400, { erro: 'Trilha desconhecida.' });
    const r = db.prepare('UPDATE mapa_cenas SET ambiente = ? WHERE id = ? AND campanha_id = ?').run(ambiente, Number(b.id), c.id);
    if (!r.changes) return json(res, 404, { erro: 'Cena não encontrada.' });
    avisar(c.id, 'estado', true);
    return json(res, 200, { ok: true });
  }

  // ---------- Handouts ----------
  if (acao === 'handout/mostrar') {
    const id = b.id ? Number(b.id) : null;
    if (id && !db.prepare('SELECT 1 FROM mapa_handouts WHERE id = ? AND campanha_id = ?').get(id, c.id)) return json(res, 404, { erro: 'Handout não encontrado.' });
    mapaDe(c.id);
    db.prepare('UPDATE mapas SET handout_id = ? WHERE campanha_id = ?').run(id, c.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'handout/apagar') {
    const h = db.prepare('SELECT * FROM mapa_handouts WHERE id = ? AND campanha_id = ?').get(Number(b.id), c.id) as { id: number; imagem: string } | undefined;
    if (!h) return json(res, 404, { erro: 'Handout não encontrado.' });
    apagarImagem(h.imagem);
    db.prepare('DELETE FROM mapa_handouts WHERE id = ?').run(h.id);
    db.prepare('UPDATE mapas SET handout_id = NULL WHERE campanha_id = ? AND handout_id = ?').run(c.id, h.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // Diário: o mestre escreve o resumo de cada sessão (os jogadores leem no mapa).
  if (acao === 'diario/notas') {
    const r = db.prepare('UPDATE campanha_sessoes SET notas = ? WHERE id = ? AND campanha_id = ?').run(String(b.notas ?? '').trim().slice(0, 4000), Number(b.id), c.id);
    if (!r.changes) return json(res, 404, { erro: 'Sessão não encontrada no diário.' });
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'cena/renomear') {
    const nome = String(b.nome ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!nome) return json(res, 400, { erro: 'Dê um nome para a cena.' });
    const r = db.prepare('UPDATE mapa_cenas SET nome = ? WHERE id = ? AND campanha_id = ?').run(nome, Number(b.id), c.id);
    if (!r.changes) return json(res, 404, { erro: 'Cena não encontrada.' });
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'cena/apagar') {
    const cena = db.prepare('SELECT * FROM mapa_cenas WHERE id = ? AND campanha_id = ?').get(Number(b.id), c.id) as Cena | undefined;
    if (!cena) return json(res, 404, { erro: 'Cena não encontrada.' });
    if (mapaDe(c.id).cena_id === cena.id) return json(res, 400, { erro: 'Esta é a cena aberta: abra outra antes de apagar.' });
    apagarImagem(cena.imagem);
    for (const p of db.prepare('SELECT imagem FROM mapa_pecas WHERE cena_id = ? AND campanha_id = ?').all(cena.id, c.id) as { imagem: string | null }[]) apagarImagem(p.imagem);
    db.prepare('DELETE FROM mapa_pecas WHERE cena_id = ? AND campanha_id = ? AND user_id IS NULL').run(cena.id, c.id);
    db.prepare('DELETE FROM mapa_cenas WHERE id = ?').run(cena.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  // ---------- Elementos: imagens soltas na cena (móveis, árvores, armadilhas), só do mestre ----------
  if (acao === 'elemento/mudar') {
    const e = db.prepare('SELECT * FROM mapa_elementos WHERE id = ? AND campanha_id = ?').get(Number(b.id), c.id) as Elemento | undefined;
    if (!e) return json(res, 404, { erro: 'Elemento não encontrado.' });
    const m = mapaDe(c.id);
    const num = (v: unknown, min: number, max: number, padrao: number) => (v === undefined ? padrao : limitar(v, min, max, padrao));
    let ordem = e.ordem;
    if (b.ordem === 'frente') ordem = (db.prepare('SELECT COALESCE(MAX(ordem), 0) + 1 AS o FROM mapa_elementos WHERE campanha_id = ?').get(c.id) as { o: number }).o;
    if (b.ordem === 'tras') ordem = (db.prepare('SELECT COALESCE(MIN(ordem), 0) - 1 AS o FROM mapa_elementos WHERE campanha_id = ?').get(c.id) as { o: number }).o;
    db.prepare('UPDATE mapa_elementos SET x = ?, y = ?, largura = ?, altura = ?, rotacao = ?, oculto = ?, ordem = ? WHERE id = ?').run(
      num(b.x, 0, m.largura, e.x), num(b.y, 0, m.altura, e.y), num(b.largura, 4, 20_000, e.largura), num(b.altura, 4, 20_000, e.altura),
      ((Number(b.rotacao ?? e.rotacao) % 360) + 360) % 360, b.oculto === undefined ? e.oculto : b.oculto ? 1 : 0, ordem, e.id,
    );
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }
  if (acao === 'elemento/apagar') {
    const e = db.prepare('SELECT imagem FROM mapa_elementos WHERE id = ? AND campanha_id = ?').get(Number(b.id), c.id) as { imagem: string } | undefined;
    if (!e) return json(res, 404, { erro: 'Elemento não encontrado.' });
    db.prepare('DELETE FROM mapa_elementos WHERE id = ?').run(Number(b.id));
    if (!db.prepare('SELECT 1 FROM mapa_elementos WHERE imagem = ?').get(e.imagem)) apagarImagem(e.imagem);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }
  if (acao === 'elemento/copiar') {
    const e = db.prepare('SELECT * FROM mapa_elementos WHERE id = ? AND campanha_id = ?').get(Number(b.id), c.id) as Elemento | undefined;
    if (!e) return json(res, 404, { erro: 'Elemento não encontrado.' });
    const m = mapaDe(c.id);
    const novo = db.prepare('INSERT INTO mapa_elementos (campanha_id, cena_id, imagem, x, y, largura, altura, rotacao, oculto, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      c.id, m.cena_id, e.imagem, Math.min(m.largura, e.x + m.grade), Math.min(m.altura, e.y + m.grade), e.largura, e.altura, e.rotacao, e.oculto, e.ordem + 1, Date.now(),
    );
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true, id: Number(novo.lastInsertRowid) });
  }

  // ---------- Desenhos permanentes do mestre ----------
  if (acao === 'desenho/novo') {
    const m = mapaDe(c.id);
    let d;
    try {
      d = validarDesenho(b, m.largura, m.altura);
    } catch (e) {
      return json(res, 400, { erro: (e as Error).message });
    }
    const total = (db.prepare('SELECT COUNT(*) AS n FROM mapa_desenhos WHERE campanha_id = ? AND cena_id IS ?').get(c.id, m.cena_id) as { n: number }).n;
    if (total >= 500) return json(res, 400, { erro: 'Esta cena já tem 500 desenhos. Apague alguns antes.' });
    const novo = db.prepare('INSERT INTO mapa_desenhos (campanha_id, cena_id, tipo, pontos, cor, espessura, preenchido, oculto, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      c.id, m.cena_id, d.tipo, JSON.stringify(d.pontos), d.cor, d.espessura, d.preenchido ? 1 : 0, b.oculto ? 1 : 0, Date.now(),
    );
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true, id: Number(novo.lastInsertRowid) });
  }
  if (acao === 'desenho/apagar') {
    db.prepare('DELETE FROM mapa_desenhos WHERE id = ? AND campanha_id = ?').run(Number(b.id), c.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }
  if (acao === 'desenho/limpar') {
    db.prepare('DELETE FROM mapa_desenhos WHERE campanha_id = ? AND cena_id IS ?').run(c.id, mapaDe(c.id).cena_id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  if (acao === 'npc/remover') {
    const npc = pecaDoMestre(c, b.peca);
    apagarImagem(npc?.imagem);
    db.prepare('DELETE FROM mapa_pecas WHERE id = ? AND campanha_id = ? AND user_id IS NULL').run(Number(b.peca), c.id);
    avisar(c.id, 'estado');
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { erro: 'Ação desconhecida.' });
}

/** Apaga mapa, imagens, peças, biblioteca e chat de uma campanha (chamado quando ela é apagada). */
export function apagarMapa(campanhaId: number) {
  const m = db.prepare('SELECT imagem FROM mapas WHERE campanha_id = ?').get(campanhaId) as { imagem: string | null } | undefined;
  apagarImagem(m?.imagem);
  for (const p of db.prepare('SELECT imagem FROM mapa_pecas WHERE campanha_id = ? AND imagem IS NOT NULL').all(campanhaId) as { imagem: string }[]) apagarImagem(p.imagem);
  for (const cr of db.prepare('SELECT imagem FROM campanha_criaturas WHERE campanha_id = ? AND imagem IS NOT NULL').all(campanhaId) as { imagem: string }[]) apagarImagem(cr.imagem);
  db.prepare('DELETE FROM mapa_pecas WHERE campanha_id = ?').run(campanhaId);
  for (const cn of cenasDe(campanhaId)) if (cn.imagem && cn.imagem !== m?.imagem) apagarImagem(cn.imagem);
  db.prepare('DELETE FROM mapa_cenas WHERE campanha_id = ?').run(campanhaId);
  for (const h of db.prepare('SELECT imagem FROM mapa_handouts WHERE campanha_id = ?').all(campanhaId) as { imagem: string }[]) apagarImagem(h.imagem);
  db.prepare('DELETE FROM mapa_handouts WHERE campanha_id = ?').run(campanhaId);
  db.prepare('DELETE FROM campanha_inventario WHERE campanha_id = ?').run(campanhaId);
  db.prepare('DELETE FROM campanha_sessoes WHERE campanha_id = ?').run(campanhaId);
  db.prepare('DELETE FROM campanha_criaturas WHERE campanha_id = ?').run(campanhaId);
  db.prepare('DELETE FROM mapa_chat WHERE campanha_id = ?').run(campanhaId);
  db.prepare('DELETE FROM mapas WHERE campanha_id = ?').run(campanhaId);
  db.prepare('DELETE FROM campanha_relogios WHERE campanha_id = ?').run(campanhaId);
  for (const e of db.prepare('SELECT DISTINCT imagem FROM mapa_elementos WHERE campanha_id = ?').all(campanhaId) as { imagem: string }[]) apagarImagem(e.imagem);
  db.prepare('DELETE FROM mapa_elementos WHERE campanha_id = ?').run(campanhaId);
  db.prepare('DELETE FROM mapa_desenhos WHERE campanha_id = ?').run(campanhaId);
  db.prepare('DELETE FROM campanha_roteiro WHERE campanha_id = ?').run(campanhaId);
  esquecerMesa(campanhaId);
  for (const o of ouvintes.get(campanhaId) ?? []) o.res.end();
  ouvintes.delete(campanhaId);
}

export function iniciarMapa(client: Client) {
  discord = client;
  prepararChaveBardos();
  // Cena com trilha: ao abrir, os bardos tocam a trilha dela na call da mesa.
  aoTrocarCena = (c, cena) => {
    if (cena.ambiente && ehAmbiente(cena.ambiente) && c.canal_voz_id) {
      const pedido = { acao: 'ambiente' as const, tipo: cena.ambiente, guildId: c.guild_id, canalVozId: c.canal_voz_id, canalTextoId: c.canal_id };
      void liberarBardos({ voz: c.canal_voz_id, texto: c.canal_id }).then(() => pedirAosBardos(pedido));
    }
  };
  const servidor = createServer((req, res) => {
    tratar(req, res).catch((e) => {
      console.error('[mapa]', e);
      if (!res.headersSent) json(res, 500, { erro: 'Deu ruim aqui. Tente de novo.' });
      else res.end();
    });
  });
  servidor.on('error', (e) => console.error(`[mapa] não consegui abrir a porta ${PORTA}:`, e.message));
  servidor.listen(PORTA, '0.0.0.0', () => console.log(`🗺️ Mapa das campanhas em ${ENDERECO}`));
  return servidor;
}
