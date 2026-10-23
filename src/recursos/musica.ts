import { DefaultExtractors } from '@discord-player/extractor';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Player, QueryType, QueueRepeatMode, type GuildQueue, type Track } from 'discord-player';
import { getVideoId, YoutubeExtractor } from 'discord-player-youtubei';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type Client,
  type ChatInputCommandInteraction,
  type GuildMember,
  type SendableChannels,
} from 'discord.js';
import { FALAS_DRG } from '../lib/drg.ts';
import { chaveMusica, escolherProxima, lembrar } from '../lib/radio.ts';
import type { Comando, HandlerBotao } from '../tipos.ts';

// Quem quiser saber das músicas pedidas (ex.: o resumo da semana) se inscreve aqui. Os bardos rodam em outro
// programa, sem o banco do Taverneiro, então a música não depende de nada de fora.
let aoPedir: (guildId: string, titulo: string) => void = () => {};
export const aoPedirMusica = (f: typeof aoPedir) => {
  aoPedir = f;
};

// radio: ligado pelo /radio. sugestoes: associadas à música inicial ainda não tocadas (o rádio fica no
// estilo dela e só busca novas quando a lista acaba); historico: últimas tocadas, para não repetir.
type Sugestao = { title: string; author: string; durationMS: number; videoId: string };
type Radio = { historico: string[]; sugestoes: Sugestao[]; painelId?: string; buscando?: boolean };
// ambiente: trilha da mesa de RPG (toca em loop, sem avisar cada volta).
type Metadados = { canal: SendableChannels; radio?: Radio; ambiente?: string };

// Tocadores: os bardos (Claudinho, Durgan...), ligados pelo src/bardos.ts. O Discord só deixa cada conta de bot
// numa call por servidor: cada bardo é mais uma call tocando ao mesmo tempo. O primeiro bardo atende os comandos;
// quem toca numa call nova é o primeiro bardo livre.
type Tocador = { nome: string; client: Client; player: Player };
const tocadores: Tocador[] = [];

/** Calls com música tocando agora, somando todos os tocadores (o supervisor espera acabar antes de reiniciar). */
export const musicasTocando = () => tocadores.reduce((n, t) => n + t.player.nodes.cache.filter((f) => f.isPlaying()).size, 0);

// O discord-player usa os tipos CJS do discord.js e o bot os ESM: é o mesmo objeto em
// tempo de execução, mas o TypeScript enxerga duas classes. Converte só nesta fronteira.
type ClientDoPlayer = ConstructorParameters<typeof Player>[0];
type CanalDoPlayer = Parameters<Player['play']>[0];

// O discord-player passa todo áudio por uma cadeia de efeitos em JavaScript (equalizador, filtros, reamostragem)
// mesmo sem usar nenhum, o que deixa o som abafado. Fica só o volume.
const SEM_EFEITOS = { disableEqualizer: true, disableBiquad: true, disableFilterer: true, disableResampler: true } as const;

/** Prepara um tocador para cada bardo já conectado (a ordem define quem é escolhido primeiro). */
export async function iniciarMusica(bardos: Client[]) {
  for (const bardo of bardos) tocadores.push(await criarTocador(bardo, bardo.user?.username ?? 'Bardo'));
}

async function criarTocador(client: Client, nome: string): Promise<Tocador> {
  const player = new Player(client as unknown as ClientDoPlayer);
  await player.extractors.register(YoutubeExtractor, {});
  await player.extractors.loadMulti(DefaultExtractors);
  registrarEventos(player);
  return { nome, client, player };
}

