import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { CANAIS } from '../config.ts';
import { db } from '../db.ts';
import { canalTexto, ehStaff } from '../lib/servidor.ts';
import type { Comando, HandlerBotao } from '../tipos.ts';

// Sugestões de melhorias para o bot: vão para #sugestoes, a galera vota com 👍/👎 e a Staff decide pelos botões.


const POR_DIA = 3;
const STATUS = {
  analise: { rotulo: '🕐 Em análise', cor: 0xf5b544 },
  aprovada: { rotulo: '✅ Aprovada: vai entrar na fila', cor: 0x2ecc71 },
  recusada: { rotulo: '❌ Recusada', cor: 0xc0392b },
  feita: { rotulo: '🚀 Implementada!', cor: 0x5865f2 },
} as const;
type Status = keyof typeof STATUS;
type Sugestao = { id: number; guild_id: string; user_id: string; texto: string; status: Status; criada_em: number };

function cartao(s: Sugestao, autor?: { nome: string; avatar: string }, decidiu?: string) {
  const embed = new EmbedBuilder()
    .setColor(STATUS[s.status].cor)
    .setTitle(`💡 Sugestão #${s.id}`)
    .setDescription(s.texto)
    .addFields({ name: 'Status', value: `${STATUS[s.status].rotulo}${decidiu ? ` · por ${decidiu}` : ''}` })
    .setFooter({ text: 'Vote com 👍 ou 👎 · sugira a sua com /sugestao' })
    .setTimestamp(s.criada_em);
  if (autor) embed.setAuthor({ name: autor.nome, iconURL: autor.avatar });
  return embed;
}

const botoes = (id: number) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sugestao:aprovada:${id}`).setLabel('Aprovar').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sugestao:recusada:${id}`).setLabel('Recusar').setEmoji('❌').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`sugestao:feita:${id}`).setLabel('Implementada').setEmoji('🚀').setStyle(ButtonStyle.Primary),
  );

export const sugestao: Comando = {
  data: new SlashCommandBuilder()
    .setName('sugestao')
    .setDescription('Sugere uma ideia nova para o bot (a galera vota e a staff avalia)')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('ideia').setDescription('Explique a ideia: o que o bot faria e por quê').setRequired(true).setMinLength(10).setMaxLength(1000)),

  async executar(i) {
    const canal = canalTexto(i.guild!, CANAIS.sugestoes);
    if (!canal) return i.reply({ content: 'O canal de sugestões ainda não existe. Peça a um admin para rodar `/setup`.', flags: MessageFlags.Ephemeral });

    const hoje = (db.prepare('SELECT COUNT(*) AS n FROM sugestoes WHERE guild_id = ? AND user_id = ? AND criada_em > ?').get(i.guildId, i.user.id, Date.now() - 86_400_000) as { n: number }).n;
    if (hoje >= POR_DIA) return i.reply({ content: `Você já mandou ${POR_DIA} sugestões nas últimas 24 h. Segura as ideias até amanhã! 💡`, flags: MessageFlags.Ephemeral });

    const texto = i.options.getString('ideia', true).trim();
    const r = db.prepare('INSERT INTO sugestoes (guild_id, user_id, texto, criada_em) VALUES (?, ?, ?, ?)').run(i.guildId, i.user.id, texto, Date.now());
    const s = db.prepare('SELECT * FROM sugestoes WHERE id = ?').get(Number(r.lastInsertRowid)) as Sugestao;
    const msg = await canal.send({
      embeds: [cartao(s, { nome: i.user.displayName, avatar: i.user.displayAvatarURL() })],
      components: [botoes(s.id)],
    });
    db.prepare('UPDATE sugestoes SET canal_id = ?, msg_id = ? WHERE id = ?').run(canal.id, msg.id, s.id);
    await msg.react('👍').catch(() => {});
    await msg.react('👎').catch(() => {});
    return i.reply({ content: `💡 Valeu! Sua sugestão #${s.id} está em ${canal}. Você recebe no privado quando a staff decidir.`, flags: MessageFlags.Ephemeral });
  },
};

export const botaoSugestao: HandlerBotao = {
  prefixo: 'sugestao',
  async executar(i, argumento) {
    const [status, id] = argumento.split(':') as [Status, string];
    if (!ehStaff(i.guild!, i.user.id)) return i.reply({ content: 'Só a staff decide as sugestões. Vote com 👍 ou 👎!', flags: MessageFlags.Ephemeral });
    const s = db.prepare('SELECT * FROM sugestoes WHERE id = ?').get(Number(id)) as Sugestao | undefined;
    if (!s || !(status in STATUS)) return i.reply({ content: 'Sugestão não encontrada.', flags: MessageFlags.Ephemeral });

    db.prepare('UPDATE sugestoes SET status = ? WHERE id = ?').run(status, s.id);
    const atual = { ...s, status };
    const autorAntigo = i.message.embeds[0]?.author;
    const embed = cartao(atual, autorAntigo ? { nome: autorAntigo.name, avatar: autorAntigo.iconURL ?? '' } : undefined, i.user.displayName);
    // Implementada encerra a sugestão; aprovada ainda pode virar implementada.
    await i.update({ embeds: [embed], components: status === 'feita' || status === 'recusada' ? [] : [botoes(s.id)] });

    const autor = await i.client.users.fetch(s.user_id).catch(() => null);
    const frase = { aprovada: 'foi **aprovada** e entrou na fila! 🎉', recusada: 'foi **recusada** dessa vez. Valeu por sugerir!', feita: 'foi **implementada**! Já dá para usar. 🚀', analise: 'voltou para análise.' }[status];
    await autor?.send(`💡 Sua sugestão #${s.id} no **${i.guild!.name}** ${frase}\n> ${s.texto.slice(0, 300)}`).catch(() => {});
  },
};
