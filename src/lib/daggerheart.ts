// Regras do Daggerheart usadas pelo /dh.

export const TRACOS = {
  agilidade: 'Agilidade',
  forca: 'Força',
  acuidade: 'Acuidade',
  instinto: 'Instinto',
  presenca: 'Presença',
  conhecimento: 'Conhecimento',
} as const;
export type Traco = keyof typeof TRACOS;

export const MAX_ESPERANCA = 6;
export const MAX_MEDO = 12;

export type Aleatorio = (faces: number) => number;
const aleatorio: Aleatorio = (faces) => Math.floor(Math.random() * faces) + 1;

export type Dualidade = {
  esperanca: number;
  medo: number;
  d6?: number; // vantagem soma, desvantagem subtrai
  modificador: number;
  total: number;
  resultado: 'critico' | 'esperanca' | 'medo';
};

// Rolagem de dualidade: d12 de Esperança + d12 de Medo + modificador (± d6 de vantagem).
// Dados iguais = sucesso crítico.
export function rolarDualidade(modificador: number, vantagem: -1 | 0 | 1 = 0, rng: Aleatorio = aleatorio): Dualidade {
  const esperanca = rng(12);
  const medo = rng(12);
  const d6 = vantagem ? rng(6) : undefined;
  const total = esperanca + medo + modificador + (d6 ? vantagem * d6 : 0);
  const resultado = esperanca === medo ? 'critico' : esperanca > medo ? 'esperanca' : 'medo';
  return { esperanca, medo, d6, modificador, total, resultado };
}

// Quantos PV o dano marca, pelos limiares: abaixo do Maior 1, Maior 2, Grave 3.
// Usar um espaço de armadura reduz em 1 (mínimo 0).
export function pvPorDano(dano: number, maior: number, grave: number, armadura = false) {
  if (dano <= 0) return 0;
  const pv = dano >= grave ? 3 : dano >= maior ? 2 : 1;
  return Math.max(0, pv - (armadura ? 1 : 0));
}

export const GRAVIDADE = ['nenhum', 'Menor', 'Maior', 'Grave'] as const;

// Barra de espaços: ■ marcados, □ livres.
export const barra = (marcados: number, max: number) => '■'.repeat(Math.min(marcados, max)) + '□'.repeat(Math.max(0, max - marcados));

// "Ladrão de Cofres +2, Criado nas Ruas 2" → [{nome, bonus}]
export function lerExperiencias(texto: string) {
  return texto
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((parte) => {
      const m = parte.match(/^(.+?)\s*\+?(\d)?$/);
      return { nome: m![1].trim(), bonus: Number(m![2] ?? 2) };
    });
}

export const serializarExperiencias = (lista: { nome: string; bonus: number }[]) =>
  lista.map((e) => `${e.nome.replace(/[,|]/g, ' ')}|${e.bonus}`).join(',');

export const desserializarExperiencias = (texto: string) =>
  texto
    ? texto.split(',').map((item) => {
        const [nome, bonus] = item.split('|');
        return { nome, bonus: Number(bonus) || 2 };
      })
    : [];
