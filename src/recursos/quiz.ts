import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type Message,
  type TextChannel,
} from 'discord.js';
import { CANAIS } from '../config.ts';
import { db } from '../db.ts';
import { emoji } from '../lib/servidor.ts';
import { campeoes, detalheCampeao, skinsComSplash, urlSplash, type Campeao } from '../lib/ddragon.ts';
import { alternativas, esconderNome, limparHtml, svgRecorte } from '../lib/quiz.ts';
import type { Comando, HandlerBotao } from '../tipos.ts';
import { darMoedas, moedas } from './economia.ts';
import { renderizarPng } from '../lib/renderizar.ts';


const TEMPO_RODADA = 20_000;
const PAUSA = 4_000;
const PREMIO = 20;
const LETRAS = ['🇦', '🇧', '🇨', '🇩'];
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sortear = <T>(lista: readonly T[]) => lista[Math.floor(Math.random() * lista.length)];

type Modo = 'splash' | 'habilidade' | 'misto';
type Rodada = {
  certa: Campeao;
  inicio: number;
  tentaram: Set<string>;
  acertou?: { id: string; ms: number };
  fim: () => void;
};

const quizzes = new Set<string>(); // canais com quiz rolando
export const quizzesEmAndamento = () => quizzes.size;
const rodadas = new Map<string, Rodada>(); // id da mensagem → rodada

