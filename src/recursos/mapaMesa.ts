// Ferramentas da mesa do mapa (rotas e partes do estado), separadas do mapa.ts para ele não crescer mais:
// áreas de efeito, relógios de progresso, descansos guiados, histórico do personagem, notas da cena,
// roteiro da sessão, bestiário com encontros e pedidos de música dos jogadores.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { db } from '../db.ts';
import { ehAmbiente, type ComandoMusica } from '../lib/ambientes.ts';
import { type Adversario, notasDoAdversario, sugerirEncontro, CUSTO_TIPO, pontosDeBatalha, custoDe } from '../lib/bestiario.ts';
import { rolar } from '../lib/dados.ts';
import { MAX_ESPERANCA, MAX_MEDO } from '../lib/daggerheart.ts';
import { type Criatura } from '../lib/fichaMapa.ts';
import { aplicarDescanso, medoDoDescanso, MOVIMENTOS_DESCANSO, validarArea, validarRelogio, type Area, type MovimentoDescanso } from '../lib/mesa.ts';

/** O que o mapa.ts empresta para as rotas daqui. */
export type Mesa = {
  c: { id: number; guild_id: string; sistema: 'dh' | 'dnd'; mestre_id: string };
  userId: string;
  souMestre: boolean;
  avisar: (soMestre?: boolean) => void;
  /** Linha no chat da mesa em nome de quem pediu (ou do personagem de outro jogador, se `como` vier). */
  falar: (texto: string, opcoes?: { como?: string; discord?: boolean }) => Promise<void>;
  ficha: (u: string) => Record<string, unknown> | undefined;
  jogadores: () => string[];
  mapa: () => { largura: number; altura: number; grade: number; cena_id: number | null };
  tocar: (comando: ComandoMusica) => Promise<{ ok: boolean; msg: string }>;
  abrirCena: (id: number) => Promise<boolean>;
  mostrarHandout: (id: number | null) => boolean;
  criarCriatura: (v: Criatura) => number;
  colocarCriatura: (id: number, x?: number, y?: number) => { peca: number; nome: string } | string;
  nomeDe: (u: string) => Promise<string>;
};

type Resposta = { status: number; corpo: unknown };
const ok = (corpo: Record<string, unknown> = {}): Resposta => ({ status: 200, corpo: { ok: true, ...corpo } });
const erro = (status: number, msg: string): Resposta => ({ status, corpo: { erro: msg } });

// ---------- Histórico do personagem ----------

/** Uma linha na linha do tempo do personagem (nível, cartas, descansos, quedas...). */
export function registrarHistorico(guildId: string, userId: string, texto: string) {
  db.prepare('INSERT INTO personagem_historico (guild_id, user_id, em, texto) VALUES (?, ?, ?, ?)').run(guildId, userId, Date.now(), texto.slice(0, 200));
  // Guarda as 300 mais recentes de cada personagem.
  db.prepare(
    'DELETE FROM personagem_historico WHERE guild_id = ? AND user_id = ? AND id <= (SELECT id FROM personagem_historico WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1 OFFSET 300)',
  ).run(guildId, userId, guildId, userId);
}
const historicoDe = (guildId: string, userId: string) =>
  db.prepare('SELECT em, texto FROM personagem_historico WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 60').all(guildId, userId) as { em: number; texto: string }[];

// ---------- Áreas (em memória: somem quando o bot reinicia, como um desenho na mesa) ----------

const areas = new Map<number, Area[]>();
let proximaArea = 1;
const MAX_AREAS = 24;

// ---------- Pedidos de música dos jogadores (em memória, o mestre aceita ou recusa) ----------

type Pedido = { id: number; userId: string; quem: string; busca: string; em: number };
const pedidos = new Map<number, Pedido[]>();
let proximoPedido = 1;
const ultimoPedido = new Map<string, number>();

// ---------- Bestiário (dados/bestiario/<sistema>.json, montado do livro pelo scripts/bestiario-dh.ts) ----------

let bestiarioCache: { mtime: number; lista: Adversario[] } | null = null;
const ARQUIVO_BESTIARIO = 'dados/bestiario/dh.json';
export function bestiario(): Adversario[] {
  if (!existsSync(ARQUIVO_BESTIARIO)) return [];
  const mtime = statSync(ARQUIVO_BESTIARIO).mtimeMs;
  if (bestiarioCache?.mtime !== mtime) {
    try {
      bestiarioCache = { mtime, lista: JSON.parse(readFileSync(ARQUIVO_BESTIARIO, 'utf8')) as Adversario[] };
    } catch (e) {
      console.error('[mapa] bestiário ilegível:', e);
      bestiarioCache = { mtime, lista: [] };
    }
  }
  return bestiarioCache.lista;
}

