import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type GuildMember,
} from 'discord.js';
import { criarSala } from '../lib/tela.ts';
import type { Comando } from '../tipos.ts';

// /tela: compartilhamento de tela por link (o vídeo do Discord não está disponível para a galera).
// Quem pediu recebe, só para si, o botão de começar a compartilhar; no chat sai o botão de assistir.

export const tela: Comando = {
  data: new SlashCommandBuilder()
    .setName('tela')
    .setDescription('Compartilha sua tela por um link (abre no navegador; a voz continua na call)')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('titulo').setDescription('O que vai mostrar (ex.: mapa do RPG)').setMaxLength(40))
    .addBooleanOption((o) => o.setName('audio').setDescription('Mandar também o som da tela (vídeo, jogo). Padrão: só a imagem')),

  async executar(i) {
    const titulo = i.options.getString('titulo')?.trim() ?? '';
    const audio = i.options.getBoolean('audio') ?? false;
    const sala = criarSala({ audio, titulo });
    const call = (i.member as GuildMember).voice.channel;

    // 1) Para quem vai compartilhar (só ele vê).
    await i.reply({
      content:
        '🖥️ **Sua sala está pronta.** Clique, escolha a tela ou a janela e pronto.' +
        (audio ? '\n🔊 Para mandar o som, marque **"Compartilhar áudio"** na janela de escolha do navegador.' : '') +
        '\nPara parar, é só fechar a aba.',
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Começar a compartilhar').setEmoji('🖥️').setURL(sala.compartilhar))],
      flags: MessageFlags.Ephemeral,
    });

    // 2) No chat, para quem vai assistir.
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: (i.member as GuildMember).displayName, iconURL: i.user.displayAvatarURL() })
      .setTitle(`🖥️ ${titulo || 'Compartilhando a tela'}`)
      .setDescription(
        `${i.user} está compartilhando a tela${call ? ` na call ${call}` : ''}.\n` +
          `Clique em **Assistir**: abre no navegador, sem instalar nada.${audio ? ' Com o som da tela.' : ''}` +
          (call ? '\nA conversa continua na call do Discord.' : ''),
      )
      .setFooter({ text: 'Sala com senha: só quem tem o link vê · /tela para abrir a sua' });
    return i.followUp({
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Assistir').setEmoji('👀').setURL(sala.assistir))],
      allowedMentions: { parse: [] },
    });
  },
};
