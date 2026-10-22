// Dados e imagens oficiais do League of Legends via Data Dragon da Riot (público, sem chave).
// Tudo com cache em memória para não buscar a cada comando.

const BASE = 'https://ddragon.leagueoflegends.com';
const SEIS_HORAS = 6 * 3_600_000;

let versao: { valor: string; em: number } | undefined;
const cacheJson = new Map<string, unknown>();

async function json<T>(url: string): Promise<T> {
  if (cacheJson.has(url)) return cacheJson.get(url) as T;
  const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`Data Dragon ${r.status}: ${url}`);
  const dados = (await r.json()) as T;
  cacheJson.set(url, dados);
  return dados;
}

export async function versaoAtual(): Promise<string> {
  if (versao && Date.now() - versao.em < SEIS_HORAS) return versao.valor;
  const r = await fetch(`${BASE}/api/versions.json`, { signal: AbortSignal.timeout(8_000) });
  const lista = (await r.json()) as string[];
  versao = { valor: lista[0], em: Date.now() };
  return versao.valor;
}

export type Campeao = { id: string; name: string; title: string; key: string };
export type Skin = { num: number; name: string };
type DetalheCampeao = Campeao & {
  skins: Skin[];
  spells: { name: string; description: string }[];
  passive: { name: string; description: string };
};

export async function campeoes(): Promise<Campeao[]> {
  const v = await versaoAtual();
  const dados = await json<{ data: Record<string, Campeao> }>(`${BASE}/cdn/${v}/data/pt_BR/champion.json`);
  return Object.values(dados.data);
}

export async function detalheCampeao(id: string): Promise<DetalheCampeao> {
  const v = await versaoAtual();
  const dados = await json<{ data: Record<string, DetalheCampeao> }>(`${BASE}/cdn/${v}/data/pt_BR/champion/${id}.json`);
  return dados.data[id];
}

/** Variações de cor (chromas) não têm splash própria: ficam de fora. */
export const ehChroma = (s: Skin) => s.name.includes('(') || /^croma/i.test(s.name);

const skinsValidas = new Map<string, Skin[]>();

/** Algumas skins antigas (variações de cor com nome normal) também não têm splash: confere uma vez e guarda. */
export async function skinsComSplash(id: string): Promise<Skin[]> {
  const salvas = skinsValidas.get(id);
  if (salvas) return salvas;
  try {
    const candidatas = (await detalheCampeao(id)).skins.filter((s) => !ehChroma(s));
    const ok = await Promise.all(
      candidatas.map((s) =>
        fetch(urlSplash(id, s.num), { method: 'HEAD', signal: AbortSignal.timeout(5_000) }).then((r) => r.ok, () => false),
      ),
    );
    const skins = candidatas.filter((_, k) => ok[k]);
    if (!skins.length) return [{ num: 0, name: id }];
    skinsValidas.set(id, skins);
    return skins;
  } catch {
    return [{ num: 0, name: id }];
  }
}

export const urlSplash = (id: string, num: number) => `${BASE}/cdn/img/champion/splash/${id}_${num}.jpg`;
export const urlIcone = (versaoDd: string, id: string) => `${BASE}/cdn/${versaoDd}/img/champion/${id}.png`;
