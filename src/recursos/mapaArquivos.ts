// Arquivos do mapa: endereço público, segredo das assinaturas, imagens (mapas, fotos, peças, handouts), o livro de
// regras em PDF (entregue em pedaços) e as imagens das cartas do Daggerheart. Separado do mapa.ts, que fica com as rotas.
import { createHmac, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { db } from '../db.ts';
import { CARTA } from '../lib/cartasDH.ts';
import { tipoImagem } from '../lib/mapa.ts';

const semArquivo = (res: ServerResponse, erro: string) => {
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ erro }));
};

export const PORTA = Number(process.env.MAPA_PORTA) || 53135;
export const ENDERECO = (process.env.MAPA_URL?.trim() || `http://localhost:${PORTA}`).replace(/\/+$/, '');
export const mapaPublico = () => !!process.env.MAPA_URL?.trim();
export const PASTA = 'dados/mapas';
export const LIMITE_IMAGEM_PECA = 3 * 1024 * 1024;
export const SEGURO = ENDERECO.startsWith('https://');

/** Segredo que assina os links e as sessões do mapa: sorteado na primeira vez e guardado no banco. */
export function segredo() {
  const salvo = (db.prepare("SELECT valor FROM bot_estado WHERE chave = 'mapa_segredo'").get() as { valor: string } | undefined)?.valor;
  if (salvo) return salvo;
  const novo = randomBytes(32).toString('hex');
  db.prepare("INSERT INTO bot_estado (chave, valor) VALUES ('mapa_segredo', ?)").run(novo);
  return novo;
}

// ---------- Imagens ----------

export const assinarArquivo = (arquivo: string) => createHmac('sha256', segredo()).update(`img:${arquivo}`).digest('base64url').slice(0, 24);
/** Endereço aberto (sem login) de uma imagem do mapa, para o Discord buscar a foto do personagem no webhook. */
export const imagemPublica = (arquivo: string | null | undefined) =>
  arquivo && SEGURO ? `${ENDERECO}/img/${encodeURIComponent(arquivo)}?k=${assinarArquivo(arquivo)}` : null;

export function salvarImagem(dados: Buffer, prefixo: string) {
  const tipo = tipoImagem(dados);
  if (!tipo) return null;
  mkdirSync(PASTA, { recursive: true });
  const arquivo = `${prefixo}-${Date.now()}.${tipo.ext}`;
  writeFileSync(`${PASTA}/${arquivo}`, dados);
  return arquivo;
}
export const apagarImagem = (arquivo: string | null | undefined) => {
  if (arquivo) rmSync(`${PASTA}/${arquivo}`, { force: true });
};

export function servirImagem(res: ServerResponse, arquivo: string | null | undefined) {
  try {
    if (!arquivo || arquivo.includes('/') || arquivo.includes('\\')) throw new Error('sem imagem');
    const dados = readFileSync(`${PASTA}/${arquivo}`);
    const tipo = tipoImagem(dados);
    if (!tipo) throw new Error('arquivo inválido');
    res.writeHead(200, { 'Content-Type': tipo.mime, 'Cache-Control': 'private, max-age=31536000', 'X-Content-Type-Options': 'nosniff' });
    return void res.end(dados);
  } catch {
    return semArquivo(res, 'Sem imagem.');
  }
}

// ---------- Livro de regras (um PDF por servidor e sistema, consultado pelo mapa) ----------

export const PASTA_LIVROS = 'dados/livros';
// O túnel da Cloudflare recusa envios acima de 100 MB; livros maiores são copiados direto para dados/livros.
export const LIMITE_LIVRO = 95 * 1024 * 1024;
export const arquivoLivro = (c: { guild_id: string; sistema: string }) => `${PASTA_LIVROS}/${c.guild_id}-${c.sistema}.pdf`;

export function infoLivro(c: { guild_id: string; sistema: string }) {
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
export function servirLivro(req: IncomingMessage, res: ServerResponse, c: { guild_id: string; sistema: string }) {
  const info = infoLivro(c);
  if (!info) return semArquivo(res, 'Esta mesa ainda não tem o livro de regras.');
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
export function gravarCorpo(req: IncomingMessage, destino: string, limite: number) {
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

export const PASTA_CARTAS = 'dados/cartas/dh';
export const temImagensDeCartas = () => existsSync(`${PASTA_CARTAS}/p`);

export const assinarCarta = (id: string) => assinarArquivo(`carta:${id}`);
/** Endereço aberto (assinado) da imagem da carta, para o Discord mostrar no webhook. */
export const cartaPublica = (id: string) => (SEGURO && temImagensDeCartas() ? `${ENDERECO}/carta/${id}.jpg?k=${assinarCarta(id)}` : null);

export function servirCarta(res: ServerResponse, tamanho: string, id: string) {
  if (!CARTA.has(id) || !/^[pg]$/.test(tamanho)) return semArquivo(res, 'Carta não encontrada.');
  try {
    const dados = readFileSync(`${PASTA_CARTAS}/${tamanho}/${id}.jpg`);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=604800', 'X-Content-Type-Options': 'nosniff' });
    return void res.end(dados);
  } catch {
    return semArquivo(res, 'A imagem desta carta não está no servidor.');
  }
}

