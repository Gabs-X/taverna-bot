import { lerExperiencias, serializarExperiencias } from './daggerheart.ts';

// Ficha criada pelo jogador e personagens da biblioteca do mestre (NPCs e inimigos), vindos do site do mapa.
// Os limites são os mesmos dos comandos do Discord (/dh ficha criar e /ficha criar).

export type Sistema = 'dh' | 'dnd';
type Resultado<T> = { ok: true; valores: T } | { ok: false; erro: string };

const TRACOS_DH = ['agilidade', 'forca', 'acuidade', 'instinto', 'presenca', 'conhecimento'] as const;
const ATRIBUTOS_DND = ['forca', 'destreza', 'constituicao', 'inteligencia', 'sabedoria', 'carisma'] as const;

class Invalido extends Error {}

function texto(corpo: Record<string, unknown>, campo: string, rotulo: string, max: number, obrigatorio = false) {
  const v = String(corpo[campo] ?? '').replace(/\s+/g, ' ').trim();
  if (obrigatorio && !v) throw new Invalido(`Preencha: ${rotulo}.`);
  if (v.length > max) throw new Invalido(`${rotulo}: no máximo ${max} letras.`);
  return v;
}

function inteiro(corpo: Record<string, unknown>, campo: string, rotulo: string, min: number, max: number, padrao?: number) {
  const bruto = corpo[campo];
  if ((bruto === undefined || bruto === null || bruto === '') && padrao !== undefined) return padrao;
  const n = Number(bruto);
  if (!Number.isInteger(n)) throw new Invalido(`${rotulo}: use um número inteiro.`);
  if (n < min || n > max) throw new Invalido(`${rotulo}: de ${min} a ${max}.`);
  return n;
}

function opcional(corpo: Record<string, unknown>, campo: string, rotulo: string, min: number, max: number) {
  const bruto = corpo[campo];
  return bruto === undefined || bruto === null || bruto === '' ? null : inteiro(corpo, campo, rotulo, min, max);
}

const tentar = <T>(f: () => T): Resultado<T> => {
  try {
    return { ok: true, valores: f() };
  } catch (e) {
    if (e instanceof Invalido) return { ok: false, erro: e.message };
    throw e;
  }
};

export type FichaDH = {
  nome: string; classe: string; ancestralidade: string; comunidade: string; nivel: number;
  agilidade: number; forca: number; acuidade: number; instinto: number; presenca: number; conhecimento: number;
  evasao: number; proficiencia: number; pv_max: number; estresse_max: number; armadura_max: number;
  limiar_maior: number; limiar_grave: number; experiencias: string;
  /** Escolhas da criação guiada (classe, subclasse, traços sem bônus, armadura...), em JSON, para reabrir a guia. */
  guia: string;
};
export type FichaDnd = {
  nome: string; classe: string; raca: string; nivel: number;
  forca: number; destreza: number; constituicao: number; inteligencia: number; sabedoria: number; carisma: number;
  pv_max: number; ca: number; bba: number; fort: number; ref: number; von: number; ini_extra: number;
};

/** As escolhas da criação guiada: só um objeto JSON pequeno (o resto é ignorado). */
export function guiaDaFicha(v: unknown) {
  if (typeof v !== 'string' || !v || v.length > 3000) return '';
  try {
    const o = JSON.parse(v);
    return o && typeof o === 'object' && !Array.isArray(o) ? JSON.stringify(o) : '';
  } catch {
    return '';
  }
}

/** Confere a ficha mandada pelo formulário do mapa e devolve os valores prontos para o banco. */
export function validarFicha(sistema: 'dh', corpo: Record<string, unknown>): Resultado<FichaDH>;
export function validarFicha(sistema: 'dnd', corpo: Record<string, unknown>): Resultado<FichaDnd>;
export function validarFicha(sistema: Sistema, corpo: Record<string, unknown>): Resultado<FichaDH | FichaDnd>;
export function validarFicha(sistema: Sistema, corpo: Record<string, unknown>) {
  return tentar(() => {
    const nome = texto(corpo, 'nome', 'Nome', 60, true);
    if (sistema === 'dh') {
      const tracos = Object.fromEntries(TRACOS_DH.map((t) => [t, inteiro(corpo, t, NOMES[t], -5, 10)]));
      const limiar_maior = inteiro(corpo, 'limiar_maior', 'Limiar Maior', 1, 99);
      const limiar_grave = inteiro(corpo, 'limiar_grave', 'Limiar Grave', 2, 199);
      if (limiar_grave <= limiar_maior) throw new Invalido('O limiar Grave precisa ser maior que o Maior.');
      const exp = texto(corpo, 'experiencias', 'Experiências', 300);
      const lista = exp ? lerExperiencias(exp) : [];
      if (lista.some((e) => !e.nome || e.bonus < 1 || e.bonus > 99)) throw new Invalido('Experiências: escreva assim "Ladrão de Cofres +2, Criado nas Ruas +3".');
      return {
        nome,
        classe: texto(corpo, 'classe', 'Classe', 50, true),
        ancestralidade: texto(corpo, 'ancestralidade', 'Ancestralidade', 40),
        comunidade: texto(corpo, 'comunidade', 'Comunidade', 40),
        nivel: inteiro(corpo, 'nivel', 'Nível', 1, 10),
        ...tracos,
        evasao: inteiro(corpo, 'evasao', 'Evasão', 1, 40),
        proficiencia: inteiro(corpo, 'proficiencia', 'Proficiência', 1, 6, 1),
        pv_max: inteiro(corpo, 'pv_max', 'PV', 1, 12),
        estresse_max: inteiro(corpo, 'estresse_max', 'Estresse', 1, 12, 6),
        armadura_max: inteiro(corpo, 'armadura_max', 'Armadura', 0, 12),
        limiar_maior,
        limiar_grave,
        experiencias: serializarExperiencias(lista),
        guia: guiaDaFicha(corpo.guia),
      } as FichaDH;
    }
    const atributos = Object.fromEntries(ATRIBUTOS_DND.map((a) => [a, inteiro(corpo, a, NOMES[a], 1, 50)]));
    return {
      nome,
      classe: texto(corpo, 'classe', 'Classe', 40, true),
      raca: texto(corpo, 'raca', 'Raça', 40),
      nivel: inteiro(corpo, 'nivel', 'Nível', 1, 40),
      ...atributos,
      pv_max: inteiro(corpo, 'pv_max', 'PV máximo', 1, 999),
      ca: inteiro(corpo, 'ca', 'CA', 1, 80),
      bba: inteiro(corpo, 'bba', 'Ataque base', 0, 40),
      fort: inteiro(corpo, 'fort', 'Fortitude', 0, 30),
      ref: inteiro(corpo, 'ref', 'Reflexos', 0, 30),
      von: inteiro(corpo, 'von', 'Vontade', 0, 30),
      ini_extra: inteiro(corpo, 'ini_extra', 'Iniciativa extra', -10, 30, 0),
    } as FichaDnd;
  });
}