function registrarEventos(player: Player) {
  player.events.on('playerStart', (fila: GuildQueue<Metadados>, faixa) => {
    if (fila.metadata.ambiente) return;
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
    if (fila.metadata.ambiente) return;
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

async function sugestoesDoYoutubeMusic(player: Player, base: Track, youtube: { searchEngine: `ext:${string}` }): Promise<Sugestao[]> {
  const ext = player.extractors.get(YoutubeExtractor.identifier) as YoutubeExtractor | undefined;
  let id: string | null = getVideoId(base.url);
  if (!id) {
    // Música de outra fonte (ex.: Spotify): acha a versão do YouTube para pegar as sugestões.
    const achada = await player.search(`${base.title} ${base.author}`, youtube);
    id = achada.tracks[0] ? getVideoId(achada.tracks[0].url) : null;
  }
  if (!ext?.innertube || !id) return [];
  // Algumas músicas vêm sem "a seguir" (resposta vazia): aí o rádio cai no plano B (mesmo artista).
  const aSeguir = await ext.innertube.music.getUpNext(id, true).catch(() => undefined);
  return (aSeguir?.contents ?? []).flatMap((item) => {
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
  const player = fila.player;
  try {
    const youtube = { searchEngine: `ext:${YoutubeExtractor.identifier}` } as const;
    let proxima: Track | undefined;
    try {
      // Lista acabando: pede ao "a seguir" do YouTube Music (o mesmo rádio do app) a partir da música atual.
      if (radio.sugestoes.filter((s) => !radio.historico.includes(chaveMusica(s.title, s.author))).length < 5) {
        radio.sugestoes.push(...(await sugestoesDoYoutubeMusic(player, base, youtube)));
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

const filasDo = (guildId: string) =>
  tocadores.map((t) => t.player.nodes.get<Metadados>(guildId)).filter((f): f is GuildQueue<Metadados> => !!f);

/** A fila da call em que a pessoa está (cada tocador pode estar numa call diferente). */
const filaDe = (i: ChatInputCommandInteraction) => {
  const canal = (i.member as GuildMember).voice.channelId;
  return canal ? filasDo(i.guildId!).find((f) => f.channel?.id === canal) : undefined;
};

/** Quem toca na call da pessoa: o tocador que já está nela, senão o primeiro livre que está no servidor. */
function tocadorPara(guildId: string, canalId: string): Tocador | string {
  const naCall = tocadores.find((t) => t.player.nodes.get(guildId)?.channel?.id === canalId);
  if (naCall) return naCall;
  const livre = tocadores.find((t) => t.client.guilds.cache.has(guildId) && !t.player.nodes.get(guildId)?.channel);
  if (livre) return livre;
  const ocupadas = filasDo(guildId).map((f) => `<#${f.channel?.id}>`).join(', ');
  return `🎵 Todos os bots de música estão ocupados (${ocupadas}). Espera uma call liberar.`;
}

// Comandos que mexem na fila exigem estar na mesma call do bot.
function validarFila(i: ChatInputCommandInteraction): GuildQueue<Metadados> | string {
  const fila = filaDe(i);
  if (fila?.currentTrack) return fila;
  const outras = filasDo(i.guildId!).filter((f) => f.channel);
  if (outras.length) return `Entre em ${outras.map((f) => `<#${f.channel!.id}>`).join(' ou ')} para controlar a música.`;
  return 'Não tem nada tocando. Use `/tocar`.';
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

    const t = tocadorPara(i.guildId!, canalVoz.id);
    if (typeof t === 'string') return i.reply({ content: t, flags: MessageFlags.Ephemeral });
    // O canal precisa vir do client de quem vai tocar (senão quem entra na call é o Taverneiro).
    const canalDoTocador = t.client.channels.cache.get(canalVoz.id);
    if (!canalDoTocador) return i.reply({ content: `O **${t.nome}** não consegue ver essa call (permissões).`, flags: MessageFlags.Ephemeral });

    await i.deferReply();
    try {
      const { track, searchResult } = await t.player.play(canalDoTocador as unknown as CanalDoPlayer, i.options.getString('busca', true), {
        requestedBy: i.user.id,
        nodeOptions: {
          ...SEM_EFEITOS,
          metadata: { canal: i.channel as SendableChannels } satisfies Metadados,
          volume: 70,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 60_000,
          leaveOnEnd: true,
          leaveOnEndCooldown: 180_000,
        },
      });
      // Com o rádio ligado, o pedido passa na frente das músicas escolhidas pelo rádio.
      const fila = t.player.nodes.get<Metadados>(i.guildId!);
      if (fila?.metadata.radio && !searchResult.playlist) fila.moveTrack(track, 0);
      if (!searchResult.playlist) aoPedir(i.guildId!, track.title);
      const texto = searchResult.playlist
        ? `📃 Adicionei **${searchResult.tracks.length}** músicas de **${searchResult.playlist.title}**.`
        : `➕ Na fila: **${track.title}** · \`${track.duration}\``;
      return i.editReply(texto + ` (tocando pelo **${t.nome}**)`);
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
    const t = tocadorPara(i.guildId!, canalVoz.id);
    if (typeof t === 'string') return i.reply({ content: t, flags: MessageFlags.Ephemeral });
    const canalDoTocador = t.client.channels.cache.get(canalVoz.id);
    if (!canalDoTocador) return i.reply({ content: `O **${t.nome}** não consegue ver essa call (permissões).`, flags: MessageFlags.Ephemeral });
    const filaAtual = t.player.nodes.get<Metadados>(i.guildId!);

    await i.deferReply();
    const busca = await t.player.search(i.options.getString('musica', true), { requestedBy: i.user.id }).catch(() => null);
    const semente = busca?.tracks[0];
    if (!semente) return i.editReply('😵 Não achei essa música para começar o rádio.');
    aoPedir(i.guildId!, semente.title);

    try {
      if (filaAtual) {
        // Já tem música: liga o rádio na fila atual (a semente entra na frente).
        filaAtual.metadata.radio ??= { historico: [], sugestoes: [] };
        filaAtual.setRepeatMode(QueueRepeatMode.OFF);
        filaAtual.insertTrack(semente, 0);
      } else {
        await t.player.play(canalDoTocador as unknown as CanalDoPlayer, semente, {
          requestedBy: i.user.id,
          nodeOptions: {
            ...SEM_EFEITOS,
            metadata: { canal: i.channel as SendableChannels, radio: { historico: [], sugestoes: [] } } satisfies Metadados,
            volume: 70,
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
    const quem = ` (tocando pelo **${t.nome}**)`;
    return i.editReply(`📻 **Rádio ligado**${quem} com **${semente.title}** (${semente.author}). Depois dela, sigo com músicas associadas sem repetir. Desliga no botão do painel ou com \`/musica parar\`.`);
  },
};

export const botaoRadio: HandlerBotao = {
  prefixo: 'radio',
  async executar(i, acao) {
    const canalDaPessoa = (i.member as GuildMember).voice.channelId;
    const filas = filasDo(i.guildId!);
    const fila = filas.find((f) => f.metadata.radio?.painelId === i.message.id) ?? filas.find((f) => f.channel?.id === canalDaPessoa);
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

// ---------- Trilha sonora da mesa de RPG ----------

export const AMBIENTES = {
  taverna: { nome: '🍺 Taverna', busca: 'medieval tavern ambience music 1 hour' },
  combate: { nome: '⚔️ Combate', busca: 'epic battle music dnd combat 1 hour' },
  floresta: { nome: '🌲 Floresta', busca: 'fantasy forest ambience music 1 hour' },
  masmorra: { nome: '🕯️ Masmorra', busca: 'dungeon ambience dark music dnd 1 hour' },
  cidade: { nome: '🏰 Cidade', busca: 'medieval city market ambience 1 hour' },
  chuva: { nome: '🌧️ Chuva e trovões', busca: 'rain thunder fantasy ambience 1 hour' },
  misterio: { nome: '👁️ Mistério', busca: 'dark mystery horror rpg ambience music 1 hour' },
  viagem: { nome: '🗺️ Viagem', busca: 'fantasy exploration travel music rpg 1 hour' },
} as const;
export type Ambiente = keyof typeof AMBIENTES;

/** Toca a trilha na call de quem pediu (substitui a música que estiver tocando nela). 'parar' desliga. */
export async function executarAmbiente(i: ChatInputCommandInteraction, tipo: Ambiente | 'parar') {
  const canalVoz = (i.member as GuildMember).voice.channel;
  if (!canalVoz) return i.reply({ content: 'Entre na call da mesa primeiro.', flags: MessageFlags.Ephemeral });

  if (tipo === 'parar') {
    const fila = filaDe(i);
    if (!fila) return i.reply({ content: 'Não tem nada tocando na sua call.', flags: MessageFlags.Ephemeral });
    fila.delete();
    return i.reply('🔇 Trilha desligada.');
  }

  const t = tocadorPara(i.guildId!, canalVoz.id);
  if (typeof t === 'string') return i.reply({ content: t, flags: MessageFlags.Ephemeral });
  const canalDoTocador = t.client.channels.cache.get(canalVoz.id);
  if (!canalDoTocador) return i.reply({ content: `O **${t.nome}** não consegue ver essa call (permissões).`, flags: MessageFlags.Ephemeral });

  await i.deferReply();
  const ambiente = AMBIENTES[tipo];
  const busca = await t.player.search(ambiente.busca).catch(() => null);
  // Prefere vídeos longos (trilhas de 20 min ou mais) para não trocar toda hora.
  const faixa = busca?.tracks.find((x) => x.durationMS >= 20 * 60_000) ?? busca?.tracks[0];
  if (!faixa) return i.editReply('😵 Não achei uma trilha agora. Tenta de novo daqui a pouco.');

  // Trilha substitui o que estiver tocando nesta call.
  t.player.nodes.get(i.guildId!)?.delete();
  try {
    const { queue } = await t.player.play(canalDoTocador as unknown as CanalDoPlayer, faixa, {
      requestedBy: i.user.id,
      nodeOptions: {
        ...SEM_EFEITOS,
        metadata: { canal: i.channel as SendableChannels, ambiente: tipo } satisfies Metadados,
        volume: 35,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 60_000,
        leaveOnEnd: false,
      },
    });
    queue.setRepeatMode(QueueRepeatMode.TRACK);
  } catch (erro) {
    console.error('[ambiente]', erro);
    return i.editReply('😵 Não consegui tocar a trilha.');
  }
  const quem = ` pelo **${t.nome}**`;
  return i.editReply(`${ambiente.nome}: trilha tocando em loop${quem}, volume baixo para a narração. Troque com \`/ambiente\` ou desligue com \`/ambiente tipo:parar\`.`);
}

export const ambiente: Comando = {
  data: new SlashCommandBuilder()
    .setName('ambiente')
    .setDescription('Trilha sonora da mesa: toca em loop na sua call, com volume baixo')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o.setName('tipo').setDescription('Clima da cena').setRequired(true).addChoices(
        ...Object.entries(AMBIENTES).map(([value, a]) => ({ name: a.nome, value })),
        { name: '🔇 Parar', value: 'parar' },
      ),
    ),
  executar: (i) => executarAmbiente(i, i.options.getString('tipo', true) as Ambiente | 'parar'),
};

// ---------- /rockandstone: grito de Deep Rock Galactic (e, se estiver em call, um bardo solta o "Rock and Stone!") ----------

// Os áudios do jogo (as falas de "Salute" da wiki de DRG) ficam só no PC dos bardos: assets/privado/ está no
// .gitignore, porque são da Ghost Ship Games e não vão para o GitHub público. Cada uso sorteia um. Sem nenhum, só grita
// no chat.
const PASTA_GRITOS = fileURLToPath(new URL('../../assets/privado/salute/', import.meta.url));
const sortearGrito = () => {
  const arquivos = existsSync(PASTA_GRITOS) ? readdirSync(PASTA_GRITOS).filter((f) => /\.(ogg|mp3|wav)$/i.test(f)) : [];
  return arquivos.length ? join(PASTA_GRITOS, arquivos[Math.floor(Math.random() * arquivos.length)]) : undefined;
};

export const rockandstone: Comando = {
  data: new SlashCommandBuilder()
    .setName('rockandstone')
    .setDescription('ROCK AND STONE! Se você estiver em call, um bardo entra, grita junto e sai')
    .setContexts(InteractionContextType.Guild),

  async executar(i) {
    const grito = FALAS_DRG[Math.floor(Math.random() * FALAS_DRG.length)];
    const sóGrito = (motivo: string) => {
      console.log(`[rockandstone] ${i.user.username}: só o grito (${motivo}).`);
      return i.reply(`⛏️ ${i.user} grita: **${grito}**`);
    };
    const canalVoz = (i.member as GuildMember).voice.channel;
    if (!canalVoz) return sóGrito('fora de call');
    const audio = sortearGrito();
    if (!audio) return sóGrito(`sem áudios em ${PASTA_GRITOS}`);

    const t = tocadorPara(i.guildId!, canalVoz.id);
    if (typeof t === 'string') return sóGrito('todos os bardos ocupados em outras calls');
    const filaAtual = t.player.nodes.get(i.guildId!);
    // Tocando música: não interrompe. Parado na call (ex.: depois de um /tocar): libera a vaga e grita.
    if (filaAtual?.isPlaying()) return sóGrito(`${t.nome} tocando música`);
    filaAtual?.delete();
    const canalDoTocador = t.client.channels.cache.get(canalVoz.id);
    if (!canalDoTocador) return sóGrito(`${t.nome} não vê a call`);

    await i.reply(`⛏️ ${i.user} grita: **${grito}**\n🪨 O **${t.nome}** está descendo na sua call...`);
    const clipe = (await t.player.search(audio, {
      searchEngine: QueryType.FILE,
      // A extensão do YouTube aceita qualquer busca e tem prioridade: sem bloquear, ela procura o nome do arquivo no
      // YouTube (e acha uma música). Sem cache, para não reaproveitar um resultado errado.
      blockExtractors: [YoutubeExtractor.identifier],
      ignoreCache: true,
    }).catch((e) => console.error('[rockandstone] busca do arquivo', e)))?.tracks[0];
    if (!clipe) {
      console.log('[rockandstone] o discord-player não leu o arquivo.');
      return i.editReply(`⛏️ ${i.user} grita: **${grito}**`);
    }
    console.log(`[rockandstone] ${t.nome} tocando o grito em ${canalVoz.name} para ${i.user.username}.`);
    try {
      await t.player.play(canalDoTocador as unknown as CanalDoPlayer, clipe, {
        requestedBy: i.user.id,
        nodeOptions: {
          ...SEM_EFEITOS,
          // ambiente: não posta "Tocando agora" nem "a fila acabou".
          metadata: { canal: i.channel as SendableChannels, ambiente: 'rockandstone' } satisfies Metadados,
          volume: 80,
          leaveOnEnd: true,
          leaveOnEndCooldown: 1_500,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 1_500,
        },
      });
    } catch (erro) {
      console.error('[rockandstone]', erro);
      return i.editReply(`⛏️ ${i.user} grita: **${grito}**`);
    }
    return i.editReply(`⛏️ ${i.user} grita: **${grito}**\n🪨 O **${t.nome}** desceu na call para gritar junto (e sobe de volta quando terminar).`);
  },
};
