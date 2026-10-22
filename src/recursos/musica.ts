import { DefaultExtractors } from '@discord-player/extractor';
import { Player, QueueRepeatMode, type GuildQueue, type Track } from 'discord-player';
import { getVideoId, YoutubeExtractor } from 'discord-player-youtubei';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type GuildMember,
  type SendableChannels,
} from 'discord.js';
import { chaveMusica, escolherProxima, lembrar } from '../lib/radio.ts';
import type { Comando, HandlerBotao } from '../tipos.ts';

// radio: ligado pelo /radio. sugestoes: associadas à música inicial ainda não tocadas (o rádio fica no
// estilo dela e só busca novas quando a lista acaba); historico: últimas tocadas, para não repetir.
type Sugestao = { title: string; author: string; durationMS: number; videoId: string };
type Radio = { historico: string[]; sugestoes: Sugestao[]; painelId?: string; buscando?: boolean };
type Metadados = { canal: SendableChannels; radio?: Radio };

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
    const radio = fila.metadata.radio;
    if (radio) {
      radio.historico = lembrar(radio.historico, faixa.title, faixa.author);
      // Última da fila: busca a associada agora, para não ter silêncio entre as músicas.
      const pronto = fila.tracks.size === 0 ? encherRadio(fila) : Promise.resolve();
      pronto.finally(() => postarPainelRadio(fila)).catch((e) => console.error('[rádio]', e));
      return;
    }
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
    if (fila.metadata.radio) {
      // A busca antecipada falhou: tenta de novo e volta a tocar.
      encherRadio(fila)
        .then(async () => {
          if (fila.tracks.size) await fila.node.play();
          else await fila.metadata.canal.send('📻 O rádio não achou mais músicas associadas. Recomece com `/radio`.');
        })
        .catch((e) => console.error('[rádio]', e));
      return;
    }
    fila.metadata.canal.send('📭 A fila acabou. Manda mais com `/tocar`!').catch(() => {});
  });
  player.events.on('playerError', (fila: GuildQueue<Metadados>, erro, faixa) => {
    console.error('[música] erro ao tocar', faixa.title, erro);
    fila.metadata.canal.send(`⚠️ Não consegui tocar **${faixa.title}**. Pulando.`).catch(() => {});
  });
  player.events.on('error', (_fila, erro) => console.error('[música]', erro));
}

// ---------- Rádio ----------

// Item do "a seguir" do YouTube Music (só os campos usados).
type ItemASeguir = {
  type: string;
  video_id?: string;
  title?: unknown;
  author?: string;
  artists?: { name: string }[];
  duration?: { seconds?: number };
};

async function sugestoesDoYoutubeMusic(base: Track, youtube: { searchEngine: `ext:${string}` }): Promise<Sugestao[]> {
  const ext = player.extractors.get(YoutubeExtractor.identifier) as YoutubeExtractor | undefined;
  let id: string | null = getVideoId(base.url);
  if (!id) {
    // Música de outra fonte (ex.: Spotify): acha a versão do YouTube para pegar as sugestões.
    const achada = await player.search(`${base.title} ${base.author}`, youtube);
    id = achada.tracks[0] ? getVideoId(achada.tracks[0].url) : null;
  }
  if (!ext?.innertube || !id) return [];
  const aSeguir = await ext.innertube.music.getUpNext(id, true);
  return (aSeguir.contents ?? []).flatMap((item) => {
    const v = item as unknown as ItemASeguir;
    if (v.type !== 'PlaylistPanelVideo' || !v.video_id) return [];
    const autor = v.author || v.artists?.map((a) => a.name).join(', ') || '';
    return [{ title: String(v.title), author: autor, durationMS: (v.duration?.seconds ?? 0) * 1000, videoId: v.video_id }];
  });
}

/** Põe na fila a próxima associada (da lista da música inicial), sem repetir as recentes. */
async function encherRadio(fila: GuildQueue<Metadados>) {
  const radio = fila.metadata.radio;
  if (!radio || radio.buscando) return;
  const base = fila.currentTrack ?? fila.history.previousTrack;
  if (!base) return;
  radio.buscando = true;
  try {
    const youtube = { searchEngine: `ext:${YoutubeExtractor.identifier}` } as const;
    let proxima: Track | undefined;
    try {
      // Lista acabando: pede ao "a seguir" do YouTube Music (o mesmo rádio do app) a partir da música atual.
      if (radio.sugestoes.filter((s) => !radio.historico.includes(chaveMusica(s.title, s.author))).length < 5) {
        radio.sugestoes.push(...(await sugestoesDoYoutubeMusic(base, youtube)));
      }
      const escolhida = escolherProxima(radio.sugestoes, radio.historico);
      if (escolhida) {
        radio.sugestoes = radio.sugestoes.filter((s) => s !== escolhida);
        radio.historico = lembrar(radio.historico, escolhida.title, escolhida.author);
        proxima = (await player.search(`https://www.youtube.com/watch?v=${escolhida.videoId}`, youtube)).tracks[0];
      }
    } catch (erro) {
      console.error('[rádio] sem sugestões do YouTube Music', erro);
    }
    if (!proxima) {
      // Sem associadas boas: mais músicas do mesmo artista.
      const busca = await player.search(`${base.author} música`, youtube).catch(() => null);
      proxima = escolherProxima(busca?.tracks ?? [], radio.historico);
    }
    if (proxima) {
      proxima.requestedBy = null; // marca como escolhida pelo rádio (o botão de desligar tira essas)
      fila.addTrack(proxima);
    }
  } finally {
    radio.buscando = false;
  }
}