/** Adversário do livro vira uma entrada da biblioteca da campanha (se já existe uma com o mesmo nome, usa ela). */
function importarAdversario(m: Mesa, a: Adversario) {
  const ja = db.prepare('SELECT id FROM campanha_criaturas WHERE campanha_id = ? AND nome = ? COLLATE NOCASE').get(m.c.id, a.nome.slice(0, 40)) as { id: number } | undefined;
  if (ja) return ja.id;
  const dano = /^\d+(d\d+)?([+-]\d+)?$/i.test(a.dano) ? a.dano.toLowerCase() : '';
  return m.criarCriatura({
    tipo: a.tipo === 'Social' ? 'npc' : 'inimigo',
    nome: a.nome.slice(0, 40),
    tamanho: a.tipo === 'Solo' || a.tipo === 'Bruiser' ? 2 : 1,
    pv_max: a.pv,
    defesa: a.dificuldade,
    ataque: a.ataque,
    dano,
    limiar_maior: a.limiarMaior,
    limiar_grave: a.limiarGrave !== null && a.limiarMaior !== null && a.limiarGrave <= a.limiarMaior ? null : a.limiarGrave,
    notas: notasDoAdversario(a),
    iniciativa: null,
  });
}

// ---------- Estado extra para a página ----------

export function estadoDaMesa(m: Pick<Mesa, 'c' | 'userId' | 'souMestre'>) {
  const { c, userId, souMestre } = m;
  const relogios = (db.prepare('SELECT id, nome, total, marcados, secreto FROM campanha_relogios WHERE campanha_id = ? ORDER BY id').all(c.id) as Record<string, unknown>[])
    .filter((r) => souMestre || !r.secreto)
    .map((r) => ({ ...r, secreto: !!r.secreto }));
  return {
    areas: areas.get(c.id) ?? [],
    relogios,
    historico: historicoDe(c.guild_id, userId),
    pedidosMusica: souMestre ? (pedidos.get(c.id) ?? []) : (pedidos.get(c.id) ?? []).filter((p) => p.userId === userId),
    roteiro: souMestre ? (db.prepare('SELECT * FROM campanha_roteiro WHERE campanha_id = ? ORDER BY ordem, id').all(c.id) as Record<string, unknown>[]).map((r) => ({ ...r, feito: !!r.feito })) : [],
    temBestiario: souMestre && c.sistema === 'dh' && bestiario().length > 0,
  };
}

/** Peças apagadas, cenas trocadas: limpa o que fica em memória quando a campanha some. */
export function esquecerMesa(campanhaId: number) {
  areas.delete(campanhaId);
  pedidos.delete(campanhaId);
}

// ---------- Rotas ----------

/** GET: devolve a resposta, ou undefined se a rota não é daqui. */
export function lerMesa(m: Mesa, acao: string): Resposta | undefined {
  if (acao === 'bestiario') {
    if (!m.souMestre) return erro(403, 'O bestiário é do mestre.');
    return ok({ lista: bestiario(), custos: CUSTO_TIPO });
  }
  if (acao.startsWith('historico/')) {
    const u = acao.slice('historico/'.length);
    if (u !== m.userId && !m.souMestre) return erro(403, 'Você só vê o histórico do seu personagem.');
    return ok({ historico: historicoDe(m.c.guild_id, u) });
  }
  return undefined;
}

