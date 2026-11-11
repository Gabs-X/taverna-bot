// Cartas do Daggerheart: catálogo e regras de escolha conforme a ficha (classe e nível).
// Regras do livro básico usadas aqui:
// - Cartas de domínio: só dos dois domínios da classe, de nível igual ou menor que o do personagem,
//   e no máximo nível + 1 cartas (2 no nível 1, mais uma a cada nível). A Escola do Conhecimento dá +1 por carta
//   de subclasse, e o mestre pode dar cartas extras (avanços, multiclasse).
// - Carregamento: até 5 cartas ativas; as outras ficam no Cofre. Trazer do Cofre custa Estresse igual ao custo
//   de recuperação (no descanso, de graça). Notório não conta no limite; Vitalidade e Mestre do Ofício ficam no Cofre.
// - Ancestralidade: 1 (2 na herança mista). Comunidade: 1.
// - Subclasse: uma só, da classe. Fundação no nível 1, Especialização a partir do nível 5 e Maestria a partir do 8,
//   sempre na ordem.
import { DADOS_CARTAS } from './cartasDH.dados.ts';

export const DOMINIOS = {
  arcana: { nome: 'Arcana', cor: '#6b4fa0' },
  blade: { nome: 'Lâmina', cor: '#b3261e' },
  bone: { nome: 'Osso', cor: '#7d8288' },
  codex: { nome: 'Códice', cor: '#2f4f8f' },
  grace: { nome: 'Graça', cor: '#b0457a' },
  midnight: { nome: 'Meia-Noite', cor: '#2b2b3a' },
  sage: { nome: 'Sábio', cor: '#2f7a3a' },
  splendor: { nome: 'Esplendor', cor: '#c79a1c' },
  valor: { nome: 'Valor', cor: '#d9741f' },
} as const;
export type Dominio = keyof typeof DOMINIOS;

export const CLASSES = {
  bardo: { nome: 'Bardo', dominios: ['grace', 'codex'] },
  druida: { nome: 'Druida', dominios: ['sage', 'arcana'] },
  feiticeiro: { nome: 'Feiticeiro', dominios: ['arcana', 'midnight'] },
  guardiao: { nome: 'Guardião', dominios: ['valor', 'blade'] },
  guerreiro: { nome: 'Guerreiro', dominios: ['blade', 'bone'] },
  ladino: { nome: 'Ladino', dominios: ['midnight', 'grace'] },
  mago: { nome: 'Mago', dominios: ['codex', 'splendor'] },
  ranger: { nome: 'Ranger', dominios: ['bone', 'sage'] },
  seraph: { nome: 'Serafim', dominios: ['splendor', 'valor'] },
} as const satisfies Record<string, { nome: string; dominios: readonly Dominio[] }>;
export type Classe = keyof typeof CLASSES;

export type Estagio = 'fundacao' | 'especializacao' | 'maestria';
export const ESTAGIOS: Record<Estagio, { nome: string; nivel: number }> = {
  fundacao: { nome: 'Fundação', nivel: 1 },
  especializacao: { nome: 'Especialização', nivel: 5 },
  maestria: { nome: 'Maestria', nivel: 8 },
};

export type Carta =
  | { id: string; nome: string; tipo: 'dominio'; dominio: Dominio; nivel: number; custo: number; natureza: string; foraDoLimite?: true; fixaNoCofre?: true }
  | { id: string; nome: string; tipo: 'subclasse'; classe: Classe; estagio: Estagio; subclasse: string }
  | { id: string; nome: string; tipo: 'ancestralidade' }
  | { id: string; nome: string; tipo: 'comunidade' };

const FORA_DO_LIMITE = new Set(['dominio-grace-notorio']);
const FIXAS_NO_COFRE = new Set(['dominio-blade-vitalidade', 'dominio-grace-mestre-do-oficio']);
const ESCOLA_DO_CONHECIMENTO = 'subclasse-mago-escola-do-conhecimento';

