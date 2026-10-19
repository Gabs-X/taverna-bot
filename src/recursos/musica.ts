import { DefaultExtractors } from '@discord-player/extractor';
import { Player, QueueRepeatMode, type GuildQueue } from 'discord-player';
import { YoutubeExtractor } from 'discord-player-youtubei';
import {
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type GuildMember,
  type SendableChannels,
} from 'discord.js';
import type { Comando } from '../tipos.ts';

type Metadados = { canal: SendableChannels };

let player: Player;

// O discord-player usa os tipos CJS do discord.js e o bot os ESM: é o mesmo objeto em
// tempo de execução, mas o TypeScript enxerga duas classes. Converte só nesta fronteira.
type ClientDoPlayer = ConstructorParameters<typeof Player>[0];
type CanalDoPlayer = Parameters<Player['play']>[0];

export async function iniciarMusica(client: Client) {
  player = new Player(client as unknown as ClientDoPlayer);
  await player.extractors.register(YoutubeExtractor, {});
  await player.extractors.loadMulti(DefaultExtractors);

  player.events.on('playerStart', (fila: GuildQueue<Metadados>, faixa) => {
    const embed = new EmbedBuilder()
      .setColor(0x1db954)
      .setAuthor({ name: '🎵 Tocando agora' })
      .setTitle(faixa.title)
      .setURL(faixa.url)
      .setDescription(`${faixa.author} · \`${faixa.duration}\``)
      .setThumbnail(faixa.thumbnail || null)
      .setFooter({ text: `Pedido por ${faixa.requestedBy?.username ?? 'alguém'}` });
    fila.metadata.canal.send({ embeds: [embed] }).catch(() => {});
  });
  player.events.on('emptyQueue', (fila: GuildQueue<Metadados>) => {
    fila.metadata.canal.send('📭 A fila acabou. Manda mais com `/tocar`!').catch(() => {});
  });
  player.events.on('playerError', (fila: GuildQueue<Metadados>, erro, faixa) => {
    console.error('[música] erro ao tocar', faixa.title, erro);
    fila.metadata.canal.send(`⚠️ Não consegui tocar **${faixa.title}**. Pulando.`).catch(() => {});
  });
  player.events.on('error', (_fila, erro) => console.error('[música]', erro));
}

const filaDe = (i: ChatInputCommandInteraction) => player.nodes.get<Metadados>(i.guildId!);

// Comandos que mexem na fila exigem estar na mesma call do bot.
function validarFila(i: ChatInputCommandInteraction): GuildQueue<Metadados> | string {
  const fila = filaDe(i);
  if (!fila || !fila.currentTrack) return 'Não tem nada tocando. Use `/tocar`.';
  const canalMembro = (i.member as GuildMember).voice.channelId;
  if (fila.channel && canalMembro !== fila.channel.id) return `Entre em <#${fila.channel.id}> para controlar a música.`;
  return fila;
}

async function comFila(i: ChatInputCommandInteraction, acao: (fila: GuildQueue<Metadados>) => Promise<unknown> | unknown) {
  const fila = validarFila(i);
  if (typeof fila === 'string') return i.reply({ content: fila, flags: MessageFlags.Ephemeral });
  return acao(fila);
}

const MODOS_LOOP = {
  desligado: { modo: QueueRepeatMode.OFF, texto: '➡️ Loop desligado.' },
  musica: { modo: QueueRepeatMode.TRACK, texto: '🔂 Repetindo esta música.' },
  fila: { modo: QueueRepeatMode.QUEUE, texto: '🔁 Repetindo a fila toda.' },
  autoplay: { modo: QueueRepeatMode.AUTOPLAY, texto: '♾️ Autoplay: quando a fila acabar, toco músicas parecidas.' },
} as const;

