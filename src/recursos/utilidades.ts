import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMember,
} from 'discord.js';
import { JOGOS, nomeCargoJogo } from '../config.ts';
import { cargoPorNome } from '../lib/servidor.ts';
import type { Comando, HandlerBotao } from '../tipos.ts';

const embaralhar = <T>(lista: T[]) => {
  const copia = [...lista];
  for (let n = copia.length - 1; n > 0; n--) {
    const j = Math.floor(Math.random() * (n + 1));
    [copia[n], copia[j]] = [copia[j], copia[n]];
  }
  return copia;
};

// ---------- /lfg: chamar a galera para jogar ----------
// O estado (vagas e confirmados) mora no próprio embed, então sobrevive a reinícios do bot.

const botoesLfg = (cheio: boolean) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('lfg:entrar').setLabel(cheio ? 'Lotado' : 'Tô dentro').setEmoji('✋').setStyle(ButtonStyle.Success).setDisabled(cheio),
    new ButtonBuilder().setCustomId('lfg:sair').setLabel('Sair').setStyle(ButtonStyle.Secondary),
  );

export const lfg: Comando = {
  data: new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Chama a galera para jogar (avisa quem tem o cargo do jogo)')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName('jogo')
        .setDescription('Qual jogo')
        .setRequired(true)
        .addChoices(...JOGOS.map((j) => ({ name: `${j.emoji} ${j.nome}`, value: j.id }))),
    )
    .addIntegerOption((o) => o.setName('vagas').setDescription('Quantas pessoas além de você').setRequired(true).setMinValue(1).setMaxValue(20))
    .addStringOption((o) => o.setName('recado').setDescription('Ex.: ranked às 21h, partida casual...').setMaxLength(150)),

  async executar(i) {
    const jogo = JOGOS.find((j) => j.id === i.options.getString('jogo', true))!;
    const vagas = i.options.getInteger('vagas', true);
    const cargo = cargoPorNome(i.guild!, nomeCargoJogo(jogo));
    const recado = i.options.getString('recado');

    const embed = new EmbedBuilder()
      .setColor(jogo.cor)
      .setTitle(`${jogo.emoji} Bora de ${jogo.nome}?`)
      .setDescription(`${i.user} está chamando!${recado ? `\n> ${recado}` : ''}`)
      .addFields({ name: `Confirmados (0/${vagas})`, value: '_ninguém ainda_' })
      .setFooter({ text: 'Entre em "➕ Criar call" quando fechar o grupo.' });

    return i.reply({
      content: cargo ? `${cargo}` : undefined,
      embeds: [embed],
      components: [botoesLfg(false)],
      allowedMentions: { roles: cargo ? [cargo.id] : [] },
    });
  },
};

export const botaoLfg: HandlerBotao = {
  prefixo: 'lfg',
  async executar(i, acao) {
    const original = i.message.embeds[0];
    const campo = original?.fields[0];
    const vagas = Number(campo?.name.match(/\/(\d+)\)/)?.[1] ?? 0);
    if (!original || !campo || !vagas) return i.reply({ content: 'Esse chamado expirou.', flags: MessageFlags.Ephemeral });

    let confirmados = [...campo.value.matchAll(/<@(\d+)>/g)].map((m) => m[1]);
    const criador = original.description?.match(/<@(\d+)>/)?.[1];

    if (acao === 'entrar') {
      if (i.user.id === criador) return i.reply({ content: 'Você já é quem está chamando 😄', flags: MessageFlags.Ephemeral });
      if (confirmados.includes(i.user.id)) return i.reply({ content: 'Você já está na lista.', flags: MessageFlags.Ephemeral });
      if (confirmados.length >= vagas) return i.reply({ content: 'Lotou!', flags: MessageFlags.Ephemeral });
      confirmados.push(i.user.id);
    } else {
      if (!confirmados.includes(i.user.id)) return i.reply({ content: 'Você não estava na lista.', flags: MessageFlags.Ephemeral });
      confirmados = confirmados.filter((id) => id !== i.user.id);
    }

    const cheio = confirmados.length >= vagas;
    const embed = EmbedBuilder.from(original).setFields({
      name: `Confirmados (${confirmados.length}/${vagas})${cheio ? ' · FECHOU! 🔥' : ''}`,
      value: confirmados.length ? confirmados.map((id) => `<@${id}>`).join('\n') : '_ninguém ainda_',
    });
    await i.update({ embeds: [embed], components: [botoesLfg(cheio)] });
    if (cheio && acao === 'entrar') {
      await i.followUp({ content: `🔥 Fechou o grupo! <@${criador}> ${confirmados.map((id) => `<@${id}>`).join(' ')} bora pra call!` });
    }
  },
};

// ---------- /times: divide a call em times ----------

export const times: Comando = {
  data: new SlashCommandBuilder()
    .setName('times')
    .setDescription('Divide quem está na sua call em times aleatórios')
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantos times (padrão: 2)').setMinValue(2).setMaxValue(10)),

  async executar(i) {
    const canal = (i.member as GuildMember).voice.channel;
    if (!canal) return i.reply({ content: 'Entre numa call com a galera primeiro.', flags: MessageFlags.Ephemeral });

    const pessoas = embaralhar([...canal.members.filter((m) => !m.user.bot).values()]);
    const qtd = i.options.getInteger('quantidade') ?? 2;
    if (pessoas.length < qtd) return i.reply({ content: `Só tem ${pessoas.length} pessoa(s) na call.`, flags: MessageFlags.Ephemeral });

    const grupos: GuildMember[][] = Array.from({ length: qtd }, () => []);
    pessoas.forEach((p, n) => grupos[n % qtd].push(p));
    const cores = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠', '⚪', '⚫', '🟤', '🩷'];

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`⚔️ Times de ${canal.name}`)
      .addFields(grupos.map((g, n) => ({ name: `${cores[n]} Time ${n + 1}`, value: g.map((m) => m.displayName).join('\n'), inline: true })));
    return i.reply({ embeds: [embed] });
  },
};