function botoesRadio(pausado: boolean) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('radio:pular').setLabel('Pular').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('radio:pausar').setLabel(pausado ? 'Continuar' : 'Pausar').setEmoji(pausado ? '▶️' : '⏸️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('radio:desligar').setLabel('Desligar rádio').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
  );
}

function painelRadio(fila: GuildQueue<Metadados>) {
  const atual = fila.currentTrack;
  const proxima = fila.tracks.at(0);
  const aSeguir = proxima ? `${proxima.title} · ${proxima.author}` : '_procurando uma associada..._';
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setAuthor({ name: '📻 Rádio da Taverna · tocando sem parar' })
    .setTitle(atual?.title ?? '...')
    .setURL(atual?.url ?? null)
    .setDescription(`${atual?.author ?? ''} · \`${atual?.duration ?? ''}\`\n\n**A seguir:** ${aSeguir}`)
    .setThumbnail(atual?.thumbnail || null)
    .setFooter({ text: `${atual?.requestedBy ? `Pedido por ${atual.requestedBy.username}` : 'Escolhida pelo rádio'} · peça músicas no meio com /tocar` });
  return { embeds: [embed], components: [botoesRadio(fila.node.isPaused())] };
}

/** Apaga o painel anterior e manda um novo embaixo, para ficar sempre visível. */
async function postarPainelRadio(fila: GuildQueue<Metadados>) {
  const { canal, radio } = fila.metadata;
  if (!radio) return;
  if (radio.painelId && 'messages' in canal) await canal.messages.delete(radio.painelId).catch(() => {});
  const msg = await canal.send(painelRadio(fila)).catch(() => null);
  radio.painelId = msg?.id;
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
      // Com o rádio ligado, o pedido passa na frente das músicas escolhidas pelo rádio.
      const fila = filaDe(i);
      if (fila?.metadata.radio && !searchResult.playlist) fila.moveTrack(track, 0);
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

export const radio: Comando = {
  data: new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Toca uma música e segue sozinho com músicas associadas, sem parar')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('musica').setDescription('Música que começa o rádio (nome ou link)').setRequired(true)),

  async executar(i) {
    const canalVoz = (i.member as GuildMember).voice.channel;
    if (!canalVoz) return i.reply({ content: 'Entre numa call primeiro.', flags: MessageFlags.Ephemeral });
    const filaAtual = filaDe(i);
    if (filaAtual?.channel && filaAtual.channel.id !== canalVoz.id) {
      return i.reply({ content: `Já estou tocando em <#${filaAtual.channel.id}>.`, flags: MessageFlags.Ephemeral });
    }

    await i.deferReply();
    const busca = await player.search(i.options.getString('musica', true), { requestedBy: i.user.id }).catch(() => null);
    const semente = busca?.tracks[0];
    if (!semente) return i.editReply('😵 Não achei essa música para começar o rádio.');

    try {
      if (filaAtual) {
        // Já tem música: liga o rádio na fila atual (a semente entra na frente).
        filaAtual.metadata.radio ??= { historico: [], sugestoes: [] };
        filaAtual.setRepeatMode(QueueRepeatMode.OFF);
        filaAtual.insertTrack(semente, 0);
      } else {
        await player.play(canalVoz as unknown as CanalDoPlayer, semente, {
          requestedBy: i.user.id,
          nodeOptions: {
            metadata: { canal: i.channel as SendableChannels, radio: { historico: [], sugestoes: [] } } satisfies Metadados,
            volume: 60,
            leaveOnEmpty: true,
            leaveOnEmptyCooldown: 60_000,
            leaveOnEnd: true,
            leaveOnEndCooldown: 180_000,
          },
        });
      }
    } catch (erro) {
      console.error('[rádio] /radio', erro);
      return i.editReply('😵 Não consegui começar o rádio com essa música.');
    }
    return i.editReply(`📻 **Rádio ligado** com **${semente.title}** (${semente.author}). Depois dela, sigo com músicas associadas sem repetir. Desliga no botão do painel ou com \`/musica parar\`.`);
  },
};

export const botaoRadio: HandlerBotao = {
  prefixo: 'radio',
  async executar(i, acao) {
    const fila = player.nodes.get<Metadados>(i.guildId!);
    if (!fila) return i.update({ content: '⏹️ Não tem nada tocando.', embeds: [], components: [] });
    const canalMembro = (i.member as GuildMember).voice.channelId;
    if (fila.channel && canalMembro !== fila.channel.id) {
      return i.reply({ content: `Entre em <#${fila.channel.id}> para controlar o rádio.`, flags: MessageFlags.Ephemeral });
    }

    if (acao === 'pular') {
      await i.deferUpdate();
      fila.node.skip(); // o painel novo sai sozinho quando a próxima começar
      return;
    }
    if (acao === 'pausar') {
      fila.node.setPaused(!fila.node.isPaused());
      return i.update(painelRadio(fila));
    }
    // desligar: o mesmo que /musica parar (para, limpa a fila e sai da call).
    delete fila.metadata.radio;
    fila.delete();
    return i.update({ content: `⏹️ Rádio desligado por ${i.user}. Parei a música e saí da call.`, components: [], allowedMentions: { parse: [] } });
  },
};