export const musica: Comando = {
  data: new SlashCommandBuilder()
    .setName('musica')
    .setDescription('Controle da música')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('pular').setDescription('Pula para a próxima música'))
    .addSubcommand((s) => s.setName('pausar').setDescription('Pausa ou continua a música'))
    .addSubcommand((s) => s.setName('parar').setDescription('Para tudo, limpa a fila e sai da call'))
    .addSubcommand((s) => s.setName('fila').setDescription('Mostra a fila'))
    .addSubcommand((s) => s.setName('tocando').setDescription('Mostra a música atual e o progresso'))
    .addSubcommand((s) => s.setName('embaralhar').setDescription('Embaralha a fila'))
    .addSubcommand((s) =>
      s
        .setName('volume')
        .setDescription('Ajusta o volume')
        .addIntegerOption((o) => o.setName('valor').setDescription('0 a 100').setRequired(true).setMinValue(0).setMaxValue(100)),
    )
    .addSubcommand((s) =>
      s
        .setName('loop')
        .setDescription('Repetição')
        .addStringOption((o) =>
          o
            .setName('modo')
            .setDescription('Como repetir')
            .setRequired(true)
            .addChoices(
              { name: 'Desligado', value: 'desligado' },
              { name: 'Esta música', value: 'musica' },
              { name: 'Fila toda', value: 'fila' },
              { name: 'Autoplay (músicas parecidas)', value: 'autoplay' },
            ),
        ),
    ),

  async executar(i) {
    switch (i.options.getSubcommand()) {
      case 'pular':
        return comFila(i, (f) => {
          const atual = f.currentTrack!;
          f.node.skip();
          return i.reply(`⏭️ Pulei **${atual.title}**.`);
        });
      case 'pausar':
        return comFila(i, (f) => {
          const pausar = !f.node.isPaused();
          f.node.setPaused(pausar);
          return i.reply(pausar ? '⏸️ Pausado.' : '▶️ Continuando.');
        });
      case 'parar':
        return comFila(i, (f) => {
          f.delete();
          return i.reply('⏹️ Parei e saí da call.');
        });
      case 'fila':
        return comFila(i, (f) => {
          const proximas = f.tracks.toArray().slice(0, 10);
          const embed = new EmbedBuilder()
            .setColor(0x1db954)
            .setTitle('🎶 Fila')
            .setDescription(
              `**Agora:** ${f.currentTrack!.title} · \`${f.currentTrack!.duration}\`\n\n` +
                (proximas.length
                  ? proximas.map((t, n) => `\`${n + 1}.\` ${t.title} · \`${t.duration}\``).join('\n')
                  : '_Nada na fila depois desta._'),
            )
            .setFooter({ text: `${f.tracks.size} música(s) na fila` });
          return i.reply({ embeds: [embed] });
        });
      case 'tocando':
        return comFila(i, (f) => {
          const t = f.currentTrack!;
          const embed = new EmbedBuilder()
            .setColor(0x1db954)
            .setTitle(t.title)
            .setURL(t.url)
            .setDescription(`${t.author}\n\n${f.node.createProgressBar() ?? ''}`)
            .setThumbnail(t.thumbnail || null);
          return i.reply({ embeds: [embed] });
        });
      case 'embaralhar':
        return comFila(i, (f) => {
          f.tracks.shuffle();
          return i.reply('🔀 Fila embaralhada.');
        });
      case 'volume':
        return comFila(i, (f) => {
          const valor = i.options.getInteger('valor', true);
          f.node.setVolume(valor);
          return i.reply(`🔊 Volume em **${valor}%**.`);
        });
      case 'loop':
        return comFila(i, (f) => {
          const escolha = MODOS_LOOP[i.options.getString('modo', true) as keyof typeof MODOS_LOOP];
          f.setRepeatMode(escolha.modo);
          return i.reply(escolha.texto);
        });
    }
  },
};

export const tocar: Comando = {
  data: new SlashCommandBuilder()
    .setName('tocar')
    .setDescription('Toca uma música ou playlist (YouTube, Spotify, SoundCloud ou busca por nome)')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('busca').setDescription('Nome da música ou link').setRequired(true)),

  async executar(i) {
    const canalVoz = (i.member as GuildMember).voice.channel;
    if (!canalVoz) return i.reply({ content: 'Entre numa call primeiro.', flags: MessageFlags.Ephemeral });

    const filaAtual = filaDe(i);
    if (filaAtual?.channel && filaAtual.channel.id !== canalVoz.id) {
      return i.reply({ content: `Já estou tocando em <#${filaAtual.channel.id}>.`, flags: MessageFlags.Ephemeral });
    }

    await i.deferReply();
    try {
      const { track, searchResult } = await player.play(canalVoz as unknown as CanalDoPlayer, i.options.getString('busca', true), {
        requestedBy: i.user.id,
        nodeOptions: {
          metadata: { canal: i.channel as SendableChannels } satisfies Metadados,
          volume: 60,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 60_000,
          leaveOnEnd: true,
          leaveOnEndCooldown: 180_000,
        },
      });
      const texto = searchResult.playlist
        ? `📃 Adicionei **${searchResult.tracks.length}** músicas de **${searchResult.playlist.title}**.`
        : `➕ Na fila: **${track.title}** · \`${track.duration}\``;
      return i.editReply(texto);
    } catch (erro) {
      console.error('[música] /tocar', erro);
      return i.editReply('😵 Não achei nada com essa busca (ou o link não é suportado).');
    }
  },
};