/** POST: devolve a resposta, ou undefined se a rota não é daqui. */
export async function tratarMesa(m: Mesa, acao: string, b: Record<string, unknown>): Promise<Resposta | undefined> {
  const { c, userId, souMestre } = m;

  // ----- Áreas de efeito: qualquer um desenha; o dono ou o mestre apaga -----
  if (acao === 'area') {
    let nova;
    try {
      const mp = m.mapa();
      nova = validarArea(b, mp.largura, mp.altura);
    } catch (e) {
      return erro(400, (e as Error).message);
    }
    const lista = areas.get(c.id) ?? [];
    const cor = typeof b.cor === 'string' && /^#[0-9a-f]{6}$/i.test(b.cor) ? b.cor : '#f0c35a';
    lista.push({ ...nova, id: proximaArea++, quem: userId, cor });
    // Cada um tem até 6; a mesa toda, até 24 (as mais antigas saem).
    const minhas = lista.filter((a) => a.quem === userId);
    if (minhas.length > 6) lista.splice(lista.indexOf(minhas[0]), 1);
    while (lista.length > MAX_AREAS) lista.shift();
    areas.set(c.id, lista);
    m.avisar();
    return ok();
  }
  if (acao === 'area/apagar' || acao === 'area/limpar') {
    const lista = areas.get(c.id) ?? [];
    const fica = acao === 'area/limpar'
      ? lista.filter((a) => !souMestre && a.quem !== userId)
      : lista.filter((a) => a.id !== Number(b.id) || (!souMestre && a.quem !== userId));
    areas.set(c.id, fica);
    m.avisar();
    return ok();
  }

  // ----- Descanso guiado (Daggerheart) -----
  if (acao === 'descanso') {
    if (c.sistema !== 'dh') return erro(400, 'O descanso guiado é do Daggerheart.');
    const alvo = String(b.user ?? userId);
    if (alvo !== userId && !souMestre) return erro(403, 'Você só descansa o seu personagem.');
    const ficha = m.ficha(alvo);
    if (!ficha) return erro(400, 'Crie a ficha antes de descansar.');
    const tipo = b.tipo === 'longo' ? 'longo' : 'curto';
    const escolhas = (Array.isArray(b.escolhas) ? b.escolhas : []).map(String) as MovimentoDescanso[];
    if (!escolhas.every((e) => MOVIMENTOS_DESCANSO.includes(e))) return erro(400, 'Movimento de descanso desconhecido.');
    let r;
    try {
      r = aplicarDescanso(
        { nivel: Number(ficha.nivel), pv: Number(ficha.pv), estresse: Number(ficha.estresse), armadura: Number(ficha.armadura), esperanca: Number(ficha.esperanca) },
        tipo, escolhas, !!b.juntos, MAX_ESPERANCA, () => rolar('1d4').total,
      );
    } catch (e) {
      return erro(400, (e as Error).message);
    }
    db.prepare('UPDATE fichas_dh SET pv = ?, estresse = ?, armadura = ?, esperanca = ? WHERE guild_id = ? AND user_id = ?').run(
      r.ficha.pv, r.ficha.estresse, r.ficha.armadura, r.ficha.esperanca, c.guild_id, alvo,
    );
    // As cartas usadas voltam a ficar prontas no descanso.
    db.prepare('UPDATE personagem_cartas SET usada = 0 WHERE guild_id = ? AND user_id = ?').run(c.guild_id, alvo);
    const titulo = tipo === 'longo' ? '🏕️ Descanso longo' : '☕ Descanso curto';
    await m.falar(`${titulo}: ${r.texto}`, { como: alvo, discord: true });
    registrarHistorico(c.guild_id, alvo, `${titulo}: ${r.texto}`);
    m.avisar();
    return ok({ texto: r.texto });
  }

  // ----- Pedidos de música dos jogadores -----
  if (acao === 'musica/pedir') {
    const busca = String(b.busca ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!busca) return erro(400, 'Escreva o nome da música ou cole o link.');
    const agora = Date.now();
    if (!souMestre && agora - (ultimoPedido.get(userId) ?? 0) < 20_000) return erro(429, 'Espere um pouco antes de pedir outra música.');
    ultimoPedido.set(userId, agora);
    const lista = pedidos.get(c.id) ?? [];
    if (lista.filter((p) => p.userId === userId).length >= 3) return erro(400, 'Você já tem 3 pedidos esperando o mestre.');
    lista.push({ id: proximoPedido++, userId, quem: await m.nomeDe(userId), busca, em: agora });
    while (lista.length > 15) lista.shift();
    pedidos.set(c.id, lista);
    m.avisar();
    return ok();
  }
  if (acao === 'musica/cancelar') {
    const lista = pedidos.get(c.id) ?? [];
    pedidos.set(c.id, lista.filter((p) => p.id !== Number(b.id) || (p.userId !== userId && !souMestre)));
    m.avisar();
    return ok();
  }

  // Daqui para baixo, só o mestre.
  if (!souMestre) return undefined;

  if (acao === 'musica/pedido') {
    const lista = pedidos.get(c.id) ?? [];
    const p = lista.find((x) => x.id === Number(b.id));
    if (!p) return erro(404, 'Esse pedido não está mais na lista.');
    pedidos.set(c.id, lista.filter((x) => x.id !== p.id));
    if (b.aceitar) {
      const r = await m.tocar({ acao: 'tocar', busca: p.busca });
      m.avisar();
      if (!r.ok) return erro(502, r.msg);
      await m.falar(`🎵 Pedido de ${p.quem}: ${p.busca}`);
      return ok({ msg: r.msg });
    }
    m.avisar();
    return ok();
  }

  // ----- Relógios de progresso -----
  if (acao === 'relogio/novo') {
    let v;
    try {
      v = validarRelogio(b);
    } catch (e) {
      return erro(400, (e as Error).message);
    }
    const total = (db.prepare('SELECT COUNT(*) AS n FROM campanha_relogios WHERE campanha_id = ?').get(c.id) as { n: number }).n;
    if (total >= 12) return erro(400, 'A mesa já tem 12 relógios. Apague algum antes.');
    db.prepare('INSERT INTO campanha_relogios (campanha_id, nome, total, secreto, criado_em) VALUES (?, ?, ?, ?, ?)').run(c.id, v.nome, v.total, v.secreto, Date.now());
    m.avisar();
    return ok();
  }
  if (acao === 'relogio/marcar') {
    const r = db.prepare('SELECT * FROM campanha_relogios WHERE id = ? AND campanha_id = ?').get(Number(b.id), c.id) as { id: number; nome: string; total: number; marcados: number; secreto: number } | undefined;
    if (!r) return erro(404, 'Relógio não encontrado.');
    const novo = Math.max(0, Math.min(r.total, r.marcados + Math.trunc(Number(b.delta) || 0)));
    db.prepare('UPDATE campanha_relogios SET marcados = ? WHERE id = ?').run(novo, r.id);
    if (novo === r.total && r.marcados < r.total && !r.secreto) await m.falar(`⏳ O relógio "${r.nome}" se completou!`);
    m.avisar();
    return ok({ marcados: novo });
  }
  if (acao === 'relogio/secreto') {
    db.prepare('UPDATE campanha_relogios SET secreto = ? WHERE id = ? AND campanha_id = ?').run(b.secreto ? 1 : 0, Number(b.id), c.id);
    m.avisar();
    return ok();
  }
  if (acao === 'relogio/apagar') {
    db.prepare('DELETE FROM campanha_relogios WHERE id = ? AND campanha_id = ?').run(Number(b.id), c.id);
    m.avisar();
    return ok();
  }

  // ----- Medo que o mestre ganha quando o grupo descansa -----
  if (acao === 'descanso/medo') {
    if (c.sistema !== 'dh') return erro(400, 'Medo é do Daggerheart.');
    const tipo = b.tipo === 'longo' ? 'longo' : 'curto';
    const ganho = medoDoDescanso(tipo, m.jogadores().length, () => rolar('1d4').total);
    const atual = (db.prepare('SELECT medo FROM dh_medo WHERE guild_id = ?').get(c.guild_id) as { medo: number } | undefined)?.medo ?? 0;
    const novo = Math.min(MAX_MEDO, atual + ganho);
    db.prepare('INSERT INTO dh_medo (guild_id, medo) VALUES (?, ?) ON CONFLICT (guild_id) DO UPDATE SET medo = excluded.medo').run(c.guild_id, novo);
    m.avisar();
    return ok({ ganho, medo: novo });
  }

  // ----- Cortina: o mestre fecha para ajeitar a cena sem os jogadores verem -----
  if (acao === 'cortina') {
    const fechada = b.fechada ? 1 : 0;
    m.mapa(); // garante a linha do mapa
    db.prepare('UPDATE mapas SET cortina = ? WHERE campanha_id = ?').run(fechada, c.id);
    m.avisar();
    return ok({ fechada: !!fechada });
  }

  // ----- Visão dos personagens na névoa -----
  if (acao === 'visao') {
    const raio = Math.round(Math.max(0, Math.min(30, Number(b.raio) || 0)));
    db.prepare('UPDATE mapas SET visao = ? WHERE campanha_id = ?').run(raio, c.id);
    m.avisar();
    return ok({ raio });
  }

  // ----- Notas secretas da cena -----
  if (acao === 'cena/notas') {
    const r = db.prepare('UPDATE mapa_cenas SET notas = ? WHERE id = ? AND campanha_id = ?').run(String(b.notas ?? '').slice(0, 4000), Number(b.id), c.id);
    if (!r.changes) return erro(404, 'Cena não encontrada.');
    m.avisar(true);
    return ok();
  }

  // ----- Roteiro da próxima sessão -----
  if (acao === 'roteiro/novo' || acao === 'roteiro/editar') {
    const titulo = String(b.titulo ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!titulo) return erro(400, 'Dê um título para o passo (ex.: Chegada à vila).');
    const cena = b.cena_id ? Number(b.cena_id) : null;
    if (cena && !db.prepare('SELECT 1 FROM mapa_cenas WHERE id = ? AND campanha_id = ?').get(cena, c.id)) return erro(404, 'Cena não encontrada.');
    const handout = b.handout_id ? Number(b.handout_id) : null;
    if (handout && !db.prepare('SELECT 1 FROM mapa_handouts WHERE id = ? AND campanha_id = ?').get(handout, c.id)) return erro(404, 'Handout não encontrado.');
    const ambiente = b.ambiente && ehAmbiente(b.ambiente) ? String(b.ambiente) : null;
    const musica = ambiente ? null : String(b.musica ?? '').trim().slice(0, 200) || null;
    const notas = String(b.notas ?? '').slice(0, 1000);
    if (acao === 'roteiro/editar') {
      const r = db.prepare('UPDATE campanha_roteiro SET titulo = ?, cena_id = ?, ambiente = ?, musica = ?, handout_id = ?, notas = ? WHERE id = ? AND campanha_id = ?')
        .run(titulo, cena, ambiente, musica, handout, notas, Number(b.id), c.id);
      if (!r.changes) return erro(404, 'Passo não encontrado.');
    } else {
      const n = (db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(ordem), 0) AS max FROM campanha_roteiro WHERE campanha_id = ?').get(c.id) as { n: number; max: number });
      if (n.n >= 40) return erro(400, 'O roteiro já tem 40 passos.');
      db.prepare('INSERT INTO campanha_roteiro (campanha_id, ordem, titulo, cena_id, ambiente, musica, handout_id, notas) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(c.id, n.max + 1, titulo, cena, ambiente, musica, handout, notas);
    }
    m.avisar(true);
    return ok();
  }
  if (acao === 'roteiro/apagar') {
    db.prepare('DELETE FROM campanha_roteiro WHERE id = ? AND campanha_id = ?').run(Number(b.id), c.id);
    m.avisar(true);
    return ok();
  }
  if (acao === 'roteiro/limpar-feitos') {
    db.prepare('UPDATE campanha_roteiro SET feito = 0 WHERE campanha_id = ?').run(c.id);
    m.avisar(true);
    return ok();
  }
  if (acao === 'roteiro/mover') {
    const lista = db.prepare('SELECT id FROM campanha_roteiro WHERE campanha_id = ? ORDER BY ordem, id').all(c.id) as { id: number }[];
    const i = lista.findIndex((r) => r.id === Number(b.id));
    const j = i + (Number(b.dir) < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= lista.length) return ok();
    [lista[i], lista[j]] = [lista[j], lista[i]];
    const st = db.prepare('UPDATE campanha_roteiro SET ordem = ? WHERE id = ?');
    lista.forEach((r, k) => st.run(k + 1, r.id));
    m.avisar(true);
    return ok();
  }
  if (acao === 'roteiro/feito') {
    db.prepare('UPDATE campanha_roteiro SET feito = ? WHERE id = ? AND campanha_id = ?').run(b.feito ? 1 : 0, Number(b.id), c.id);
    m.avisar(true);
    return ok();
  }
  // Executar um passo: abre a cena, toca a música e mostra o handout, tudo de uma vez.
  if (acao === 'roteiro/executar') {
    const p = db.prepare('SELECT * FROM campanha_roteiro WHERE id = ? AND campanha_id = ?').get(Number(b.id), c.id) as
      | { id: number; titulo: string; cena_id: number | null; ambiente: string | null; musica: string | null; handout_id: number | null }
      | undefined;
    if (!p) return erro(404, 'Passo não encontrado.');
    const feitos: string[] = [], avisos: string[] = [];
    if (p.cena_id) (await m.abrirCena(p.cena_id)) ? feitos.push('cena') : avisos.push('a cena foi apagada');
    if (p.ambiente || p.musica) {
      const r = await m.tocar(p.ambiente && ehAmbiente(p.ambiente) ? { acao: 'ambiente', tipo: p.ambiente } : { acao: 'tocar', busca: p.musica! });
      r.ok ? feitos.push('música') : avisos.push(r.msg);
    }
    if (p.handout_id) m.mostrarHandout(p.handout_id) ? feitos.push('handout') : avisos.push('o handout foi apagado');
    db.prepare('UPDATE campanha_roteiro SET feito = 1 WHERE id = ?').run(p.id);
    m.avisar();
    return ok({ feitos, avisos });
  }

  // ----- Bestiário e encontros -----
  if (acao === 'bestiario/importar') {
    const a = bestiario().find((x) => x.id === String(b.id));
    if (!a) return erro(404, 'Adversário não encontrado no bestiário.');
    const total = (db.prepare('SELECT COUNT(*) AS n FROM campanha_criaturas WHERE campanha_id = ?').get(c.id) as { n: number }).n;
    if (total >= 300) return erro(400, 'A biblioteca chegou a 300 personagens. Apague alguns antes.');
    const id = importarAdversario(m, a);
    if (!b.colocar) { m.avisar(); return ok({ id }); }
    const r = m.colocarCriatura(id, b.x as number | undefined, b.y as number | undefined);
    m.avisar();
    return typeof r === 'string' ? erro(400, r) : ok({ id, ...r });
  }
  if (acao === 'bestiario/encontro') {
    const lista = bestiario();
    if (!lista.length) return erro(404, 'O bestiário ainda não está no servidor.');
    const pjs = Math.max(1, Math.min(8, Math.round(Number(b.pjs) || m.jogadores().length || 4)));
    const nivel = Math.max(1, Math.min(4, Math.round(Number(b.nivel) || 1)));
    const ajustes = { maisFacil: !!b.maisFacil, maisDificil: !!b.maisDificil, danoExtra: !!b.danoExtra };
    const s = sugerirEncontro(lista, nivel, pjs, ajustes);
    return ok({ ids: s.escolhidos.map((a) => a.id), pontos: s.pontos, gastos: s.gastos, pjs, nivel });
  }
  if (acao === 'bestiario/pontos') {
    // Recalcula o orçamento para a lista que o mestre montou à mão.
    const lista = bestiario();
    const escolhidos = (Array.isArray(b.ids) ? b.ids : []).map((id) => lista.find((a) => a.id === String(id))).filter((a): a is Adversario => !!a);
    const pjs = Math.max(1, Math.min(8, Math.round(Number(b.pjs) || 4)));
    const ajustes = { maisFacil: !!b.maisFacil, maisDificil: !!b.maisDificil, danoExtra: !!b.danoExtra };
    return ok({ pontos: pontosDeBatalha(pjs, ajustes, escolhidos), gastos: custoDe(escolhidos) });
  }
  if (acao === 'bestiario/colocar-encontro') {
    const lista = bestiario();
    const escolhidos = (Array.isArray(b.ids) ? b.ids : []).slice(0, 30).map((id) => lista.find((a) => a.id === String(id))).filter((a): a is Adversario => !!a);
    if (!escolhidos.length) return erro(400, 'O encontro está vazio.');
    const mp = m.mapa(), cx = Number(b.x) || mp.largura / 2, cy = Number(b.y) || mp.altura / 2;
    const pjs = Math.max(1, m.jogadores().length);
    const nomes: string[] = [];
    let k = 0;
    for (const a of escolhidos) {
      const id = importarAdversario(m, a);
      // Lacaios vêm em grupo do tamanho do grupo de PJs.
      const copias = a.tipo === 'Lacaio' ? pjs : 1;
      for (let n = 0; n < copias; n++, k++) {
        const ang = k * 2.4, raio = mp.grade * (1.2 + 0.45 * Math.sqrt(k));
        const r = m.colocarCriatura(id, cx + Math.cos(ang) * raio, cy + Math.sin(ang) * raio);
        if (typeof r === 'string') { m.avisar(); return erro(400, r); }
        nomes.push(r.nome);
      }
    }
    m.avisar();
    return ok({ nomes });
  }

  return undefined;
}
