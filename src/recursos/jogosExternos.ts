import {
  ActivityType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type Client,
  type Guild,
  type Presence,
} from 'discord.js';
import { CANAIS } from '../config.ts';
import { db } from '../db.ts';
import { campeoes, versaoAtual } from '../lib/ddragon.ts';
import { ErroRiot, kda, perfilLol, REGIOES, textoElo, type Regiao } from '../lib/riot.ts';
import { canalTexto, emoji } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';

// ---------- /elo: perfil do LoL pela API oficial da Riot ----------

const escolhasRegiao = Object.entries(REGIOES).map(([value, r]) => ({ name: r.nome, value }));
const MODOS: Record<string, string> = { CLASSIC: 'Summoner’s Rift', ARAM: 'ARAM', URF: 'URF', CHERRY: 'Arena', ONEFORALL: 'Um por Todos' };

async function montarPerfil(riotId: string, regiao: Regiao) {
  const p = await perfilLol(riotId, regiao);
  const [versao, lista] = await Promise.all([versaoAtual(), campeoes()]);
  const nomeCampeao = (id: number) => lista.find((c) => Number(c.key) === id)?.name ?? `#${id}`;
  const solo = p.filas.find((f) => f.queueType === 'RANKED_SOLO_5x5');
  const flex = p.filas.find((f) => f.queueType === 'RANKED_FLEX_SR');
  return new EmbedBuilder()
    .setColor(0x0ac8b9)
    .setTitle(`🧙 ${p.nome}`)
    .setDescription(`Nível ${p.nivel} · ${REGIOES[regiao].nome}`)
    .setThumbnail(`https://ddragon.leagueoflegends.com/cdn/${versao}/img/profileicon/${p.icone}.png`)
    .addFields(
      { name: 'Solo/Duo', value: textoElo(solo), inline: true },
      { name: 'Flex', value: textoElo(flex), inline: true },
      { name: 'Maestrias', value: p.maestrias.map((m) => `**${nomeCampeao(m.championId)}** · M${m.championLevel} · ${m.championPoints.toLocaleString('pt-BR')} pts`).join('\n') || '—' },
      {
        name: 'Últimas partidas',
        value: p.partidas.map((x) => `${x.venceu ? '✅' : '❌'} **${x.campeao}** ${kda(x)} · ${MODOS[x.modo] ?? x.modo} · <t:${Math.floor(x.quando / 1000)}:R>`).join('\n') || '—',
      },
    )
    .setFooter({ text: 'Dados da Riot Games' });
}

const erroRiot = (e: unknown) => {
  if (e instanceof ErroRiot) {
    if (e.status === 0) return '⚙️ O `/elo` ainda não foi configurado: falta a `RIOT_API_KEY` no `.env` (chave grátis em developer.riotgames.com).';
    if (e.status === 400) return e.message;
    if (e.status === 401 || e.status === 403) return '🔑 A chave da Riot venceu ou é inválida (a de desenvolvimento dura 24 h). Avise o admin para gerar outra.';
    if (e.status === 404) return '🔎 Não achei essa conta. Confira o Riot ID (Nome#TAG) e a região.';
    if (e.status === 429) return '⏳ Muitas consultas seguidas na Riot. Tenta de novo em um minuto.';
  }
  return '😵 A Riot não respondeu agora. Tenta de novo daqui a pouco.';
};

export const elo: Comando = {
  data: new SlashCommandBuilder()
    .setName('elo')
    .setDescription('Elo, maestrias e últimas partidas no League of Legends')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s.setName('ver').setDescription('Perfil seu (vinculado) ou de alguém do servidor')
        .addUserOption((o) => o.setName('membro').setDescription('De quem (padrão: você)')),
    )
    .addSubcommand((s) =>
      s.setName('buscar').setDescription('Perfil de qualquer conta pelo Riot ID')
        .addStringOption((o) => o.setName('riot_id').setDescription('Nome#TAG').setRequired(true).setMaxLength(40))
        .addStringOption((o) => o.setName('regiao').setDescription('Região (padrão: Brasil)').addChoices(...escolhasRegiao)),
    )
    .addSubcommand((s) =>
      s.setName('vincular').setDescription('Liga a sua conta da Riot ao Discord (para o /elo ver)')
        .addStringOption((o) => o.setName('riot_id').setDescription('Nome#TAG').setRequired(true).setMaxLength(40))
        .addStringOption((o) => o.setName('regiao').setDescription('Região (padrão: Brasil)').addChoices(...escolhasRegiao)),
    ),

  async executar(i) {
    const sub = i.options.getSubcommand();
    let riotId: string;
    let regiao: Regiao;

    if (sub === 'ver') {
      const u = i.options.getUser('membro') ?? i.user;
      const conta = db.prepare('SELECT riot_id, regiao FROM riot_contas WHERE guild_id = ? AND user_id = ?').get(i.guildId, u.id) as { riot_id: string; regiao: Regiao } | undefined;
      if (!conta) {
        return i.reply({ content: u.id === i.user.id ? 'Vincule sua conta antes: `/elo vincular riot_id:Nome#TAG`.' : `${u.username} ainda não vinculou a conta da Riot.`, flags: MessageFlags.Ephemeral });
      }
      riotId = conta.riot_id;
      regiao = conta.regiao;
    } else {
      riotId = i.options.getString('riot_id', true);
      regiao = (i.options.getString('regiao') ?? 'br1') as Regiao;
    }

    await i.deferReply();
    try {
      const embed = await montarPerfil(riotId, regiao);
      if (sub === 'vincular') {
        db.prepare('INSERT INTO riot_contas (guild_id, user_id, riot_id, regiao) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET riot_id = excluded.riot_id, regiao = excluded.regiao')
          .run(i.guildId, i.user.id, embed.data.title!.replace('🧙 ', ''), regiao);
        return i.editReply({ content: '🔗 Conta vinculada! Agora é só `/elo ver`.', embeds: [embed] });
      }
      return i.editReply({ embeds: [embed] });
    } catch (e) {
      return i.editReply(erroRiot(e));
    }
  },
};

