// Bestiário e encontros do Daggerheart.
// O bestiário vem do livro do mestre (texto do PDF, lido por lerBestiario); as regras do encontro são do Guia de Batalha (p. 197).

export const TIPOS_ADVERSARIO = ['Lacaio', 'Social', 'Suporte', 'Horda', 'À distância', 'Skulk', 'Padrão', 'Líder', 'Bruiser', 'Solo'] as const;
export type TipoAdversario = (typeof TIPOS_ADVERSARIO)[number];

export type Adversario = {
  id: string;
  nome: string;
  nivel: number; // tier 1 a 4
  nivelEstimado: boolean; // o PDF perdeu o número do tier: estimado pela Dificuldade
  tipo: TipoAdversario;
  descricao: string;
  motivos: string;
  dificuldade: number;
  limiarMaior: number | null;
  limiarGrave: number | null;
  pv: number;
  estresse: number;
  ataque: number;
  arma: string;
  alcance: string;
  dano: string; // rolagem (ex.: 2d8+5)
  tipoDano: 'fís' | 'mág' | '';
  experiencias: string;
  recursos: string[];
  horda: number | null; // Horda (5/HP): quantos por PV
};

// Palavras do tipo como aparecem no livro (tradução mista PT/EN).
const PALAVRAS_TIPO: [RegExp, TipoAdversario][] = [
  [/\b(minion|lacaio)/i, 'Lacaio'],
  [/\bsocial\b/i, 'Social'],
  [/\b(suporte|support)\b/i, 'Suporte'],
  [/\b(horda|horde)\b/i, 'Horda'],
  [/(à distância|a distância|ranged|longo alcance)/i, 'À distância'],
  [/\bskulk\b/i, 'Skulk'],
  [/\b(líder|leader)\b/i, 'Líder'],
  [/\bbruiser\b/i, 'Bruiser'],
  [/\bsolo\b/i, 'Solo'],
  [/\b(padrão|standard)\b/i, 'Padrão'],
];

