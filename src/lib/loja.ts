// Catálogo da loja da gótica. Cada item ocupa um encaixe; só um item equipado por encaixe.

export const ENCAIXES = {
  cabeca: 'Cabeça',
  rosto: 'Rosto',
  companheiro: 'Companheiro',
  fundo: 'Fundo',
} as const;

export type Encaixe = keyof typeof ENCAIXES;

export const ITENS = [
  { id: 'chapeu-bruxa', nome: 'Chapéu de bruxa', emoji: '🧙‍♀️', preco: 350, encaixe: 'cabeca' },
  { id: 'veu', nome: 'Véu de renda', emoji: '🕸️', preco: 300, encaixe: 'cabeca' },
  { id: 'orelhas-gato', nome: 'Orelhas de gatinho', emoji: '🐱', preco: 250, encaixe: 'cabeca' },
  { id: 'oculos-coracao', nome: 'Óculos de coração', emoji: '💕', preco: 150, encaixe: 'rosto' },
  { id: 'estrelas', nome: 'Estrelinhas pintadas', emoji: '✨', preco: 120, encaixe: 'rosto' },
  { id: 'gato-preto', nome: 'Gatinho preto', emoji: '🐈‍⬛', preco: 500, encaixe: 'companheiro' },
  { id: 'corvo', nome: 'Corvo', emoji: '🐦‍⬛', preco: 450, encaixe: 'companheiro' },
  { id: 'fundo-cemiterio', nome: 'Cemitério ao luar', emoji: '🪦', preco: 400, encaixe: 'fundo' },
  { id: 'fundo-lua-sangue', nome: 'Lua de sangue', emoji: '🌕', preco: 400, encaixe: 'fundo' },
  { id: 'fundo-rosas', nome: 'Jardim de rosas', emoji: '🌹', preco: 400, encaixe: 'fundo' },
] as const satisfies readonly { id: string; nome: string; emoji: string; preco: number; encaixe: Encaixe }[];

export type ItemLoja = (typeof ITENS)[number];
export type IdItem = ItemLoja['id'];
export type Equipados = Partial<Record<Encaixe, IdItem>>;

export const itemPorId = (id: string) => ITENS.find((i) => i.id === id);

/** Equipa o item no encaixe dele (trocando o que estava lá). */
export const equipar = (atual: Equipados, id: IdItem): Equipados => ({ ...atual, [itemPorId(id)!.encaixe]: id });

export function lerEquipados(json: string | null | undefined): Equipados {
  try {
    const bruto = JSON.parse(json || '{}') as Record<string, string>;
    // Ignora itens que saíram do catálogo ou estão no encaixe errado.
    return Object.fromEntries(Object.entries(bruto).filter(([enc, id]) => itemPorId(id)?.encaixe === enc)) as Equipados;
  } catch {
    return {};
  }
}