async function montarPergunta(modo: Exclude<Modo, 'misto'>, certa: Campeao) {
  if (modo === 'splash') {
    const skin = sortear(await skinsComSplash(certa.id));
    const r = await fetch(urlSplash(certa.id, skin.num), { signal: AbortSignal.timeout(8_000) });
    const dataUri = `data:image/jpeg;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
    const png = await renderizarPng(svgRecorte(dataUri));
    return {
      embed: new EmbedBuilder().setTitle('🔍 De quem é essa splash?').setImage('attachment://quiz.png'),
      arquivo: new AttachmentBuilder(png, { name: 'quiz.png' }),
      revelar: urlSplash(certa.id, skin.num),
    };
  }
  const d = await detalheCampeao(certa.id);
  const teclas = ['Q', 'W', 'E', 'R'];
  const k = Math.floor(Math.random() * 5);
  const hab = k === 4 ? { tecla: 'Passiva', ...d.passive } : { tecla: teclas[k], ...d.spells[k] };
  const texto = esconderNome(limparHtml(hab.description), certa.name).slice(0, 900);
  return {
    embed: new EmbedBuilder().setTitle(`📜 De quem é essa habilidade? (${hab.tecla})`).setDescription(`**${esconderNome(hab.name, certa.name)}**\n${texto}`),
    revelar: urlSplash(certa.id, 0),
  };
}

async function jogarRodada(canal: TextChannel, numero: number, total: number, modo: Modo, lista: Campeao[], placar: Map<string, number>) {
  const certa = sortear(lista);
  const opcoes = alternativas(lista, certa);
  const tipo = modo === 'misto' ? (Math.random() < 0.6 ? 'splash' : 'habilidade') : modo;
  const p = await montarPergunta(tipo, certa);

  p.embed.setColor(0xf5b544).setFooter({ text: `Rodada ${numero}/${total} · ${TEMPO_RODADA / 1000} s · errou, fica fora da rodada` });
  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    opcoes.map((c, k) => new ButtonBuilder().setCustomId(`quiz:${c.id}`).setLabel(c.name).setEmoji(LETRAS[k]).setStyle(ButtonStyle.Secondary)),
  );
  const msg: Message = await canal.send({ embeds: [p.embed], files: 'arquivo' in p && p.arquivo ? [p.arquivo] : [], components: [botoes] });

  // Espera alguém acertar ou o tempo acabar.
  const rodada = await new Promise<Rodada>((resolver) => {
    const r: Rodada = { certa, inicio: Date.now(), tentaram: new Set(), fim: () => {} };
    const timer = setTimeout(() => r.fim(), TEMPO_RODADA);
    r.fim = () => {
      clearTimeout(timer);
      rodadas.delete(msg.id);
      resolver(r);
    };
    rodadas.set(msg.id, r);
  });

  const revelacao = new EmbedBuilder()
    .setColor(rodada.acertou ? 0x2ecc71 : 0x95a5a6)
    .setTitle(`Era ${certa.name}, ${certa.title}!`)
    .setDescription(
      rodada.acertou
        ? `🎯 <@${rodada.acertou.id}> acertou em ${(rodada.acertou.ms / 1000).toFixed(1)} s e ganhou ${moedas(canal.guild, PREMIO)}.`
        : `${emoji(canal.guild, 'caveira', '⌛')} Ninguém acertou.`,
    )
    .setImage(p.revelar)
    .setFooter({ text: `Rodada ${numero}/${total}` });
  const desativados = new ActionRowBuilder<ButtonBuilder>().addComponents(
    opcoes.map((c, k) =>
      new ButtonBuilder().setCustomId(`quiz:x${k}`).setLabel(c.name).setEmoji(LETRAS[k]).setDisabled(true)
        .setStyle(c.id === certa.id ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
  );
  await msg.edit({ embeds: [revelacao], files: [], attachments: [], components: [desativados] }).catch(() => {});

  if (rodada.acertou) {
    const u = rodada.acertou.id;
    placar.set(u, (placar.get(u) ?? 0) + 1);
    db.prepare('INSERT INTO quiz_pontos (guild_id, user_id, acertos) VALUES (?, ?, 1) ON CONFLICT DO UPDATE SET acertos = acertos + 1').run(canal.guildId, u);
    darMoedas(canal.guildId, u, PREMIO);
  }
}

export const quiz: Comando = {
  data: new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Quiz de campeões do LoL: quem acertar primeiro ganha moedas')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s.setName('iniciar').setDescription('Começa um quiz neste canal')
        .addIntegerOption((o) => o.setName('rodadas').setDescription('Quantas (padrão: 5)').setMinValue(1).setMaxValue(15))
        .addStringOption((o) =>
          o.setName('modo').setDescription('Tipo de pergunta (padrão: misto)').addChoices(
            { name: 'Misto', value: 'misto' },
            { name: 'Pedaço da splash', value: 'splash' },
            { name: 'Descrição de habilidade', value: 'habilidade' },
          ),
        ),
    )
    .addSubcommand((s) => s.setName('ranking').setDescription('Quem mais acertou no quiz')),

  async executar(i) {
    if (i.options.getSubcommand() === 'ranking') {
      const top = db.prepare('SELECT user_id, acertos FROM quiz_pontos WHERE guild_id = ? ORDER BY acertos DESC LIMIT 10').all(i.guildId!) as { user_id: string; acertos: number }[];
      if (!top.length) return i.reply({ content: 'Ninguém acertou nada ainda. Comece com `/quiz iniciar`.', flags: MessageFlags.Ephemeral });
      const medalhas = ['🥇', '🥈', '🥉'];
      const embed = new EmbedBuilder()
        .setColor(0xf5b544)
        .setTitle('🧠 Ranking do quiz')
        .setDescription(top.map((t, k) => `${medalhas[k] ?? `**${k + 1}.**`} <@${t.user_id}> · ${t.acertos} acerto(s)`).join('\n'));
      return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    const canal = i.channel;
    if (canal?.type !== ChannelType.GuildText) return i.reply({ content: 'O quiz só roda em canal de texto comum.', flags: MessageFlags.Ephemeral });
    if (quizzes.has(canal.id)) return i.reply({ content: 'Já tem um quiz rolando aqui.', flags: MessageFlags.Ephemeral });

    const total = i.options.getInteger('rodadas') ?? 5;
    const modo = (i.options.getString('modo') ?? 'misto') as Modo;
    let lista: Campeao[];
    try {
      lista = await campeoes();
    } catch {
      return i.reply({ content: 'Não consegui buscar os campeões no servidor da Riot agora. Tenta de novo daqui a pouco.', flags: MessageFlags.Ephemeral });
    }

    quizzes.add(canal.id);
    await i.reply(`🧠 **Quiz de campeões!** ${total} rodada(s), ${TEMPO_RODADA / 1000} s cada. Quem acertar primeiro leva ${moedas(i.guild, PREMIO)}. Valendo!`);
    const placar = new Map<string, number>();
    try {
      for (let n = 1; n <= total; n++) {
        await jogarRodada(canal, n, total, modo, lista, placar);
        if (n < total) await esperar(PAUSA);
      }
    } catch (erro) {
      console.error('[quiz]', erro);
      await canal.send('😵 O quiz travou (o servidor da Riot não respondeu). Encerrando por aqui.').catch(() => {});
    } finally {
      quizzes.delete(canal.id);
    }

    const final = [...placar.entries()].sort((a, b) => b[1] - a[1]);
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`${emoji(canal.guild, 'gg', '🏁')} Fim do quiz!`)
      .setDescription(final.length ? final.map(([u, p], k) => `${['🥇', '🥈', '🥉'][k] ?? `**${k + 1}.**`} <@${u}> · ${p} acerto(s)`).join('\n') : 'Ninguém acertou nada. Vergonha da Taverna.');
    return canal.send({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

export const botaoQuiz: HandlerBotao = {
  prefixo: 'quiz',
  async executar(i, escolhido) {
    const rodada = rodadas.get(i.message.id);
    if (!rodada || rodada.acertou) return i.reply({ content: 'Essa rodada já acabou.', flags: MessageFlags.Ephemeral });
    if (rodada.tentaram.has(i.user.id)) return i.reply({ content: 'Você já chutou nessa rodada. Espera a próxima!', flags: MessageFlags.Ephemeral });
    rodada.tentaram.add(i.user.id);
    if (escolhido !== rodada.certa.id) return i.reply({ content: '❌ Errou! Fica de fora até a próxima rodada.', flags: MessageFlags.Ephemeral });
    rodada.acertou = { id: i.user.id, ms: Date.now() - rodada.inicio };
    await i.deferUpdate();
    rodada.fim();
  },
};