// ---------- Aviso de quem está jogando o mesmo jogo ----------

const IGNORADOS = /visual studio|code|spotify|youtube|chrome|discord|steam|epic games|battle\.net|riot client|wallpaper engine|obs|medal/i;
const ESPERA_AVISO = 3 * 3_600_000;
const ultimoAviso = new Map<string, number>(); // guild:jogo → quando avisou

const jogoDe = (p: Presence | null | undefined) => p?.activities.find((a) => a.type === ActivityType.Playing && !IGNORADOS.test(a.name))?.name;

/** Quando 2+ pessoas abrem o mesmo jogo (e não estão juntas numa call), sugere juntar a galera. */
export async function aoMudarPresenca(antes: Presence | null, depois: Presence) {
  const guild = depois.guild;
  const jogo = jogoDe(depois);
  if (!guild || !jogo || jogo === jogoDe(antes) || depois.user?.bot) return;

  const chave = `${guild.id}:${jogo}`;
  if (Date.now() - (ultimoAviso.get(chave) ?? 0) < ESPERA_AVISO) return;
  const jogando = guild.presences.cache.filter((p) => jogoDe(p) === jogo && !p.user?.bot).map((p) => p.userId);
  if (jogando.length < 2) return;
  // Já estão todos na mesma call: não precisa avisar.
  const calls = new Set(jogando.map((id) => guild.members.cache.get(id)?.voice.channelId ?? `sem-call-${id}`));
  if (calls.size === 1 && !calls.values().next().value?.startsWith('sem-call')) return;

  ultimoAviso.set(chave, Date.now());
  const nomes = jogando.slice(0, 6).map((id) => `<@${id}>`);
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0];
  await canalTexto(guild, CANAIS.comandos)?.send({
    content: `${emoji(guild, 'hype', '🎮')} **${jogo}**: ${lista} estão jogando agora. Bora juntar? Entre em **${CANAIS.criarCall}**!`,
    allowedMentions: { parse: [] }, // sem notificar: só mostra os nomes
  });
}

// ---------- Jogos grátis (Epic, Steam e GOG, via GamerPower) ----------

type Gratis = { id: number; title: string; worth: string; image: string; open_giveaway_url: string; end_date: string; platforms: string };

async function buscarGratis(): Promise<Gratis[]> {
  const r = await fetch('https://www.gamerpower.com/api/filter?platform=epic-games-store.steam.gog&type=game', { signal: AbortSignal.timeout(10_000) });
  const dados = (await r.json()) as Gratis[] | { status: number };
  return Array.isArray(dados) ? dados : [];
}

const limparTitulo = (t: string) => t.replace(/\s*\((Epic Games|Steam|GOG)\)\s*/i, ' ').replace(/\s*(Key\s+)?Giveaway\s*$/i, '').trim();
const loja = (p: string) => (/epic/i.test(p) ? 'Epic Games' : /steam/i.test(p) ? 'Steam' : /gog/i.test(p) ? 'GOG' : 'PC');

function cartaoGratis(g: Gratis) {
  const fim = Date.parse(g.end_date.replace(' ', 'T') + 'Z');
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`🆓 ${limparTitulo(g.title)}`)
    .setURL(g.open_giveaway_url)
    .setDescription(`De graça na **${loja(g.platforms)}**${g.worth && g.worth !== 'N/A' ? ` (normalmente ${g.worth})` : ''}.${Number.isFinite(fim) ? `\nAté <t:${Math.floor(fim / 1000)}:f>.` : ''}\n[Pegar o jogo](${g.open_giveaway_url})`)
    .setImage(g.image);
}

async function avisarGratis(guild: Guild) {
  const canal = canalTexto(guild, CANAIS.jogosGratis);
  if (!canal) return;
  const jogos = await buscarGratis();
  const novos = jogos.filter((g) => !db.prepare('SELECT 1 FROM jogos_gratis WHERE guild_id = ? AND id = ?').get(guild.id, String(g.id))).slice(0, 5);
  for (const g of novos) {
    await canal.send({ embeds: [cartaoGratis(g)] });
    db.prepare('INSERT OR IGNORE INTO jogos_gratis (guild_id, id, em) VALUES (?, ?, ?)').run(guild.id, String(g.id), Date.now());
  }
}

/** Confere a cada 3 h (e 1 min depois de ligar) se apareceu jogo grátis novo. */
export function iniciarJogosGratis(client: Client) {
  const rodar = () => {
    for (const guild of client.guilds.cache.values()) avisarGratis(guild).catch((e) => console.error('[jogos grátis]', e));
  };
  setTimeout(rodar, 60_000).unref();
  setInterval(rodar, 3 * 3_600_000).unref();
}

export const gratis: Comando = {
  data: new SlashCommandBuilder().setName('gratis').setDescription('Jogos de graça agora na Epic, Steam e GOG').setContexts(InteractionContextType.Guild),
  async executar(i) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const jogos = await buscarGratis().catch(() => []);
    if (!jogos.length) return i.editReply('Nenhum jogo grátis agora (ou o site não respondeu). O bot avisa sozinho em #jogos-gratis quando aparecer.');
    return i.editReply({ embeds: jogos.slice(0, 10).map(cartaoGratis) });
  },
};
