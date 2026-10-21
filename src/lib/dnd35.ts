// Regras do D&D 3.5 usadas pelas fichas e testes (nomes do Livro do Jogador em português).

export const ATRIBUTOS = {
  forca: 'Força',
  destreza: 'Destreza',
  constituicao: 'Constituição',
  inteligencia: 'Inteligência',
  sabedoria: 'Sabedoria',
  carisma: 'Carisma',
} as const;
export type Atributo = keyof typeof ATRIBUTOS;

export const abreviar = (a: Atributo) => ATRIBUTOS[a].slice(0, 3).toUpperCase();

export const RESISTENCIAS = {
  fort: { nome: 'Fortitude', atributo: 'constituicao' },
  ref: { nome: 'Reflexos', atributo: 'destreza' },
  von: { nome: 'Vontade', atributo: 'sabedoria' },
} as const satisfies Record<string, { nome: string; atributo: Atributo }>;
export type Resistencia = keyof typeof RESISTENCIAS;

export type Pericia = { id: string; nome: string; atributo: Atributo; treinada: boolean };

// [nome, atributo, só pode ser usada com graduação?]
const LISTA: [string, Atributo, boolean][] = [
  ['Abrir Fechaduras', 'destreza', true],
  ['Acrobacia', 'destreza', true],
  ['Adestrar Animais', 'carisma', true],
  ['Arte da Fuga', 'destreza', false],
  ['Atuação', 'carisma', false],
  ['Avaliação', 'inteligencia', false],
  ['Blefar', 'carisma', false],
  ['Cavalgar', 'destreza', false],
  ['Concentração', 'constituicao', false],
  ['Conhecimento (Arcano)', 'inteligencia', true],
  ['Conhecimento (Arquitetura e Engenharia)', 'inteligencia', true],
  ['Conhecimento (Geografia)', 'inteligencia', true],
  ['Conhecimento (História)', 'inteligencia', true],
  ['Conhecimento (Local)', 'inteligencia', true],
  ['Conhecimento (Masmorras)', 'inteligencia', true],
  ['Conhecimento (Natureza)', 'inteligencia', true],
  ['Conhecimento (Nobreza e Realeza)', 'inteligencia', true],
  ['Conhecimento (Os Planos)', 'inteligencia', true],
  ['Conhecimento (Religião)', 'inteligencia', true],
  ['Cura', 'sabedoria', false],
  ['Decifrar Escrita', 'inteligencia', true],
  ['Diplomacia', 'carisma', false],
  ['Disfarces', 'carisma', false],
  ['Equilíbrio', 'destreza', false],
  ['Escalar', 'forca', false],
  ['Esconder-se', 'destreza', false],
  ['Falsificação', 'inteligencia', false],
  ['Furtividade', 'destreza', false],
  ['Identificar Magia', 'inteligencia', true],
  ['Intimidação', 'carisma', false],
  ['Natação', 'forca', false],
  ['Observar', 'sabedoria', false],
  ['Obter Informação', 'carisma', false],
  ['Ofícios', 'inteligencia', false],
  ['Operar Mecanismo', 'inteligencia', true],
  ['Ouvir', 'sabedoria', false],
  ['Prestidigitação', 'destreza', true],
  ['Procurar', 'inteligencia', false],
  ['Profissão', 'sabedoria', true],
  ['Saltar', 'forca', false],
  ['Sentir Motivação', 'sabedoria', false],
  ['Sobrevivência', 'sabedoria', false],
  ['Usar Cordas', 'destreza', false],
  ['Usar Instrumento Mágico', 'carisma', true],
];

// "Conhecimento (Os Planos)" → "conhecimento os planos"
export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const PERICIAS: Pericia[] = LISTA.map(([nome, atributo, treinada]) => ({
  id: normalizar(nome).replace(/ /g, '-'),
  nome,
  atributo,
  treinada,
}));
const porId = new Map(PERICIAS.map((p) => [p.id, p]));
export const periciaPorId = (id: string) => porId.get(id);

export function acharPericia(texto: string): Pericia | undefined {
  const alvo = normalizar(texto);
  return porId.get(alvo.replace(/ /g, '-')) ?? PERICIAS.find((p) => normalizar(p.nome) === alvo);
}

// "esconder-se 5, ouvir 4, conhecimento (arcano) 6" → { 'esconder-se': 5, ouvir: 4, ... }
// Graduação 0 tira a perícia da lista.
export function lerGraduacoes(texto: string): Map<string, number> {
  const resultado = new Map<string, number>();
  for (const parte of texto.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = parte.match(/^(.+?)\s*[=:]?\s*(\d{1,2})$/);
    if (!m) throw new Error(`Faltou a graduação em "${parte}". Ex.: esconder-se 5`);
    const pericia = acharPericia(m[1]);
    if (!pericia) throw new Error(`Não conheço a perícia "${m[1]}".`);
    resultado.set(pericia.id, Number(m[2]));
  }
  return resultado;
}

// Formato salvo no banco: "esconder-se:5,ouvir:4"
export const serializarGraduacoes = (g: Map<string, number>) =>
  [...g].filter(([, n]) => n > 0).map(([id, n]) => `${id}:${n}`).join(',');

export function desserializarGraduacoes(texto: string): Map<string, number> {
  const g = new Map<string, number>();
  for (const item of texto.split(',')) {
    const [id, n] = item.split(':');
    if (porId.has(id) && Number(n) > 0) g.set(id, Number(n));
  }
  return g;
}

export const modificador = (atributo: number) => Math.floor((atributo - 10) / 2);

// 0 PV: incapacitado · -1 a -9: morrendo · -10: morto.
export function estadoVida(pv: number) {
  if (pv <= -10) return '☠️ **Morto.**';
  if (pv < 0) return '💀 **Morrendo!** Perde 1 PV por rodada até estabilizar: `/teste estabilizar`.';
  if (pv === 0) return '😵 **Incapacitado:** só uma ação padrão ou de movimento por rodada.';
  return '';
}
