import { Resvg } from '@resvg/resvg-js';
import {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type TextBasedChannel,
} from 'discord.js';
import { CANAIS, CARGOS_NIVEL } from '../config.ts';
import { db } from '../db.ts';
import { desenharCartaoRank } from '../lib/cartaoRank.ts';
import {
  calcularDaily,
  ESPERA_MENSAGEM,
  formatarMoedas,
  GANHO_MINUTO_CALL,
  ganhoMensagem,
  somarXp,
  trabalhar as sortearTrabalho,
  xpDoNivel,
} from '../lib/economia.ts';
import { canalTexto, cargoPorNome, emoji } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';
import { registrar } from './registro.ts';

export type Carteira = {
  guild_id: string;
  user_id: string;
  moedas: number;
  nivel: number;
  xp: number;
  mensagens: number;
  minutos_call: number;
  ultima_msg: number;
  ultimo_daily: number;
  sequencia: number;
  ultimo_trabalho: number;
};

/** Valor em moedas com o emoji da moeda da Taverna (ou 🪙 se o servidor ainda não tem). */
export const moedas = (guild: Guild | null, n: number) => formatarMoedas(n, emoji(guild, 'moeda_taverna', '🪙'));

// ---------- Carteira (usada também pela loja, gótica, quiz...) ----------

export function carteira(g: string, u: string): Carteira {
  db.prepare('INSERT OR IGNORE INTO carteira (guild_id, user_id) VALUES (?, ?)').run(g, u);
  return db.prepare('SELECT * FROM carteira WHERE guild_id = ? AND user_id = ?').get(g, u) as Carteira;
}

export function darMoedas(g: string, u: string, n: number) {
  carteira(g, u);
  db.prepare('UPDATE carteira SET moedas = moedas + ? WHERE guild_id = ? AND user_id = ?').run(n, g, u);
}

/** Desconta só se tiver saldo. Devolve se deu certo. */
export function gastarMoedas(g: string, u: string, n: number): boolean {
  carteira(g, u);
  const r = db.prepare('UPDATE carteira SET moedas = moedas - ? WHERE guild_id = ? AND user_id = ? AND moedas >= ?').run(n, g, u, n);
  return Number(r.changes) > 0;
}

// ---------- XP de atividade e cargos por nível ----------

async function atualizarCargoNivel(membro: GuildMember, nivel: number) {
  const merecido = [...CARGOS_NIVEL].reverse().find((c) => nivel >= c.nivel);
  for (const c of CARGOS_NIVEL) {
    const cargo = cargoPorNome(membro.guild, c.nome);
    if (!cargo || !cargo.editable) continue;
    const deveTer = c === merecido;
    if (deveTer && !membro.roles.cache.has(cargo.id)) await membro.roles.add(cargo, `Nível ${nivel}`).catch(() => {});
    if (!deveTer && membro.roles.cache.has(cargo.id)) await membro.roles.remove(cargo, `Nível ${nivel}`).catch(() => {});
  }
  return merecido && merecido.nivel === nivel ? merecido.nome : undefined;
}

async function ganharAtividade(membro: GuildMember, xp: number, ganhoMoedas: number, aviso: TextBasedChannel | undefined, extra: string) {
  const c = carteira(membro.guild.id, membro.id);
  const r = somarXp(c.nivel, c.xp, xp);
  db.prepare(`UPDATE carteira SET nivel = ?, xp = ?, moedas = moedas + ?, ${extra} WHERE guild_id = ? AND user_id = ?`).run(
    r.nivel, r.xp, ganhoMoedas, membro.guild.id, membro.id,
  );
  if (!r.subiu.length) return;
  const cargoNovo = await atualizarCargoNivel(membro, r.nivel);
  registrar({ guild: membro.guild, userId: membro.id, tipo: 'auto', acao: `⭐ subiu para o nível ${r.nivel}${cargoNovo ? ` e ganhou o cargo ${cargoNovo}` : ''}` });
  const bonus = r.nivel * 20;
  darMoedas(membro.guild.id, membro.id, bonus);
  // Com o canal de level up criado pelo /setup, todo aviso vai para lá.
  const destino = canalTexto(membro.guild, CANAIS.levelUp) ?? aviso;
  if (destino && 'send' in destino) {
    await destino.send({
      content: `${emoji(membro.guild, 'level_up', '⭐')} ${membro} subiu para o **nível ${r.nivel}**! Ganhou ${moedas(membro.guild, bonus)}.${cargoNovo ? ` E agora é **${cargoNovo}**!` : ''}`,
      allowedMentions: { users: [membro.id] },
    }).catch(() => {});
  }
}

