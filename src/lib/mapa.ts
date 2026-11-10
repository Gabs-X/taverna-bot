import { createHmac, timingSafeEqual } from 'node:crypto';
import { rolar, type Aleatorio, type Resultado } from './dados.ts';
import { rolarDualidade, type Dualidade } from './daggerheart.ts';

// Lógica do mapa da campanha sem Discord nem banco: link de entrada e sessão assinados, tipo da imagem,
// posição das peças e o chat de rolagens (estilo Roll20: /r, /gr escondida do mestre, /dh dualidade).

export const DURACAO_SESSAO = 7 * 24 * 3_600_000;
export const DURACAO_LINK = 3_600_000;
export const LIMITE_IMAGEM = 12 * 1024 * 1024;
export const LIMITE_TEXTO = 500;
export const HISTORICO = 300;

const assinar = (segredo: string, texto: string) => createHmac('sha256', segredo).update(texto).digest('base64url');
const confere = (a: string, b: string | undefined) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b ?? '');
  return x.length === y.length && timingSafeEqual(x, y);
};
const ehId = (u: unknown): u is string => typeof u === 'string' && /^\d{5,25}$/.test(u);

/**
 * Link pessoal que o /campanha mapa entrega (só a pessoa vê, a resposta é efêmera). É ele que liga o site ao Discord:
 * quem abre entra como quem rodou o comando. Vale por 1 hora; depois disso fica o cookie de sessão.
 */
export function assinarLink(segredo: string, campanhaId: number, userId: string, agora = Date.now()) {
  const v = agora + DURACAO_LINK;
  return { u: userId, v: String(v), k: assinar(segredo, `link.${campanhaId}.${userId}.${v}`) };
}

export function lerLink(segredo: string, campanhaId: number, q: { u?: string | null; v?: string | null; k?: string | null }, agora = Date.now()) {
  if (!ehId(q.u) || !(Number(q.v) > agora)) return undefined;
  return confere(assinar(segredo, `link.${campanhaId}.${q.u}.${q.v}`), q.k ?? undefined) ? q.u : undefined;
}

/** Cookie de sessão: "idDiscord.vencimento.assinatura". Só o servidor consegue gerar, então o id não é falsificável. */
export function criarSessao(segredo: string, userId: string, agora = Date.now()) {
  const corpo = `${userId}.${agora + DURACAO_SESSAO}`;
  return `${corpo}.${assinar(segredo, `sessao.${corpo}`)}`;
}

export function lerSessao(segredo: string, cookie: string | undefined, agora = Date.now()): string | undefined {
  const partes = cookie?.split('.');
  if (partes?.length !== 3) return undefined;
  const [userId, vence, assinatura] = partes;
  if (!ehId(userId) || !(Number(vence) > agora)) return undefined;
  return confere(assinar(segredo, `sessao.${userId}.${vence}`), assinatura) ? userId : undefined;
}