export const CARTAS: Carta[] = DADOS_CARTAS.map((d): Carta => {
  if (d[2] === 'dominio') {
    const c: Carta = { id: d[0], nome: d[1], tipo: 'dominio', dominio: d[3] as Dominio, nivel: d[4] as number, custo: d[5] as number, natureza: d[6] as string };
    if (FORA_DO_LIMITE.has(c.id)) c.foraDoLimite = true;
    if (FIXAS_NO_COFRE.has(c.id)) c.fixaNoCofre = true;
    return c;
  }
  if (d[2] === 'subclasse') return { id: d[0], nome: d[1], tipo: 'subclasse', classe: d[3] as Classe, estagio: d[4] as Estagio, subclasse: d[5] as string };
  return d[2] === 'ancestralidade' ? { id: d[0], nome: d[1], tipo: 'ancestralidade' } : { id: d[0], nome: d[1], tipo: 'comunidade' };
});
export const CARTA = new Map(CARTAS.map((c) => [c.id, c]));

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Classe do livro a partir do que o jogador escreveu na ficha ("Bardo", "bardo do colégio", "Wizard"...). */
export function classeDaFicha(texto: string | null | undefined): Classe | null {
  const t = semAcento(String(texto ?? ''));
  const regras: [RegExp, Classe][] = [
    [/bard/, 'bardo'], [/druid/, 'druida'], [/feiticeir|sorcer/, 'feiticeiro'], [/guardi/, 'guardiao'], [/guerreir|warrior/, 'guerreiro'],
    [/ladin|rogue/, 'ladino'], [/mag[oa]\b|wizard/, 'mago'], [/ranger|patrulheir/, 'ranger'], [/seraph|serafi/, 'seraph'],
  ];
  return regras.find(([r]) => r.test(t))?.[1] ?? null;
}

export type Lugar = 'carregamento' | 'cofre' | 'base';
export type CartaDoPersonagem = { carta: string; lugar: Lugar; usada?: boolean };
export type Ficha = { classe: string | null | undefined; nivel: number | null | undefined };
export const MAX_CARREGAMENTO = 5;

const doTipo = (minhas: CartaDoPersonagem[], tipo: Carta['tipo']) => minhas.filter((m) => CARTA.get(m.carta)?.tipo === tipo);
/** Quantas cartas do Carregamento contam no limite de 5 (Notório não conta). */
export const noCarregamento = (minhas: CartaDoPersonagem[]) =>
  minhas.filter((m) => m.lugar === 'carregamento' && !(CARTA.get(m.carta) as { foraDoLimite?: true } | undefined)?.foraDoLimite).length;

/** O que a ficha permite: quantas cartas de cada tipo, quantas já tem e de quais domínios. */
export function limites(ficha: Ficha, minhas: CartaDoPersonagem[], extras = 0) {
  const classe = classeDaFicha(ficha.classe);
  const nivel = Math.max(1, Math.min(10, Math.floor(Number(ficha.nivel) || 1)));
  const escola = minhas.filter((m) => m.carta.startsWith(ESCOLA_DO_CONHECIMENTO)).length;
  return {
    classe,
    nivel,
    dominios: classe ? [...CLASSES[classe].dominios] : [],
    dominio: { max: nivel + 1 + escola + Math.max(0, extras), tem: doTipo(minhas, 'dominio').length },
    ancestralidade: { max: 2, tem: doTipo(minhas, 'ancestralidade').length },
    comunidade: { max: 1, tem: doTipo(minhas, 'comunidade').length },
    subclasse: { max: nivel >= 8 ? 3 : nivel >= 5 ? 2 : 1, tem: doTipo(minhas, 'subclasse').length },
    carregamento: { max: MAX_CARREGAMENTO, tem: noCarregamento(minhas) },
  };
}