export async function aoMensagem(m: Message) {
  if (m.author.bot || !m.inGuild() || !m.member) return;
  const c = carteira(m.guildId, m.author.id);
  if (Date.now() - c.ultima_msg < ESPERA_MENSAGEM) {
    db.prepare('UPDATE carteira SET mensagens = mensagens + 1 WHERE guild_id = ? AND user_id = ?').run(m.guildId, m.author.id);
    return;
  }
  const g = ganhoMensagem();
  await ganharAtividade(m.member, g.xp, g.moedas, m.channel, `mensagens = mensagens + 1, ultima_msg = ${Date.now()}`);
}

/** A cada minuto, quem está conversando em call ganha XP e moedas. */
export function iniciarAtividade(client: Client) {
  setInterval(() => {
    for (const guild of client.guilds.cache.values()) creditarCalls(guild).catch((e) => console.error('[atividade]', e));
  }, 60_000);
}

async function creditarCalls(guild: Guild) {
  const aviso = canalTexto(guild, CANAIS.comandos);
  for (const canal of guild.channels.cache.values()) {
    if (canal.type !== ChannelType.GuildVoice && canal.type !== ChannelType.GuildStageVoice) continue;
    if (canal.id === guild.afkChannelId || canal.name.includes('AFK')) continue;
    const pessoas = canal.members.filter((m) => !m.user.bot);
    // Sozinho na call não conta: é para premiar resenha, não para farmar.
    if (pessoas.size < 2) continue;
    for (const membro of pessoas.values()) {
      if (membro.voice.selfDeaf || membro.voice.serverDeaf) continue;
      await ganharAtividade(membro, GANHO_MINUTO_CALL.xp, GANHO_MINUTO_CALL.moedas, aviso, 'minutos_call = minutos_call + 1');
    }
  }
}

// ---------- Comandos ----------

const tempo = (ms: number) => `<t:${Math.ceil(ms / 1000)}:R>`;
const posicao = (g: string, u: string) => {
  const c = carteira(g, u);
  const r = db.prepare('SELECT COUNT(*) AS n FROM carteira WHERE guild_id = ? AND (nivel > ? OR (nivel = ? AND xp > ?))').get(g, c.nivel, c.nivel, c.xp) as { n: number };
  return r.n + 1;
};

export const daily: Comando = {
  data: new SlashCommandBuilder().setName('daily').setDescription('Pega suas moedas do dia (dias seguidos rendem mais)').setContexts(InteractionContextType.Guild),
  async executar(i) {
    const c = carteira(i.guildId!, i.user.id);
    const r = calcularDaily(c.ultimo_daily, c.sequencia, Date.now());
    if (!r.ok) return i.reply({ content: `⏳ Você já pegou o daily. O próximo libera ${tempo(r.liberaEm)}.`, flags: MessageFlags.Ephemeral });
    db.prepare('UPDATE carteira SET moedas = moedas + ?, ultimo_daily = ?, sequencia = ? WHERE guild_id = ? AND user_id = ?').run(
      r.moedas, Date.now(), r.sequencia, i.guildId, i.user.id,
    );
    const fogo = r.sequencia > 1 ? ` 🔥 ${r.sequencia} dias seguidos!` : '';
    const perdeu = r.perdeuSequencia ? ' (a sequência zerou, ficou mais de 2 dias sem vir)' : '';
    return i.reply(`💰 ${i.user} pegou o daily: **${moedas(i.guild, r.moedas)}**.${fogo}${perdeu}`);
  },
};

export const trabalhar: Comando = {
  data: new SlashCommandBuilder().setName('trabalhar').setDescription('Faz um bico na taverna (uma vez por hora)').setContexts(InteractionContextType.Guild),
  async executar(i) {
    const c = carteira(i.guildId!, i.user.id);
    const r = sortearTrabalho(c.ultimo_trabalho, Date.now());
    if (!r.ok) return i.reply({ content: `😮‍💨 Você ainda está cansado. Volte ${tempo(r.liberaEm)}.`, flags: MessageFlags.Ephemeral });
    db.prepare('UPDATE carteira SET moedas = moedas + ?, ultimo_trabalho = ? WHERE guild_id = ? AND user_id = ?').run(r.moedas, Date.now(), i.guildId, i.user.id);
    return i.reply(`🛠️ ${i.user} ${r.texto} e ganhou **${moedas(i.guild, r.moedas)}**.`);
  },
};