export function lerCookies(cabecalho: string | undefined) {
  const r: Record<string, string> = {};
  for (const par of (cabecalho ?? '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) r[par.slice(0, i).trim()] = par.slice(i + 1).trim();
  }
  return r;
}

/** Descobre o tipo pela assinatura do arquivo (não confia no que o navegador diz). */
export function tipoImagem(b: Buffer): { ext: string; mime: string } | undefined {
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (b.length > 6 && ['GIF87a', 'GIF89a'].includes(b.toString('latin1', 0, 6))) return { ext: 'gif', mime: 'image/gif' };
  return undefined;
}

export const limitar = (n: unknown, min: number, max: number, padrao: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao;
};

/** Onde nasce a peça de número `n`: fileiras de 8 no canto do mapa, uma casa de distância entre elas. */
export function posicaoInicial(n: number, grade: number) {
  return { x: grade * (1.5 + (n % 8) * 1.25), y: grade * (1.5 + Math.floor(n / 8) * 1.25) };
}

// ---------- Chat e rolagens ----------

export type Entrada =
  | { tipo: 'msg'; texto: string }
  | { tipo: 'dados'; expressao: string; rotulo: string; secreta: boolean }
  | { tipo: 'dualidade'; modificador: number; vantagem: -1 | 0 | 1; rotulo: string; secreta: boolean };

export const AJUDA_CHAT =
  '/r 2d6+3 rola para todos · /gr 1d20 rola escondido (só o mestre) · /dh +2 vantagem rola a dualidade do Daggerheart · /gdh escondida · "# texto" dá nome à rolagem';

/**
 * Lê o que foi digitado no chat. Texto comum vira mensagem; "/r", "/gr", "/dh" e "/gdh" viram rolagens.
 * Erros (comando desconhecido, expressão inválida) saem como exceção com a mensagem para o jogador.
 */
export function interpretarEntrada(bruto: string): Entrada {
  const texto = bruto.trim().slice(0, LIMITE_TEXTO);
  if (!texto) throw new Error('Escreva alguma coisa.');
  if (!texto.startsWith('/')) return { tipo: 'msg', texto };

  const [, cmd = '', resto = ''] = /^\/(\S+)\s*(.*)$/s.exec(texto) ?? [];
  const i = resto.indexOf('#');
  const corpo = (i >= 0 ? resto.slice(0, i) : resto).trim();
  const rotulo = (i >= 0 ? resto.slice(i + 1) : '').trim().slice(0, 60);
  const comando = cmd.toLowerCase();

  if (['r', 'roll', 'rolar', 'gr', 'gmroll'].includes(comando)) {
    if (!corpo) throw new Error('Diga os dados: /r 1d20+5');
    rolar(corpo); // valida agora para o erro sair antes de gravar
    return { tipo: 'dados', expressao: corpo.replace(/\s+/g, ''), rotulo, secreta: comando === 'gr' || comando === 'gmroll' };
  }
  if (['dh', 'dualidade', 'gdh'].includes(comando)) {
    let modificador = 0;
    let vantagem: -1 | 0 | 1 = 0;
    for (const p of corpo.toLowerCase().split(/\s+/).filter(Boolean)) {
      if (/^[+-]?\d{1,3}$/.test(p)) modificador += Number(p);
      else if (['v', 'vant', 'vantagem'].includes(p)) vantagem = 1;
      else if (['d', 'desv', 'desvantagem'].includes(p)) vantagem = -1;
      else throw new Error(`Não entendi "${p}". Use /dh +2, /dh -1 vantagem ou /dh desvantagem.`);
    }
    return { tipo: 'dualidade', modificador, vantagem, rotulo, secreta: comando === 'gdh' };
  }
  throw new Error(`Comando /${cmd} não existe. ${AJUDA_CHAT}`);
}

/** Pedaços para a página desenhar a rolagem: dados (com o que foi descartado), sinais e números fixos. */
export type Pedaco = { t: 'dado'; v: number; faces: number; mantido: boolean } | { t: 'op'; v: string } | { t: 'fixo'; v: number };

export function pedacos(r: Resultado): Pedaco[] {
  const saida: Pedaco[] = [];
  r.termos.forEach((t, i) => {
    if (i > 0 || t.termo.sinal < 0) saida.push({ t: 'op', v: t.termo.sinal < 0 ? '-' : '+' });
    if (t.termo.tipo === 'fixo') return void saida.push({ t: 'fixo', v: t.termo.valor });
    const restantes = [...t.mantidos];
    for (const v of t.rolagens) {
      const idx = restantes.indexOf(v);
      if (idx >= 0) restantes.splice(idx, 1);
      saida.push({ t: 'dado', v, faces: t.termo.faces, mantido: idx >= 0 });
    }
  });
  return saida;
}

export type ResultadoChat =
  | { tipo: 'dados'; expressao: string; total: number; pedacos: Pedaco[] }
  | ({ tipo: 'dualidade'; vantagem: -1 | 0 | 1 } & Dualidade);

/** Rola o que a entrada pede (o servidor rola; a página só mostra). */
export function rolarEntrada(e: Exclude<Entrada, { tipo: 'msg' }>, rng?: Aleatorio): ResultadoChat {
  if (e.tipo === 'dados') {
    const r = rolar(e.expressao, rng);
    return { tipo: 'dados', expressao: e.expressao, total: r.total, pedacos: pedacos(r) };
  }
  return { tipo: 'dualidade', vantagem: e.vantagem, ...rolarDualidade(e.modificador, e.vantagem, rng) };
}

export type LinhaChat = { id: number; user_id: string; autor: string; tipo: 'msg' | 'dados' | 'dualidade'; texto: string; resultado: string | null; secreta: number; revelada: number; criada_em: number };

/** O que cada um recebe do histórico: rolagem escondida só chega ao mestre, nem pelo histórico os jogadores a veem. */
export function chatVisivel(linhas: LinhaChat[], souMestre: boolean) {
  return linhas
    .filter((l) => souMestre || !l.secreta)
    .map((l) => ({
      id: l.id,
      autor: l.autor,
      userId: l.user_id,
      tipo: l.tipo,
      texto: l.texto,
      resultado: l.resultado ? (JSON.parse(l.resultado) as ResultadoChat) : null,
      secreta: !!l.secreta,
      revelada: !!l.revelada,
      em: l.criada_em,
    }));
}