const NOMES: Record<string, string> = {
  agilidade: 'Agilidade', forca: 'Força', acuidade: 'Acuidade', instinto: 'Instinto', presenca: 'Presença', conhecimento: 'Conhecimento',
  destreza: 'Destreza', constituicao: 'Constituição', inteligencia: 'Inteligência', sabedoria: 'Sabedoria', carisma: 'Carisma',
};

// ---------- Biblioteca do mestre ----------

export type TipoCriatura = 'npc' | 'inimigo';
export type Criatura = {
  tipo: TipoCriatura; nome: string; tamanho: number; pv_max: number | null; defesa: number | null; ataque: number | null;
  dano: string; limiar_maior: number | null; limiar_grave: number | null; notas: string; iniciativa: number | null;
};

/** Dano no formato das rolagens: 1d8+2, 2d6, 7. */
const DANO = /^(\d{1,2}d\d{1,3}|\d{1,3})([+-](\d{1,2}d\d{1,3}|\d{1,3}))*$/i;

export function validarCriatura(corpo: Record<string, unknown>): Resultado<Criatura> {
  return tentar(() => {
    const tipo = corpo.tipo === 'inimigo' ? 'inimigo' : 'npc';
    const dano = texto(corpo, 'dano', 'Dano', 30).replace(/\s/g, '').toLowerCase();
    if (dano && !DANO.test(dano)) throw new Invalido('Dano: escreva como uma rolagem, ex.: 1d8+2.');
    const limiar_maior = opcional(corpo, 'limiar_maior', 'Limiar Maior', 1, 99);
    const limiar_grave = opcional(corpo, 'limiar_grave', 'Limiar Grave', 2, 199);
    if (limiar_maior !== null && limiar_grave !== null && limiar_grave <= limiar_maior) throw new Invalido('O limiar Grave precisa ser maior que o Maior.');
    const tamanho = Number(corpo.tamanho ?? 1);
    return {
      tipo,
      nome: texto(corpo, 'nome', 'Nome', 40, true),
      tamanho: Number.isFinite(tamanho) ? Math.round(Math.min(6, Math.max(0.5, tamanho)) * 2) / 2 : 1,
      pv_max: opcional(corpo, 'pv_max', 'PV', 1, 9999),
      defesa: opcional(corpo, 'defesa', 'Defesa', 0, 99),
      ataque: opcional(corpo, 'ataque', 'Ataque', -20, 50),
      dano,
      limiar_maior,
      limiar_grave,
      notas: String(corpo.notas ?? '').trim().slice(0, 1000),
      iniciativa: opcional(corpo, 'iniciativa', 'Iniciativa', -10, 30),
    };
  });
}

/** Nome da próxima peça de uma criatura já no mapa: Goblin, Goblin 2, Goblin 3... sem repetir. */
export function nomeDaCopia(nome: string, existentes: string[]) {
  const usados = new Set(existentes.map((n) => n.toLowerCase()));
  if (!usados.has(nome.toLowerCase())) return nome;
  for (let n = 2; ; n++) if (!usados.has(`${nome} ${n}`.toLowerCase())) return `${nome} ${n}`;
}

/**
 * Fala do jogador escrita direto no canal da campanha que deve continuar como ele (fora do personagem):
 * começa com "(", "//" ou "ooc", ou é longa demais para o webhook (2000 letras).
 */
export function foraDoPersonagem(texto: string) {
  const t = texto.trim();
  return !t || t.length > 2000 || /^(\(|\/\/|ooc\b)/i.test(t);
}

/** Nome que o webhook aceita: 1 a 80 letras e sem as palavras que o Discord proíbe. */
export function nomeDeWebhook(nome: string) {
  const limpo = nome.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!limpo || /discord|clyde|everyone|here/i.test(limpo)) return null;
  return limpo;
}
