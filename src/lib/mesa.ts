// Regras da mesa do mapa que não dependem do Discord: alcance do Daggerheart em casas, descansos,
// relógios de progresso e áreas de efeito.

// ---------- Alcance (grade opcional do Daggerheart: 1 casa ≈ 1 m e meio) ----------

/** Faixa de alcance do Daggerheart para uma distância em casas da grade. */
export function faixaDH(casas: number) {
  if (casas <= 1.05) return 'Corpo a corpo';
  if (casas <= 3.05) return 'Muito Próximo';
  if (casas <= 6.05) return 'Próximo';
  if (casas <= 12.05) return 'Longe';
  return 'Muito Longe';
}

// ---------- Descanso (Daggerheart) ----------

/** Tier do personagem pelo nível: 1 → 1, 2–4 → 2, 5–7 → 3, 8–10 → 4. */
export const tierDoNivel = (nivel: number) => (nivel <= 1 ? 1 : nivel <= 4 ? 2 : nivel <= 7 ? 3 : 4);

export const MOVIMENTOS_DESCANSO = ['ferimentos', 'estresse', 'armadura', 'preparar'] as const;
export type MovimentoDescanso = (typeof MOVIMENTOS_DESCANSO)[number];
export const NOMES_DESCANSO: Record<MovimentoDescanso, string> = {
  ferimentos: '🩹 Cuidar dos ferimentos',
  estresse: '😮‍💨 Aliviar o Estresse',
  armadura: '🛡️ Consertar a armadura',
  preparar: '🔥 Preparar-se',
};

type FichaDescanso = { nivel: number; pv: number; estresse: number; armadura: number; esperanca: number };

/**
 * Aplica um descanso: dois movimentos (pode repetir). No curto, cuidar/aliviar/consertar recupera 1d4 + tier;
 * no longo, recupera tudo. Preparar dá 1 Esperança (2 se o grupo se preparar junto).
 * pv, estresse e armadura são as marcas na ficha (0 = nada marcado).
 */
export function aplicarDescanso(
  ficha: FichaDescanso,
  tipo: 'curto' | 'longo',
  escolhas: MovimentoDescanso[],
  juntos: boolean,
  maxEsperanca: number,
  rolarD4: () => number,
) {
  if (escolhas.length !== 2 || !escolhas.every((e) => MOVIMENTOS_DESCANSO.includes(e))) throw new Error('Escolha dois movimentos de descanso.');
  const novo = { ...ficha };
  const partes: string[] = [];
  const tier = tierDoNivel(ficha.nivel);
  for (const e of escolhas) {
    if (e === 'preparar') {
      const ganho = juntos ? 2 : 1;
      novo.esperanca = Math.min(maxEsperanca, novo.esperanca + ganho);
      partes.push(`${NOMES_DESCANSO[e]}: +${ganho} Esperança${juntos ? ' (com o grupo)' : ''}`);
      continue;
    }
    const campo = e === 'ferimentos' ? 'pv' : e === 'estresse' ? 'estresse' : 'armadura';
    const rotulo = e === 'ferimentos' ? 'PV' : e === 'estresse' ? 'Estresse' : 'Armadura';
    if (tipo === 'longo') {
      partes.push(`${NOMES_DESCANSO[e]}: limpou ${novo[campo]} de ${rotulo}`);
      novo[campo] = 0;
    } else {
      const rolagem = rolarD4() + tier;
      const limpou = Math.min(novo[campo], rolagem);
      novo[campo] -= limpou;
      partes.push(`${NOMES_DESCANSO[e]}: 1d4+${tier} = ${rolagem}, limpou ${limpou} de ${rotulo}`);
    }
  }
  return { ficha: novo, texto: partes.join(' · ') };
}

/** Medo que o mestre ganha quando o grupo descansa: curto 1d4; longo 1d4 + número de PJs. */
export const medoDoDescanso = (tipo: 'curto' | 'longo', pjs: number, rolarD4: () => number) => rolarD4() + (tipo === 'longo' ? pjs : 0);

// ---------- Relógios de progresso ----------

export const TAMANHOS_RELOGIO = [4, 6, 8, 10, 12] as const;

export function validarRelogio(corpo: Record<string, unknown>) {
  const nome = String(corpo.nome ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!nome) throw new Error('Dê um nome para o relógio (ex.: Os guardas chegam).');
  const total = Number(corpo.total);
  if (!TAMANHOS_RELOGIO.includes(total as (typeof TAMANHOS_RELOGIO)[number])) throw new Error('O relógio tem 4, 6, 8, 10 ou 12 partes.');
  return { nome, total, secreto: corpo.secreto ? 1 : 0 };
}

// ---------- Áreas de efeito ----------

export type Area = { id: number; forma: 'circulo' | 'cone' | 'linha'; x: number; y: number; x2: number; y2: number; quem: string; cor: string };

/** Área desenhada no mapa: origem (x, y) e ponto de alcance (x2, y2), dentro do mapa. */
export function validarArea(corpo: Record<string, unknown>, largura: number, altura: number): Omit<Area, 'id' | 'quem' | 'cor'> {
  const forma = String(corpo.forma);
  if (forma !== 'circulo' && forma !== 'cone' && forma !== 'linha') throw new Error('Forma desconhecida.');
  const n = (v: unknown, max: number) => {
    const x = Number(v);
    if (!Number.isFinite(x)) throw new Error('Posição inválida.');
    return Math.round(Math.min(max, Math.max(0, x)));
  };
  const area = { forma: forma as Area['forma'], x: n(corpo.x, largura), y: n(corpo.y, altura), x2: n(corpo.x2, largura), y2: n(corpo.y2, altura) };
  if (Math.hypot(area.x2 - area.x, area.y2 - area.y) < 2) throw new Error('Arraste para dar o tamanho da área.');
  return area;
}
