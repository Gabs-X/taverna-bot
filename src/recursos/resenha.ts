import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type Client,
  type Guild,
  type MessageReaction,
  type PartialMessageReaction,
} from 'discord.js';
import { CANAIS } from '../config.ts';
import { db } from '../db.ts';
import { horaDoResumo, semanaDe, topo, type Linha } from '../lib/semana.ts';
import { canalTexto, emoji } from '../lib/servidor.ts';
import type { Comando, MenuMensagem } from '../tipos.ts';

// ---------- Hall da fama: 3+ ⭐ numa mensagem e ela vai para #hall-da-fama ----------

const ESTRELAS_MINIMAS = 3;

export async function aoReagir(reacao: MessageReaction | PartialMessageReaction) {
  if (reacao.emoji.name !== '⭐') return;
  if (reacao.partial) await reacao.fetch().catch(() => null);
  const msg = reacao.message.partial ? await reacao.message.fetch().catch(() => null) : reacao.message;
  if (!msg?.inGuild() || msg.author.bot) return;
  const hall = canalTexto(msg.guild, CANAIS.hallFama);
  if (!hall || msg.channelId === hall.id) return;

  // Estrela na própria mensagem não conta.
  const quem = await reacao.users.fetch().catch(() => null);
  const estrelas = quem ? quem.filter((u) => u.id !== msg.author.id && !u.bot).size : (reacao.count ?? 0);
  const registro = db.prepare('SELECT hall_msg_id FROM hall_fama WHERE guild_id = ? AND msg_id = ?').get(msg.guildId, msg.id) as { hall_msg_id: string } | undefined;
  const rodape = `⭐ ${estrelas} · #${'name' in msg.channel ? msg.channel.name : 'canal'}`;

  if (registro) {
    const postada = await hall.messages.fetch(registro.hall_msg_id).catch(() => null);
    if (postada) await postada.edit({ embeds: [EmbedBuilder.from(postada.embeds[0]).setFooter({ text: rodape })] }).catch(() => {});
    return;
  }
  if (estrelas < ESTRELAS_MINIMAS) return;

  const imagem = msg.attachments.find((a) => a.contentType?.startsWith('image/'))?.url ?? msg.embeds.find((e) => e.image)?.image?.url;
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({ name: msg.member?.displayName ?? msg.author.username, iconURL: msg.author.displayAvatarURL() })
    // Sem a permissão "Message Content" no portal, o Discord não manda o texto para o bot.
    .setDescription(`${msg.content || (imagem ? '' : '_(o bot não conseguiu ler o texto: ligue "Message Content Intent" no Developer Portal)_')}\n\n[Ir para a mensagem](${msg.url})`.slice(0, 4000))
    .setFooter({ text: rodape })
    .setTimestamp(msg.createdTimestamp);
  if (imagem) embed.setImage(imagem);
  const postada = await hall.send({ embeds: [embed] });
  db.prepare('INSERT OR IGNORE INTO hall_fama (guild_id, msg_id, hall_msg_id) VALUES (?, ?, ?)').run(msg.guildId, msg.id, postada.id);
}

// ---------- Citações ----------

type Citacao = { id: number; autor_id: string; texto: string; salvo_por: string; canal_id: string; msg_id: string; em: number };