/** Por que esta carta não pode ser escolhida agora (ou null se pode). */
export function motivoParaNaoEscolher(id: string, ficha: Ficha, minhas: CartaDoPersonagem[], extras = 0): string | null {
  const c = CARTA.get(id);
  if (!c) return 'Carta desconhecida.';
  if (minhas.some((m) => m.carta === id)) return 'Você já tem esta carta.';
  const l = limites(ficha, minhas, extras);
  if (c.tipo === 'ancestralidade' || c.tipo === 'comunidade') {
    if (c.tipo === 'ancestralidade') return l.ancestralidade.tem >= l.ancestralidade.max ? 'Você já tem duas ancestralidades (herança mista).' : null;
    return l.comunidade.tem >= l.comunidade.max ? 'Você já tem uma comunidade. Tire a atual para trocar.' : null;
  }
  if (!l.classe) return 'Escreva na ficha uma classe do livro (Bardo, Druida, Feiticeiro, Guardião, Guerreiro, Ladino, Mago, Ranger ou Serafim).';
  if (c.tipo === 'dominio') {
    if (!l.dominios.includes(c.dominio)) return `${DOMINIOS[c.dominio].nome} não é um domínio de ${CLASSES[l.classe].nome}.`;
    if (c.nivel > l.nivel) return `Carta de nível ${c.nivel}: libera quando o personagem chegar ao nível ${c.nivel}.`;
    if (l.dominio.tem >= l.dominio.max) return `No nível ${l.nivel} o personagem tem ${l.dominio.max} cartas de domínio, e todas já foram escolhidas.`;
    return null;
  }
  if (c.classe !== l.classe) return `Subclasse de ${CLASSES[c.classe].nome}.`;
  const minhasSub = doTipo(minhas, 'subclasse').map((m) => CARTA.get(m.carta) as Extract<Carta, { tipo: 'subclasse' }>);
  const outra = minhasSub.find((s) => s.subclasse !== c.subclasse);
  if (outra) return `O personagem já segue ${outra.nome}.`;
  const tem = (e: Estagio) => minhasSub.some((s) => s.estagio === e);
  if (ESTAGIOS[c.estagio].nivel > l.nivel) return `${ESTAGIOS[c.estagio].nome}: libera no nível ${ESTAGIOS[c.estagio].nivel}.`;
  if (c.estagio === 'especializacao' && !tem('fundacao')) return 'Pegue a Fundação desta subclasse antes.';
  if (c.estagio === 'maestria' && !tem('especializacao')) return 'Pegue a Especialização desta subclasse antes.';
  return null;
}

/** Onde a carta entra ao ser escolhida: domínio vai para o Carregamento se couber, senão para o Cofre. */
export function lugarAoEscolher(id: string, minhas: CartaDoPersonagem[]): Lugar {
  const c = CARTA.get(id);
  if (!c || c.tipo !== 'dominio') return 'base';
  if (c.fixaNoCofre) return 'cofre';
  return c.foraDoLimite || noCarregamento(minhas) < MAX_CARREGAMENTO ? 'carregamento' : 'cofre';
}

/** Mover entre Carregamento e Cofre: o motivo da recusa (ou null) e quanto Estresse custa. */
export function moverCarta(id: string, para: 'carregamento' | 'cofre', minhas: CartaDoPersonagem[], descanso: boolean): { erro: string | null; estresse: number } {
  const c = CARTA.get(id), minha = minhas.find((m) => m.carta === id);
  if (!c || !minha) return { erro: 'Você não tem esta carta.', estresse: 0 };
  if (c.tipo !== 'dominio') return { erro: 'Só cartas de domínio vão para o Carregamento ou o Cofre.', estresse: 0 };
  if (minha.lugar === para) return { erro: null, estresse: 0 };
  if (para === 'cofre') return { erro: null, estresse: 0 };
  if (c.fixaNoCofre) return { erro: `${c.nome} fica no Cofre de vez.`, estresse: 0 };
  if (!c.foraDoLimite && noCarregamento(minhas) >= MAX_CARREGAMENTO) return { erro: 'O Carregamento está cheio (5 cartas). Mande uma para o Cofre antes.', estresse: 0 };
  return { erro: null, estresse: descanso ? 0 : c.custo };
}

/** Domínios com 4 ou mais cartas no Carregamento (ativam a carta "Tocado pela/pelo..." do domínio). */
export function dominiosTocados(minhas: CartaDoPersonagem[]): Dominio[] {
  const conta = new Map<Dominio, number>();
  for (const m of minhas) {
    const c = CARTA.get(m.carta);
    if (m.lugar === 'carregamento' && c?.tipo === 'dominio') conta.set(c.dominio, (conta.get(c.dominio) ?? 0) + 1);
  }
  return [...conta].filter(([, n]) => n >= 4).map(([d]) => d);
}