export const carteiraCmd: Comando = {
  data: new SlashCommandBuilder()
    .setName('carteira')
    .setDescription('Moedas, nível e atividade (sua ou de alguém)')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('De quem (padrão: você)')),
  async executar(i) {
    const u = i.options.getUser('membro') ?? i.user;
    const c = carteira(i.guildId!, u.id);
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setAuthor({ name: u.displayName, iconURL: u.displayAvatarURL() })
      .addFields(
        { name: 'Moedas', value: moedas(i.guild, c.moedas), inline: true },
        { name: 'Nível', value: `${c.nivel} (${c.xp}/${xpDoNivel(c.nivel)} XP)`, inline: true },
        { name: 'Ranking', value: `#${posicao(i.guildId!, u.id)}`, inline: true },
        { name: 'Mensagens', value: `${c.mensagens}`, inline: true },
        { name: 'Tempo em call', value: `${Math.floor(c.minutos_call / 60)} h ${c.minutos_call % 60} min`, inline: true },
        { name: 'Daily', value: c.sequencia > 1 ? `🔥 ${c.sequencia} dias seguidos` : '—', inline: true },
      );
    return i.reply({ embeds: [embed] });
  },
};

export const pix: Comando = {
  data: new SlashCommandBuilder()
    .setName('pix')
    .setDescription('Manda moedas para alguém')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('Para quem').setRequired(true))
    .addIntegerOption((o) => o.setName('valor').setDescription('Quantas moedas').setRequired(true).setMinValue(1)),
  async executar(i) {
    const para = i.options.getUser('membro', true);
    const valor = i.options.getInteger('valor', true);
    if (para.bot || para.id === i.user.id) return i.reply({ content: 'Pix só para outra pessoa (bots não têm carteira).', flags: MessageFlags.Ephemeral });
    if (!gastarMoedas(i.guildId!, i.user.id, valor)) {
      return i.reply({ content: `Saldo insuficiente: você tem ${moedas(i.guild, carteira(i.guildId!, i.user.id).moedas)}.`, flags: MessageFlags.Ephemeral });
    }
    darMoedas(i.guildId!, para.id, valor);
    return i.reply({ content: `💸 ${i.user} mandou **${moedas(i.guild, valor)}** para ${para}.`, allowedMentions: { users: [para.id] } });
  },
};

async function avatarBase64(url: string) {
  try {
    const r = await fetch(url);
    if (!r.ok) return undefined;
    return `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
  } catch {
    return undefined;
  }
}

export const rank: Comando = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Cartão de nível (seu ou de alguém)')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('De quem (padrão: você)')),
  async executar(i) {
    await i.deferReply();
    const u = i.options.getUser('membro') ?? i.user;
    const membro = await i.guild!.members.fetch(u.id).catch(() => null);
    const c = carteira(i.guildId!, u.id);
    const svg = desenharCartaoRank({
      nome: membro?.displayName ?? u.displayName,
      avatar: await avatarBase64(u.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true })),
      nivel: c.nivel,
      xp: c.xp,
      xpProximo: xpDoNivel(c.nivel),
      posicao: posicao(i.guildId!, u.id),
      moedas: c.moedas,
      cor: membro?.displayHexColor && membro.displayHexColor !== '#000000' ? membro.displayHexColor : '#19c2ae',
    });
    const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' } }).render().asPng();
    return i.editReply({ files: [new AttachmentBuilder(png, { name: 'rank.png' })] });
  },
};

export const top: Comando = {
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('Ranking do servidor')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o.setName('por').setDescription('Ordenar por (padrão: nível)').addChoices(
        { name: 'Nível', value: 'nivel' },
        { name: 'Moedas', value: 'moedas' },
        { name: 'Tempo em call', value: 'call' },
      ),
    ),
  async executar(i) {
    const por = i.options.getString('por') ?? 'nivel';
    const ordem = { nivel: 'nivel DESC, xp DESC', moedas: 'moedas DESC', call: 'minutos_call DESC' }[por];
    const linhas = db.prepare(`SELECT * FROM carteira WHERE guild_id = ? ORDER BY ${ordem} LIMIT 10`).all(i.guildId!) as Carteira[];
    if (!linhas.length) return i.reply({ content: 'Ninguém pontuou ainda. Bora conversar!', flags: MessageFlags.Ephemeral });
    const medalhas = ['🥇', '🥈', '🥉'];
    const valor = (c: Carteira) =>
      por === 'moedas' ? moedas(i.guild, c.moedas) : por === 'call' ? `${Math.floor(c.minutos_call / 60)} h ${c.minutos_call % 60} min` : `nível ${c.nivel}`;
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle({ nivel: `${emoji(i.guild, 'level_up', '⭐')} Top níveis`, moedas: `${emoji(i.guild, 'moeda_taverna', '💰')} Top moedas`, call: `${emoji(i.guild, 'call', '🔊')} Top tempo em call` }[por]!)
      .setDescription(linhas.map((c, k) => `${medalhas[k] ?? `**${k + 1}.**`} <@${c.user_id}> · ${valor(c)}`).join('\n'));
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
