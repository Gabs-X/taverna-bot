import {
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { Comando } from '../tipos.ts';

const sortear = <T>(lista: readonly T[]) => lista[Math.floor(Math.random() * lista.length)];

// ---------- /enquete: votação nativa do Discord ----------

export const enquete: Comando = {
  data: new SlashCommandBuilder()
    .setName('enquete')
    .setDescription('Cria uma votação. Ex.: qual jogo hoje, que horas a sessão')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('pergunta').setDescription('A pergunta').setRequired(true).setMaxLength(300))
    .addStringOption((o) =>
      o.setName('opcoes').setDescription('De 2 a 10, separadas por vírgula. Ex.: Valorant, CS2, Indie').setRequired(true).setMaxLength(600),
    )
    .addIntegerOption((o) => o.setName('horas').setDescription('Quanto tempo fica aberta (padrão: 24)').setMinValue(1).setMaxValue(168))
    .addBooleanOption((o) => o.setName('varias').setDescription('Permitir votar em mais de uma opção')),

  async executar(i) {
    const opcoes = [...new Set(i.options.getString('opcoes', true).split(',').map((o) => o.trim()).filter(Boolean))];
    if (opcoes.length < 2 || opcoes.length > 10) {
      return i.reply({ content: 'Coloque de 2 a 10 opções diferentes, separadas por vírgula.', flags: MessageFlags.Ephemeral });
    }
    const longa = opcoes.find((o) => o.length > 55);
    if (longa) return i.reply({ content: `A opção "${longa.slice(0, 60)}…" passou de 55 caracteres (limite do Discord).`, flags: MessageFlags.Ephemeral });

    return i.reply({
      poll: {
        question: { text: i.options.getString('pergunta', true) },
        answers: opcoes.map((text) => ({ text })),
        duration: i.options.getInteger('horas') ?? 24,
        allowMultiselect: i.options.getBoolean('varias') ?? false,
      },
    });
  },
};

// ---------- /moeda e /8ball ----------

export const moeda: Comando = {
  data: new SlashCommandBuilder().setName('moeda').setDescription('Cara ou coroa'),
  async executar(i) {
    const lado = Math.random() < 0.5 ? '🙂 **Cara**' : '👑 **Coroa**';
    return i.reply(`🪙 A moeda girou, girou... ${lado}!`);
  },
};

const RESPOSTAS_8BALL = [
  'Com certeza.', 'Pode apostar.', 'Sem dúvida nenhuma.', 'Os dados dizem que sim.', 'Rolou 20 natural: sim!',
  'Provavelmente.', 'Tudo indica que sim.', 'Pergunta de novo depois da próxima partida.', 'Melhor não te contar agora.',
  'Nem o Mestre sabe essa.', 'Concentra e pergunta de novo.', 'Não conta com isso.', 'Minhas fontes dizem que não.',
  'Rolou 1 natural: não.', 'Só se o time inteiro colaborar (ou seja, não).', 'Nem a pau, maluco.',
];

export const bola8: Comando = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('A bola mágica da taverna responde sua pergunta')
    .addStringOption((o) => o.setName('pergunta').setDescription('Sim ou não?').setRequired(true).setMaxLength(200)),
  async executar(i) {
    const pergunta = i.options.getString('pergunta', true);
    return i.reply({ content: `🎱 **${pergunta}**\n> ${sortear(RESPOSTAS_8BALL)}`, allowedMentions: { parse: [] } });
  },
};

// ---------- /avatar e /servidor ----------

export const avatar: Comando = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Mostra a foto de perfil de alguém em tamanho grande')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('Quem (padrão: você)')),
  async executar(i) {
    const usuario = i.options.getUser('membro') ?? i.user;
    const membro = await i.guild!.members.fetch(usuario.id).catch(() => null);
    // Avatar do servidor (se a pessoa tiver um) tem prioridade sobre o global.
    const url = (membro ?? usuario).displayAvatarURL({ size: 1024, extension: 'png', forceStatic: false });
    const embed = new EmbedBuilder()
      .setColor(membro?.displayColor || 0x5865f2)
      .setTitle(`🖼️ ${membro?.displayName ?? usuario.username}`)
      .setURL(url)
      .setImage(url);
    return i.reply({ embeds: [embed] });
  },
};

