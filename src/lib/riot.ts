// API oficial da Riot (League of Legends). Precisa de RIOT_API_KEY no .env (developer.riotgames.com).

export const REGIOES = {
  br1: { nome: 'Brasil', rota: 'americas' },
  na1: { nome: 'América do Norte', rota: 'americas' },
  la1: { nome: 'LAN', rota: 'americas' },
  la2: { nome: 'LAS', rota: 'americas' },
  euw1: { nome: 'Europa Oeste', rota: 'europe' },
  kr: { nome: 'Coreia', rota: 'asia' },
} as const;
export type Regiao = keyof typeof REGIOES;

export class ErroRiot extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

async function chamar<T>(url: string): Promise<T> {
  const chave = process.env.RIOT_API_KEY;
  if (!chave) throw new ErroRiot(0, 'sem chave');
  const r = await fetch(url, { headers: { 'X-Riot-Token': chave }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new ErroRiot(r.status, `Riot ${r.status}`);
  return (await r.json()) as T;
}

/** "Nome#TAG" → partes; aceita espaço no nome. */
export function separarRiotId(texto: string) {
  const [nome, tag] = texto.trim().split('#');
  if (!nome || !tag) return undefined;
  return { nome: nome.trim(), tag: tag.trim() };
}

export type Fila = { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number };
export type Partida = { campeao: string; k: number; d: number; a: number; venceu: boolean; modo: string; quando: number };

export async function perfilLol(riotId: string, regiao: Regiao) {
  const id = separarRiotId(riotId);
  if (!id) throw new ErroRiot(400, 'Riot ID precisa ser no formato Nome#TAG');
  const { rota } = REGIOES[regiao];
  const conta = await chamar<{ puuid: string; gameName: string; tagLine: string }>(
    `https://${rota}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(id.nome)}/${encodeURIComponent(id.tag)}`,
  );
  const base = `https://${regiao}.api.riotgames.com/lol`;
  const [invocador, filas, maestrias, idsPartidas] = await Promise.all([
    chamar<{ profileIconId: number; summonerLevel: number }>(`${base}/summoner/v4/summoners/by-puuid/${conta.puuid}`),
    chamar<Fila[]>(`${base}/league/v4/entries/by-puuid/${conta.puuid}`),
    chamar<{ championId: number; championLevel: number; championPoints: number }[]>(`${base}/champion-mastery/v4/champion-masteries/by-puuid/${conta.puuid}/top?count=3`),
    chamar<string[]>(`https://${rota}.api.riotgames.com/lol/match/v5/matches/by-puuid/${conta.puuid}/ids?count=5`),
  ]);
  const partidas: Partida[] = [];
  for (const idPartida of idsPartidas) {
    const p = await chamar<{ info: { gameMode: string; gameEndTimestamp: number; participants: { puuid: string; championName: string; kills: number; deaths: number; assists: number; win: boolean }[] } }>(
      `https://${rota}.api.riotgames.com/lol/match/v5/matches/${idPartida}`,
    ).catch(() => null);
    const eu = p?.info.participants.find((x) => x.puuid === conta.puuid);
    if (p && eu) partidas.push({ campeao: eu.championName, k: eu.kills, d: eu.deaths, a: eu.assists, venceu: eu.win, modo: p.info.gameMode, quando: p.info.gameEndTimestamp });
  }
  return { nome: `${conta.gameName}#${conta.tagLine}`, nivel: invocador.summonerLevel, icone: invocador.profileIconId, filas, maestrias, partidas };
}

const TIERS: Record<string, string> = {
  IRON: 'Ferro', BRONZE: 'Bronze', SILVER: 'Prata', GOLD: 'Ouro', PLATINUM: 'Platina', EMERALD: 'Esmeralda',
  DIAMOND: 'Diamante', MASTER: 'Mestre', GRANDMASTER: 'Grão-Mestre', CHALLENGER: 'Desafiante',
};
const SEM_DIVISAO = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

/** "Ouro II · 54 PdL · 61% (33V 21D)". */
export function textoElo(f: Fila | undefined) {
  if (!f) return 'Sem ranque';
  const nome = `${TIERS[f.tier] ?? f.tier}${SEM_DIVISAO.has(f.tier) ? '' : ` ${f.rank}`}`;
  const total = f.wins + f.losses;
  const taxa = total ? Math.round((f.wins / total) * 100) : 0;
  return `${nome} · ${f.leaguePoints} PdL · ${taxa}% (${f.wins}V ${f.losses}D)`;
}

export const kda = (p: Partida) => `${p.k}/${p.d}/${p.a}`;