// ---------- /sortear: decide no aleatório ----------

export const sortear: Comando = {
  data: new SlashCommandBuilder()
    .setName('sortear')
    .setDescription('Sorteia uma opção. Ex.: qual indie jogar hoje')
    .addStringOption((o) => o.setName('opcoes').setDescription('Separadas por vírgula. Ex.: Peak, Repo, Lethal Company').setRequired(true).setMaxLength(500)),

  async executar(i) {
    const opcoes = i.options.getString('opcoes', true).split(',').map((o) => o.trim()).filter(Boolean);
    if (opcoes.length < 2) return i.reply({ content: 'Coloque pelo menos duas opções separadas por vírgula.', flags: MessageFlags.Ephemeral });
    const escolhida = opcoes[Math.floor(Math.random() * opcoes.length)];
    return i.reply(`🎰 Entre ${opcoes.map((o) => `\`${o}\``).join(', ')}...\n\n🎉 **${escolhida}**!`);
  },
};

// ---------- Moderação ----------

export const limpar: Comando = {
  data: new SlashCommandBuilder()
    .setName('limpar')
    .setDescription('Apaga as últimas mensagens do canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName('quantidade').setDescription('1 a 100').setRequired(true).setMinValue(1).setMaxValue(100)),

  async executar(i) {
    if (!i.channel || !('bulkDelete' in i.channel)) return i.reply({ content: 'Não dá para limpar aqui.', flags: MessageFlags.Ephemeral });
    // Mensagens com mais de 14 dias não podem ser apagadas em lote (limite do Discord).
    const apagadas = await i.channel.bulkDelete(i.options.getInteger('quantidade', true), true);
    return i.reply({ content: `🧹 Apaguei ${apagadas.size} mensagem(ns).`, flags: MessageFlags.Ephemeral });
  },
};

export const castigo: Comando = {
  data: new SlashCommandBuilder()
    .setName('castigo')
    .setDescription('Deixa alguém de castigo (sem falar/escrever) por um tempo')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('Quem').setRequired(true))
    .addIntegerOption((o) => o.setName('minutos').setDescription('Duração (0 tira o castigo)').setRequired(true).setMinValue(0).setMaxValue(10080))
    .addStringOption((o) => o.setName('motivo').setDescription('Por quê').setMaxLength(200)),

  async executar(i) {
    const membro = await i.guild!.members.fetch(i.options.getUser('membro', true).id).catch(() => null);
    if (!membro?.moderatable) return i.reply({ content: 'Não consigo castigar essa pessoa (cargo acima do meu?).', flags: MessageFlags.Ephemeral });
    const minutos = i.options.getInteger('minutos', true);
    const motivo = i.options.getString('motivo') ?? undefined;
    await membro.timeout(minutos ? minutos * 60_000 : null, motivo);
    return i.reply(minutos ? `🔇 ${membro} de castigo por ${minutos} min.${motivo ? ` Motivo: ${motivo}` : ''}` : `🔊 ${membro} saiu do castigo.`);
  },
};

// ---------- /ajuda ----------

const AJUDA: [string, string][] = [
  ['🎵 Música', '`/tocar` nome ou link · `/musica pular | pausar | parar | fila | tocando | volume | loop | embaralhar` · `/jam` divulga sua Jam do Spotify'],
  ['🔊 Calls', 'Entre em **➕ Criar call** e ganhe uma call sua · `/call nome | limite | trancar | destrancar | dono`'],
  ['🎮 Jogos', '`/lfg` chama a galera · `/times` divide a call · `/sortear` decide o indie da noite · `/enquete` votação'],
  ['🐉 D&D 3.5', '`/rolar 1d20+5` · `/ficha criar | ver | pv | editar | pericias` · `/teste pericia | atributo | resistencia | ataque | estabilizar` · `/iniciativa entrar | npc | proximo | ver | limpar`'],
  ['🌗 Daggerheart', '`/dh rolar` (dualidade, com traço e experiência) · `/dh dano` · `/dh marcar` PV, Estresse, Esperança, Armadura · `/dh medo` · `/dh ficha criar | ver | editar | experiencias`'],
  ['📅 Sessões', '`/sessao marcar mesa:D&D|Daggerheart` vira evento do Discord · `/sessao proximas`'],
  ['📅 Agenda', '`/lembrete criar | lista | apagar` · `/aniversario definir | ver | lista | remover` (parabéns no #geral às 9h)'],
  ['🎉 Diversão', '`/moeda` · `/8ball` · `/cafe` · `/avatar` · `/servidor`'],
  ['🛡️ Admin', '`/setup` monta o servidor · `/limpar` · `/castigo`'],
];

export const ajuda: Comando = {
  data: new SlashCommandBuilder().setName('ajuda').setDescription('Lista tudo que o bot faz'),
  async executar(i) {
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle('🍺 Taverneiro · comandos')
      .addFields(AJUDA.map(([name, value]) => ({ name, value })));
    return i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