export const servidor: Comando = {
  data: new SlashCommandBuilder()
    .setName('servidor')
    .setDescription('Informações e números do servidor')
    .setContexts(InteractionContextType.Guild),
  async executar(i) {
    const guild = i.guild!;
    const membros = await guild.members.fetch();
    const humanos = membros.filter((m) => !m.user.bot);
    const online = humanos.filter((m) => m.presence && m.presence.status !== 'offline').size;
    const naCall = humanos.filter((m) => m.voice.channelId).size;
    const canais = guild.channels.cache;
    const dono = await guild.fetchOwner().catch(() => null);
    const criado = Math.floor(guild.createdTimestamp / 1000);

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`🍺 ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: '👥 Membros', value: `${humanos.size} malucos · ${membros.size - humanos.size} bots`, inline: true },
        { name: '🟢 Agora', value: `${online} online · ${naCall} em call`, inline: true },
        { name: '👑 Dono', value: dono ? `${dono}` : '—', inline: true },
        {
          name: '💬 Canais',
          value: `${canais.filter((c) => c.type === ChannelType.GuildText).size} de texto · ${canais.filter((c) => c.type === ChannelType.GuildVoice).size} de voz`,
          inline: true,
        },
        { name: '🏷️ Cargos', value: `${guild.roles.cache.size - 1}`, inline: true },
        { name: '🚀 Boosts', value: `${guild.premiumSubscriptionCount ?? 0} (nível ${guild.premiumTier})`, inline: true },
        { name: '📅 Criado', value: `<t:${criado}:D> (<t:${criado}:R>)` },
      );
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

// ---------- /cafe: o taverneiro passa um café, com direito a animação ----------

const CAFES = {
  coado: { nome: 'café coado', emoji: '☕', passos: ['🔥 Esquentando a água (sem ferver, que queima o pó)...', '🫖 Colocando o filtro de pano e o pó...', '💧 Despejando a água devagarinho...'] },
  expresso: { nome: 'expresso', emoji: '☕', passos: ['⚙️ Moendo os grãos na hora...', '🧱 Compactando o pó no porta-filtro...', '💨 Extraindo sob pressão...'] },
  capuccino: { nome: 'capuccino', emoji: '🥛', passos: ['☕ Tirando um expresso...', '🥛 Vaporizando o leite até fazer espuma...', '🍫 Polvilhando chocolate e canela...'] },
  pingado: { nome: 'pingado', emoji: '🥛', passos: ['🥛 Esquentando o leite...', '☕ Pingando o café por cima...', '🍞 Separando um pão na chapa pra acompanhar...'] },
  gelado: { nome: 'café gelado', emoji: '🧊', passos: ['☕ Passando um café forte...', '🧊 Enchendo o copo de gelo...', '🥛 Completando com leite e um fio de doce de leite...'] },
} as const;

const FINAIS_CAFE = [
  'Cuidado que tá quente.', 'Por conta da casa.', 'Esse aqui ressuscita qualquer um depois de sessão até as 3h.',
  'Feito com o mesmo carinho do Mestre ao matar seu personagem.', 'Açúcar fica no balcão, cada um com seu pecado.',
  'Se derramar no teclado, a taverna não se responsabiliza.',
];

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const cafe: Comando = {
  data: new SlashCommandBuilder()
    .setName('cafe')
    .setDescription('O taverneiro passa um café pra você (ou pra alguém)')
    .addStringOption((o) =>
      o.setName('tipo').setDescription('Qual café (padrão: surpresa)').addChoices(
        ...Object.entries(CAFES).map(([value, c]) => ({ name: c.nome, value })),
      ),
    )
    .addUserOption((o) => o.setName('para').setDescription('Servir pra outra pessoa')),
  async executar(i) {
    const chave = (i.options.getString('tipo') ?? sortear(Object.keys(CAFES))) as keyof typeof CAFES;
    const c = CAFES[chave];
    const para = i.options.getUser('para');
    const linhas = [`${c.emoji} **Preparando um ${c.nome}${para ? ` pra ${para}` : ''}...**`];

    await i.reply({ content: linhas[0], allowedMentions: { parse: [] } });
    for (const passo of c.passos) {
      await esperar(1500);
      linhas.push(`> ${passo}`);
      await i.editReply({ content: linhas.join('\n'), allowedMentions: { parse: [] } });
    }
    await esperar(1500);
    linhas.push('', `${c.emoji} Pronto, ${para ?? i.user}! Seu **${c.nome}** tá servido. ${sortear(FINAIS_CAFE)}`);
    // Só a mensagem final menciona, pra quem recebeu o café ser avisado uma vez.
    return i.editReply({ content: linhas.join('\n'), allowedMentions: { users: [(para ?? i.user).id] } });
  },
};

// ---------- /asheap: a Ashe AP resolve as diferenças ----------

// Arte oficial do Data Dragon da Riot (uso de fã, sem fins comerciais). Só skins com splash própria (chromas não têm).
const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn';
const ASHE_ICONE = `${DDRAGON}/16.21.1/img/champion/Ashe.png`;
const ASHE_SKINS: [number, string][] = [
  [0, 'Ashe'], [1, 'Ashe de Freljord'], [2, 'Ashe de Sherwood'], [4, 'Ashe Rainha'], [5, 'Ashe Ametista'],
  [6, 'Ashe Cupido Mortal'], [7, 'Ashe Saqueadora'], [8, 'PROJETO: Ashe'], [9, 'Ashe Mundial 2017'],
  [11, 'Ashe Rainha Cósmica'], [17, 'Ashe Velho Oeste'], [23, 'Ashe Dragoa Feérica'], [32, 'Ashe Congregação das Bruxas'],
  [43, 'Ashe Canção do Oceano'], [52, 'Ashe Imperatriz Lunar'], [63, 'Ashe DRX'], [65, 'Ashe Crystalis Motus'],
  [67, 'Ashe Infernal'], [76, 'Ashe Florescer Espiritual'], [84, 'Ashe Fogos de Artifício'],
];

// Falas em primeira pessoa: quem "manda" a mensagem é a Ashe AP.
const ASHE_FALAS = [
  'Build full AP: Rabadon, Chama Sombria e Capuz da Morte. Cada flecha um nuke.',
  'Uma Flecha de Cristal Encantada com 900 de poder de habilidade. Do outro lado do mapa.',
  'Ativei a Rajada com Ludens e não sobrou um centímetro livre.',
  'Meu Falcão viu tudo e ainda marcou a posição pro resto do time.',
  'Agora vai sentar de lado pelo resto da partida.',
  'Diz o laudo que foi só um auto-ataque. Foram 47.',
  'Lentidão aplicada com sucesso: não anda direito até amanhã.',
  'O suporte pediu pra eu ir de crítico. Eu fui de AP. Olha o resultado.',
];

export const asheap: Comando = {
  data: new SlashCommandBuilder()
    .setName('asheap')
    .setDescription('Chama a Ashe AP pra resolver o problema com alguém')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('Quem vai levar as flechas').setRequired(true)),
  async executar(i) {
    const alvo = i.options.getUser('membro', true);
    const [skin, nomeSkin] = sortear(ASHE_SKINS);

    let fala: string;
    if (alvo.id === i.client.user.id) {
      fala = 'Mirei no taverneiro, mas ele se escondeu atrás do balcão. Me arruma outro alvo.';
    } else {
      const quem = alvo.id === i.user.id ? `${alvo}, que pediu pra levar` : `${alvo}`;
      fala = `🏹❄️ **Acabei de encher o rabo de ${quem} de flechas.**\n${sortear(ASHE_FALAS)}`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5bc0eb)
      .setImage(`${DDRAGON}/img/champion/splash/Ashe_${skin}.jpg`)
      .setFooter({ text: `${nomeSkin} · build AP · chamada por ${i.user.displayName}` });
    const mensagem = { content: fala, embeds: [embed], allowedMentions: { users: [alvo.id] } };

    // Via webhook a mensagem aparece com o nome e a foto da Ashe, como se ela mesma tivesse escrito.
    const canal = i.channel;
    if (canal?.type === ChannelType.GuildText) {
      try {
        const ganchos = await canal.fetchWebhooks();
        const gancho =
          ganchos.find((w) => w.owner?.id === i.client.user.id && w.name === 'Ashe AP') ??
          (await canal.createWebhook({ name: 'Ashe AP', avatar: ASHE_ICONE, reason: '/asheap' }));
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        await gancho.send({ ...mensagem, username: 'Ashe AP', avatarURL: ASHE_ICONE });
        return i.deleteReply();
      } catch {
        // Sem a permissão "Gerenciar webhooks": manda pelo próprio bot, no formato de fala.
      }
    }
    embed.setAuthor({ name: 'Ashe AP', iconURL: ASHE_ICONE });
    const resposta = { ...mensagem, embeds: [embed] };
    if (!i.deferred) return i.reply(resposta);
    // A resposta adiada era só para mim (efêmera): troca por uma pública.
    await i.deleteReply().catch(() => null);
    return i.followUp(resposta);
  },
};