const ehNome = (l: string) => l.length >= 3 && l.length <= 60 && /[A-ZÀ-Ý]{3}/.test(l) && l === l.toLocaleUpperCase('pt-BR') && !/^(RECURSOS|CAPÍTULO)/.test(l);
const RE_STATS = /^Dificuldade:\s*(\d+)\s*\|\s*Thresholds:\s*([^|]+)\|\s*HP:\s*(\d+)\s*\|\s*(?:Estresse|Stress):\s*(\d+)/i;
const RE_ATAQUE = /AT[QK]:\s*([+\-−]?\s*\d+)\s*\|\s*([^|]+?):\s*([^|]+?)\|\s*(\d[0-9d+\-−]*)\s*(phy\/mag|phy|mag|fís|mág)?/i;
// Início de um recurso: "Nome - Passivo:" logo no começo ou depois do fim de uma frase.
const RE_RECURSO = /(?:^|(?<=[.!?”")]\s))[^.!?:]{1,60}? - (?:Passiv[oa]|Aç[ãa]o|Reaç[ãa]o)\b/g;
const SECAO = /^ADVERSÁRIOS DE NÍVEL (\d)\b[^)]*\)\s*/;

const idDe = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const capitalizar = (nome: string) => nome.toLocaleLowerCase('pt-BR').replace(/(^|[\s\-(])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('pt-BR'));

/** Tier pela Dificuldade, quando o número sumiu no PDF (as faixas do livro: 1 ≈ até 13, 2 ≈ 14–15, 3 ≈ 16–17, 4 ≈ 18+). */
export const nivelPelaDificuldade = (d: number) => (d <= 13 ? 1 : d <= 15 ? 2 : d <= 17 ? 3 : 4);

/** Lê os blocos de adversário do texto do livro. Repetidos (exemplos do guia) ficam só uma vez, preferindo o que tem o tier. */
export function lerBestiario(texto: string): Adversario[] {
  const linhas = texto.replace(/\r/g, '').replace(/[\f\0]/g, '').split('\n').map((l) => l.trim());
  const achados = new Map<string, Adversario>();
  // O bestiário é dividido em seções por tier; antes delas (exemplos do guia) o tier vem do próprio bloco.
  const tierDaLinha: (number | null)[] = [];
  let secao: number | null = null;
  for (const [k, l] of linhas.entries()) {
    const t = SECAO.exec(l);
    if (t) { secao = Number(t[1]); linhas[k] = l.slice(t[0].length); }
    if (/^AMBIENTES\b/.test(l)) secao = null;
    tierDaLinha.push(secao);
  }
  for (let i = 0; i < linhas.length; i++) {
    const s = RE_STATS.exec(linhas[i]);
    if (!s) continue;
    // Cabeçalho: do nome (linha toda em maiúsculas) até a linha antes das estatísticas.
    let n = i - 1;
    while (n >= Math.max(0, i - 5) && !ehNome(linhas[n])) n--;
    if (n < Math.max(0, i - 5)) continue;
    const cabecalho = linhas.slice(n + 1, i).join(' ').replace(/\s+/g, ' ').trim();
    const [antes, motivos = ''] = cabecalho.split(/Motivos e táticas:\s*/i);
    const tierTxt = /(?:N[ií]vel|Tier)\s*(\d)/i.exec(antes);
    const tipo = PALAVRAS_TIPO.find(([re]) => re.test(antes))?.[1] ?? 'Padrão';
    const hordaTxt = /\((\d+)\s*\/\s*(?:HP|PV)\)/i.exec(antes);
    const descricao = antes
      .replace(/^(?:\S+\s+){0,3}?(?:de\s+)?(?:N[ií]vel|Tier)\s*\S*\s*(?:\(\S+\/(?:HP|PV)\))?\s*/i, '')
      .replace(/^(?:minion|lacaio|social|suporte|support|horda|horde|à distância|skulk|líder|leader|bruiser|solo|padrão|standard)\s+/i, '')
      .replace(/^\(\S+\/(?:HP|PV)\)\s*/i, '')
      .trim();

    // Estatísticas e ataque (às vezes o ATQ cai na linha de baixo).
    let resto = linhas[i].slice(s[0].length);
    let j = i + 1;
    if (!/AT[QK]:/i.test(resto) && /^AT[QK]:/i.test(linhas[j] ?? '')) resto = linhas[j++];
    else resto = resto.slice(Math.max(0, resto.search(/AT[QK]:/i)));
    const atq = RE_ATAQUE.exec(resto.trim());
    const [maior, grave] = s[2].split('/').map((v) => (/\d/.test(v) ? Number(v.replace(/\D/g, '')) : null));
    let experiencias = /Experiência:\s*(.+)$/i.exec(resto)?.[1].trim() ?? '';
    const recursosTxt: string[] = [];
    let emRecursos = false;
    for (; j < linhas.length && j < i + 40; j++) {
      const l = linhas[j];
      if (!l || /^Capítulo\b/i.test(l) || /^\d+$/.test(l) || RE_STATS.test(l)) break;
      if (/^Experiência:/i.test(l)) { experiencias = l.replace(/^Experiência:\s*/i, ''); continue; }
      if (/^RECURSOS$/i.test(l)) { emRecursos = true; continue; }
      if (!emRecursos) break;
      if (ehNome(l) && j + 1 < linhas.length && /(N[ií]vel|Tier)/i.test(linhas[j + 1])) break;
      recursosTxt.push(l);
    }
    const corrido = recursosTxt.join(' ').replace(/\s+/g, ' ').trim();
    const inicios = [...corrido.matchAll(RE_RECURSO)].map((m) => m.index!);
    if (inicios[0] !== 0) inicios.unshift(0);
    const recursos = inicios.map((ini, k) => corrido.slice(ini, inicios[k + 1]).trim()).filter(Boolean);
    const nome = capitalizar(linhas[n]);
    const dificuldade = Number(s[1]);
    const adv: Adversario = {
      id: idDe(nome),
      nome,
      nivel: tierDaLinha[i] ?? (tierTxt ? Number(tierTxt[1]) : nivelPelaDificuldade(dificuldade)),
      nivelEstimado: !tierDaLinha[i] && !tierTxt,
      tipo,
      descricao,
      motivos: motivos.trim(),
      dificuldade,
      limiarMaior: maior ?? null,
      limiarGrave: grave ?? null,
      pv: Number(s[3]),
      estresse: Number(s[4]),
      ataque: atq ? Number(atq[1].replace(/[−\s]/g, (c) => (c === '−' ? '-' : ''))) : 0,
      arma: atq?.[2].trim() ?? '',
      alcance: atq?.[3].trim() ?? '',
      dano: atq ? atq[4].replace(/[\s]/g, '').replace(/−/g, '-') : '',
      tipoDano: !atq?.[5] ? '' : /ph|fí/i.test(atq[5]) ? 'fís' : 'mág',
      experiencias,
      recursos,
      horda: hordaTxt ? Number(hordaTxt[1]) : null,
    };
    const antigo = achados.get(adv.id);
    if (!antigo || (antigo.nivelEstimado && !adv.nivelEstimado) || antigo.recursos.length < adv.recursos.length) achados.set(adv.id, adv);
  }
  return [...achados.values()].sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Notas da biblioteca (até 1000 letras): tipo, motivos, experiências e recursos. */
export function notasDoAdversario(a: Adversario) {
  const partes = [
    `${a.tipo} · Nível ${a.nivel}${a.horda ? ` · Horda (${a.horda}/PV)` : ''} · Estresse ${a.estresse}`,
    a.arma ? `Ataque: ${a.arma} (${a.alcance}) ${a.dano} ${a.tipoDano}` : '',
    a.motivos ? `Motivos: ${a.motivos}` : '',
    a.experiencias ? `Experiência: ${a.experiencias}` : '',
    ...a.recursos,
  ].filter(Boolean);
  return partes.join('\n').slice(0, 1000);
}

// ---------- Guia de batalha (p. 197) ----------

/** Custo em Pontos de Batalha de cada tipo (lacaios: 1 ponto por grupo do tamanho do grupo de PJs). */
export const CUSTO_TIPO: Record<TipoAdversario, number> = {
  Lacaio: 1, Social: 1, Suporte: 1, Horda: 2, 'À distância': 2, Skulk: 2, Padrão: 2, Líder: 3, Bruiser: 4, Solo: 5,
};

export type AjustesEncontro = { maisFacil?: boolean; maisDificil?: boolean; danoExtra?: boolean; nivelAbaixo?: boolean };

/** Pontos de Batalha: (3 × PJs) + 2, com os ajustes do livro. */
export function pontosDeBatalha(pjs: number, ajustes: AjustesEncontro = {}, escolhidos: Adversario[] = []) {
  let total = 3 * pjs + 2;
  if (ajustes.maisFacil) total -= 1;
  if (ajustes.maisDificil) total += 2;
  if (ajustes.danoExtra) total -= 2;
  if (ajustes.nivelAbaixo) total += 1;
  if (escolhidos.filter((a) => a.tipo === 'Solo').length >= 2) total -= 2;
  if (escolhidos.length && !escolhidos.some((a) => ['Bruiser', 'Horda', 'Líder', 'Solo'].includes(a.tipo))) total += 1;
  return total;
}

/** Custo de uma lista de adversários (cada lacaio da lista é um grupo do tamanho do grupo de PJs). */
export const custoDe = (lista: Adversario[]) => lista.reduce((t, a) => t + CUSTO_TIPO[a.tipo], 0);

/**
 * Sugere um encontro equilibrado: gasta os Pontos de Batalha com adversários do nível pedido,
 * tentando variar os tipos (uma linha de frente, quem ataca de longe, apoio e lacaios para completar).
 */
export function sugerirEncontro(bestiario: Adversario[], nivel: number, pjs: number, ajustes: AjustesEncontro = {}, sorte: () => number = Math.random) {
  const doNivel = bestiario.filter((a) => a.nivel === nivel);
  const porTipo = (t: TipoAdversario[]) => doNivel.filter((a) => t.includes(a.tipo));
  const sorteia = <T,>(l: T[]) => l[Math.floor(sorte() * l.length)];
  const escolhidos: Adversario[] = [];
  const orcamento = () => pontosDeBatalha(pjs, ajustes, escolhidos);
  const cabe = (a: Adversario) => custoDe([...escolhidos, a]) <= pontosDeBatalha(pjs, ajustes, [...escolhidos, a]);
  // Um chefe às vezes (Líder ou Bruiser), depois a tropa.
  const planos: TipoAdversario[][] = [['Líder', 'Bruiser'], ['Padrão'], ['À distância', 'Skulk'], ['Padrão', 'Horda'], ['Suporte', 'Social'], ['Padrão', 'À distância', 'Skulk']];
  for (const plano of planos) {
    const opcoes = porTipo(plano).filter(cabe);
    if (opcoes.length && (plano[0] !== 'Líder' || sorte() < 0.7)) escolhidos.push(sorteia(opcoes));
  }
  for (let guarda = 0; guarda < 30 && custoDe(escolhidos) < orcamento(); guarda++) {
    const opcoes = doNivel.filter((a) => a.tipo !== 'Solo' && cabe(a));
    if (!opcoes.length) break;
    // Sobrou pouco: lacaios completam.
    const lacaios = opcoes.filter((a) => a.tipo === 'Lacaio');
    escolhidos.push(sorteia(orcamento() - custoDe(escolhidos) <= 1 && lacaios.length ? lacaios : opcoes));
  }
  return { escolhidos, pontos: orcamento(), gastos: custoDe(escolhidos) };
}