export const salvarCitacao: MenuMensagem = {
  data: new ContextMenuCommandBuilder().setName('Salvar citação').setType(ApplicationCommandType.Message).setContexts(InteractionContextType.Guild),
  async executar(i) {
    const m = i.targetMessage;
    const texto = m.content.trim();
    if (m.author.bot) return i.reply({ content: 'Citação de bot não vale. 🤖', flags: MessageFlags.Ephemeral });
    if (!texto) return i.reply({ content: 'Essa mensagem não tem texto para citar.', flags: MessageFlags.Ephemeral });
    const r = db.prepare('INSERT OR IGNORE INTO citacoes (guild_id, autor_id, texto, salvo_por, canal_id, msg_id, em) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(i.guildId, m.author.id, texto.slice(0, 1000), i.user.id, m.channelId, m.id, m.createdTimestamp);
    if (!r.changes) return i.reply({ content: 'Essa já está guardada nas citações. 📜', flags: MessageFlags.Ephemeral });
    return i.reply({ content: `📜 Guardado para a posteridade (citação #${r.lastInsertRowid}): "${texto.slice(0, 150)}" — ${m.author}`, allowedMentions: { parse: [] } });
  },
};

export const citacao: Comando = {
  data: new SlashCommandBuilder()
    .setName('citacao')
    .setDescription('Sorteia uma frase histórica da galera (salve com botão direito → Apps → Salvar citação)')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('Só citações dessa pessoa')),
  async executar(i) {
    const membro = i.options.getUser('membro');
    const c = (membro
      ? db.prepare('SELECT * FROM citacoes WHERE guild_id = ? AND autor_id = ? ORDER BY RANDOM() LIMIT 1').get(i.guildId, membro.id)
      : db.prepare('SELECT * FROM citacoes WHERE guild_id = ? ORDER BY RANDOM() LIMIT 1').get(i.guildId)) as Citacao | undefined;
    if (!c) {
      return i.reply({ content: `${membro ? `${membro.username} ainda não tem citações.` : 'Ninguém salvou citações ainda.'} Clique com o botão direito numa mensagem → **Apps** → **Salvar citação**.`, flags: MessageFlags.Ephemeral });
    }
    const total = (db.prepare('SELECT COUNT(*) AS n FROM citacoes WHERE guild_id = ?').get(i.guildId) as { n: number }).n;
    const autor = await i.client.users.fetch(c.autor_id).catch(() => null);
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setAuthor({ name: autor?.displayName ?? 'alguém', iconURL: autor?.displayAvatarURL() })
      .setDescription(`> ${c.texto.split('\n').join('\n> ')}\n\n— <@${c.autor_id}>, <t:${Math.floor(c.em / 1000)}:D> · [contexto](https://discord.com/channels/${i.guildId}/${c.canal_id}/${c.msg_id})`)
      .setFooter({ text: `Citação #${c.id} de ${total} · salva por quem não esqueceu` });
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

// ---------- Resumo da semana (domingo, 20h, no #geral) ----------

/** Soma num contador da semana atual (mensagens, call, apanhou, níveis, quiz, duelos). */
export function contarSemana(g: string, u: string, chave: string, n = 1) {
  db.prepare('INSERT INTO semana (guild_id, semana, user_id, chave, valor) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET valor = valor + excluded.valor')
    .run(g, semanaDe(Date.now()), u, chave, n);
}

export function contarMusicaSemana(g: string, titulo: string) {
  db.prepare('INSERT INTO semana_musicas (guild_id, semana, titulo, vezes) VALUES (?, ?, ?, 1) ON CONFLICT DO UPDATE SET vezes = vezes + 1')
    .run(g, semanaDe(Date.now()), titulo.slice(0, 200));
}

const CATEGORIAS = [
  { chave: 'mensagens', titulo: '💬 Mais tagarela', unidade: (n: number) => `${n} mensagens` },
  { chave: 'call', titulo: '🔊 Mais tempo em call', unidade: (n: number) => `${Math.floor(n / 60)} h ${n % 60} min` },
  { chave: 'niveis', titulo: '⭐ Mais subiu de nível', unidade: (n: number) => `+${n} nível(is)` },
  { chave: 'quiz', titulo: '🧠 Craque do quiz', unidade: (n: number) => `${n} acerto(s)` },
  { chave: 'duelos', titulo: '⚔️ Rei dos duelos', unidade: (n: number) => `${n} vitória(s)` },
  { chave: 'apanhou', titulo: '🩹 Maior vítima dos campeões', unidade: (n: number) => `apanhou ${n}x` },
];

export function montarResumo(guild: Guild, semana: string) {
  const medalhas = ['🥇', '🥈', '🥉'];
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle(`${emoji(guild, 'taverna_cerveja', '🍺')} Resumo da semana na ${guild.name}`)
    .setFooter({ text: `Semana ${semana} · sai todo domingo às 20h` });
  let algo = false;
  for (const c of CATEGORIAS) {
    const linhas = db.prepare('SELECT user_id, valor FROM semana WHERE guild_id = ? AND semana = ? AND chave = ?').all(guild.id, semana, c.chave) as Linha[];
    const melhores = topo(linhas);
    if (!melhores.length) continue;
    algo = true;
    embed.addFields({ name: c.titulo, value: melhores.map((l, k) => `${medalhas[k]} <@${l.user_id}> · ${c.unidade(l.valor)}`).join('\n'), inline: true });
  }
  const musicas = db.prepare('SELECT titulo, vezes FROM semana_musicas WHERE guild_id = ? AND semana = ? ORDER BY vezes DESC LIMIT 3').all(guild.id, semana) as { titulo: string; vezes: number }[];
  if (musicas.length) {
    algo = true;
    embed.addFields({ name: '🎵 Mais pedidas', value: musicas.map((m, k) => `${medalhas[k]} ${m.titulo.slice(0, 60)} · ${m.vezes}x`).join('\n') });
  }
  if (!algo) embed.setDescription('Semana parada... bora movimentar essa taverna! 🍻');
  return embed;
}

/** Confere a cada 10 min se é domingo depois das 20h e se o resumo da semana já saiu. */
export function iniciarResumo(client: Client) {
  const conferir = async () => {
    const agora = Date.now();
    if (!horaDoResumo(agora)) return;
    const semana = semanaDe(agora);
    for (const guild of client.guilds.cache.values()) {
      const r = db.prepare('INSERT OR IGNORE INTO resumos (guild_id, semana) VALUES (?, ?)').run(guild.id, semana);
      if (!r.changes) continue; // já saiu
      await canalTexto(guild, CANAIS.geral)?.send({ embeds: [montarResumo(guild, semana)], allowedMentions: { parse: [] } }).catch((e) => console.error('[resumo]', e));
    }
  };
  setInterval(() => void conferir().catch((e) => console.error('[resumo]', e)), 10 * 60_000).unref();
  void conferir().catch(() => {});
}

export const resumo: Comando = {
  data: new SlashCommandBuilder()
    .setName('resumo')
    .setDescription('(Staff) Prévia do resumo da semana que sai domingo às 20h')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild),
  async executar(i) {
    return i.reply({ embeds: [montarResumo(i.guild!, semanaDe(Date.now()))], flags: MessageFlags.Ephemeral });
  },
};
