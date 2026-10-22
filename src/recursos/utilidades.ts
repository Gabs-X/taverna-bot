import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
  type GuildMember,
  type Message,
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
    .setDescription('Apaga mensagens do canal (de todo mundo, inclusive do bot) ou o canal inteiro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName('quantidade').setDescription('1 a 100 (padrão: 100)').setMinValue(1).setMaxValue(100))
    .addBooleanOption((o) => o.setName('tudo').setDescription('Apaga TODAS as mensagens do canal (recria o canal; pede confirmação)'))
    .addStringOption((o) =>
      o.setName('de').setDescription('De quem apagar (padrão: todo mundo, inclusive bots)').addChoices(
        { name: 'Todo mundo (inclusive bots)', value: 'todos' },
        { name: 'Só bots', value: 'bots' },
        { name: 'Só pessoas', value: 'pessoas' },
      ),
    )
    .addUserOption((o) => o.setName('membro').setDescription('Apagar só as mensagens desta pessoa (ou bot)')),

  async executar(i) {
    const canal = i.channel;
    if (!canal || !('bulkDelete' in canal)) return i.reply({ content: 'Não dá para limpar aqui.', flags: MessageFlags.Ephemeral });

    if (i.options.getBoolean('tudo')) {
      if (!(canal instanceof TextChannel)) return i.reply({ content: 'Limpar tudo só funciona em canal de texto comum.', flags: MessageFlags.Ephemeral });
      if (!(i.member as GuildMember).permissions.has(PermissionFlagsBits.ManageChannels)) {
        return i.reply({ content: 'Limpar tudo recria o canal: precisa da permissão **Gerenciar canais**.', flags: MessageFlags.Ephemeral });
      }
      const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`limpartudo:confirmar:${i.user.id}`).setLabel('Apagar tudo').setEmoji('🧨').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`limpartudo:cancelar:${i.user.id}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
      );
      return i.reply({
        content: `⚠️ Isso apaga **todas** as mensagens de ${canal}, inclusive as fixadas, e não dá para desfazer. O canal é recriado igual (nome, tópico, permissões e posição). Confirmar?`,
        components: [botoes],
        flags: MessageFlags.Ephemeral,
      });
    }

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const quantidade = i.options.getInteger('quantidade') ?? 100;
    const de = i.options.getString('de') ?? 'todos';
    const membro = i.options.getUser('membro');

    // Busca em páginas até achar `quantidade` mensagens que passam no filtro (no máximo 500 olhadas).
    const alvo: Message[] = [];
    let antes: string | undefined;
    for (let pagina = 0; pagina < 5 && alvo.length < quantidade; pagina++) {
      const lote = await canal.messages.fetch({ limit: 100, before: antes });
      if (!lote.size) break;
      for (const m of lote.values()) {
        if (m.pinned) continue;
        if (membro && m.author.id !== membro.id) continue;
        if (de === 'bots' && !m.author.bot) continue;
        if (de === 'pessoas' && m.author.bot) continue;
        alvo.push(m);
        if (alvo.length === quantidade) break;
      }
      antes = lote.last()!.id;
    }

    // Até 14 dias o Discord apaga em lote; as mais velhas só uma a uma.
    const limite = Date.now() - 14 * 24 * 3_600_000 + 60_000;
    const recentes = alvo.filter((m) => m.createdTimestamp > limite);
    const antigas = alvo.filter((m) => m.createdTimestamp <= limite);
    let apagadas = 0;
    let falhas = 0;
    try {
      if (recentes.length === 1) await recentes[0].delete();
      else if (recentes.length) await canal.bulkDelete(recentes);
      apagadas += recentes.length;
    } catch {
      falhas += recentes.length;
    }
    for (const m of antigas) {
      try {
        await m.delete();
        apagadas++;
      } catch {
        falhas++;
      }
    }

    const partes = [`🧹 Apaguei ${apagadas} mensagem(ns).`];
    if (antigas.length) partes.push(`${antigas.length} tinham mais de 14 dias e foram apagadas uma a uma.`);
    if (falhas) partes.push(`⚠️ ${falhas} não deu para apagar: confira se o bot tem a permissão **Gerenciar mensagens** neste canal.`);
    if (alvo.length < quantidade) partes.push(`Só achei ${alvo.length} que batiam com o filtro nas últimas 500 mensagens (fixadas não contam).`);
    return i.editReply(partes.join('\n'));
  },
};

export const botaoLimparTudo: HandlerBotao = {
  prefixo: 'limpartudo',
  async executar(i, argumento) {
    const [acao, donoId] = argumento.split(':');
    if (i.user.id !== donoId) return i.reply({ content: 'Esse botão não é seu.', flags: MessageFlags.Ephemeral });
    if (acao === 'cancelar') return i.update({ content: '👍 Cancelado. Nada foi apagado.', components: [] });

    const canal = i.channel;
    if (!(canal instanceof TextChannel)) return i.update({ content: 'Esse canal não pode ser recriado.', components: [] });
    if (Date.now() - i.message.createdTimestamp > 2 * 60_000) {
      return i.update({ content: '⌛ A confirmação expirou. Rode `/limpar tudo:true` de novo.', components: [] });
    }
    await i.update({ content: '🧨 Limpando...', components: [] });

    try {
      // Clonar copia nome, tópico, categoria, permissões, slowmode e NSFW; a posição é ajustada em seguida.
      const novo = await canal.clone({ reason: `/limpar tudo por ${i.user.tag}` });
      await novo.setPosition(canal.position);
      await canal.delete(`/limpar tudo por ${i.user.tag}`);
      await novo.send({ content: `🧹 Canal limpo por ${i.user}.`, allowedMentions: { parse: [] } });
    } catch {
      return i.editReply({ content: '⚠️ Não consegui recriar o canal. O bot precisa da permissão **Gerenciar canais**.' }).catch(() => null);
    }
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
  ['🦇 Gótica', 'No canal #goticas: `/gotica adotar` nome · `/gotica ver` (com botões para cuidar) · `/gotica customizar` escolhe o visual · `/gotica visual` sorteia um novo · `/gotica duelo` por turnos · `/gotica visitar` · `/gotica renomear` · `/gotica ranking` · `/loja ver | comprar | equipar | tirar` (chapéus, óculos, bichinhos e fundos)'],
  ['💰 Taverna', '`/daily` · `/trabalhar` · `/carteira` · `/pix` · `/rank` cartão de nível · `/top` nível, moedas ou call. Mensagens e tempo em call dão XP, moedas e cargos'],
  ['🎉 Diversão', '`/moeda` · `/8ball` · `/cafe` · `/asheap` · `/avatar` · `/servidor`'],
  ['🛡️ Admin', '`/setup` monta o servidor · `/limpar` quantidade, de bots/pessoas/membro, ou `tudo` (recria o canal) · `/castigo`'],
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
