import {
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type GuildMember,
} from 'discord.js';
import { CANAIS } from '../config.ts';
import { canalTexto } from '../lib/servidor.ts';
import type { Comando, HandlerBotao } from '../tipos.ts';

// O Spotify não tem API para criar Jam: quem cria é o app. O bot divulga o link de convite.
// Formatos aceitos: spotify.link/xxxx e open.spotify.com/socialsession/xxxx
const LINK_JAM = /^https:\/\/(spotify\.link\/[\w-]+|open\.spotify\.com\/socialsession\/[\w-]+)(\?\S*)?$/i;

const VERDE_SPOTIFY = 0x1db954;

const COMO_CRIAR =
  '**Como criar uma Jam no Spotify** (precisa de Premium para iniciar):\n' +
  '1. Toque uma música no app do Spotify.\n' +
  '2. Toque no ícone de **dispositivos** 🔊 (ou nos 3 pontinhos) → **Iniciar uma Jam**.\n' +
  '3. Toque em **Convidar** → **Copiar link**.\n' +
  '4. Aqui no Discord: `/jam link:` e cole o link.';

// Se a pessoa está com o Spotify ligado ao Discord, mostra o que está tocando.
function tocandoAgora(membro: GuildMember) {
  const atividade = membro.presence?.activities.find((a) => a.type === ActivityType.Listening && a.name === 'Spotify');
  if (!atividade?.details) return undefined;
  return {
    musica: atividade.details,
    artista: atividade.state ?? '',
    capa: atividade.assets?.largeImageURL() ?? undefined,
  };
}

const botoes = (link: string, donoId: string, encerrada = false) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    encerrada
      ? new ButtonBuilder().setCustomId('jam:encerrada').setLabel('Jam encerrada').setStyle(ButtonStyle.Secondary).setDisabled(true)
      : new ButtonBuilder().setURL(link).setLabel('Entrar na Jam').setEmoji('🎧').setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setCustomId(`jam:encerrar:${donoId}`)
      .setLabel('Encerrar')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(encerrada),
  );

export const jam: Comando = {
  data: new SlashCommandBuilder()
    .setName('jam')
    .setDescription('Divulga a sua Jam do Spotify para a galera entrar (sem link: mostra como criar)')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('link').setDescription('Link de convite da Jam (spotify.link/...)').setMaxLength(200))
    .addStringOption((o) => o.setName('recado').setDescription('Ex.: só pagode hoje, aceito pedidos').setMaxLength(150))
    .addBooleanOption((o) => o.setName('avisar').setDescription('Marcar @here para avisar quem está online')),

  async executar(i) {
    const link = i.options.getString('link')?.trim();
    if (!link) return i.reply({ content: COMO_CRIAR, flags: MessageFlags.Ephemeral });
    if (!LINK_JAM.test(link)) {
      return i.reply({
        content: `Esse não parece um link de Jam. Ele começa com \`https://spotify.link/\` ou \`https://open.spotify.com/socialsession/\`.\n\n${COMO_CRIAR}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const membro = i.member as GuildMember;
    const recado = i.options.getString('recado');
    const agora = tocandoAgora(membro);

    const embed = new EmbedBuilder()
      .setColor(VERDE_SPOTIFY)
      .setAuthor({ name: `${membro.displayName} abriu uma Jam no Spotify`, iconURL: membro.displayAvatarURL() })
      .setTitle('🎧 Jam rolando! Entra aí')
      .setDescription(
        [
          recado ? `> ${recado}` : null,
          agora ? `**Tocando agora:** ${agora.musica}${agora.artista ? ` · ${agora.artista}` : ''}` : null,
          'Clique em **Entrar na Jam** para ouvir junto e adicionar músicas à fila.',
        ]
          .filter(Boolean)
          .join('\n\n'),
      )
      .setFooter({ text: 'Quem entra precisa do app do Spotify. Para adicionar músicas, conta Premium.' })
      .setTimestamp();
    if (agora?.capa) embed.setThumbnail(agora.capa);

    const mensagem = {
      content: i.options.getBoolean('avisar') ? '@here' : undefined,
      embeds: [embed],
      components: [botoes(link, i.user.id)],
      allowedMentions: { parse: i.options.getBoolean('avisar') ? (['everyone'] as const) : [] },
    };

    // Posta no canal de música; se o comando já foi usado lá (ou o canal não existe), responde no próprio canal.
    const canalMusica = canalTexto(i.guild!, CANAIS.musica);
    if (!canalMusica || canalMusica.id === i.channelId) return i.reply(mensagem);

    await canalMusica.send(mensagem);
    return i.reply({ content: `🎧 Jam divulgada em ${canalMusica}!`, flags: MessageFlags.Ephemeral });
  },
};

export const botaoJam: HandlerBotao = {
  prefixo: 'jam',
  async executar(i, argumento) {
    const [acao, donoId] = argumento.split(':');
    if (acao !== 'encerrar') return i.deferUpdate();
    if (i.user.id !== donoId) return i.reply({ content: 'Só quem abriu a Jam pode encerrar.', flags: MessageFlags.Ephemeral });

    const original = i.message.embeds[0];
    // O link da Jam está no botão "Entrar na Jam" da própria mensagem.
    let link: string | undefined;
    for (const linha of i.message.components) {
      if (!('components' in linha)) continue;
      for (const c of linha.components as { url?: string | null }[]) if (c.url) link = c.url;
    }

    const embed = EmbedBuilder.from(original).setColor(0x4f545c).setTitle('🔇 Jam encerrada').setThumbnail(null);
    return i.update({ content: null, embeds: [embed], components: [botoes(link ?? 'https://open.spotify.com', donoId, true)] });
  },
};
