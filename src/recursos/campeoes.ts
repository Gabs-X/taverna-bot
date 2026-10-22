import {
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
  type Webhook,
} from 'discord.js';
import { db } from '../db.ts';
import { skinsComSplash, urlIcone, urlSplash, versaoAtual } from '../lib/ddragon.ts';
import type { Comando } from '../tipos.ts';

// Campeões do LoL que "falam" no chat (via webhook, com nome e foto deles) e descem a lenha em alguém.
// Arte oficial do Data Dragon da Riot (uso de fã, sem fins comerciais).

db.exec(`CREATE TABLE IF NOT EXISTS vitimas (
  guild_id TEXT NOT NULL, user_id TEXT NOT NULL, campeao TEXT NOT NULL, vezes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, campeao)
)`);

type Campeao = {
  comando: string;
  id: string; // id no Data Dragon
  nome: string; // nome que aparece como autor da mensagem
  descricao: string;
  cor: number;
  emoji: string;
  golpe: (alvo: string) => string;
  falas: string[];
};

export const CAMPEOES: Campeao[] = [
  {
    comando: 'asheap', id: 'Ashe', nome: 'Ashe AP', cor: 0x5bc0eb, emoji: '🏹',
    descricao: 'Chama a Ashe AP pra resolver o problema com alguém',
    golpe: (a) => `🏹❄️ **Acabei de encher o rabo de ${a} de flechas.**`,
    falas: [
      'Build full AP: Rabadon, Chama Sombria e Capuz da Morte. Cada flecha um nuke.',
      'Uma Flecha de Cristal Encantada com 900 de poder de habilidade. Do outro lado do mapa.',
      'Ativei a Rajada com Ludens e não sobrou um centímetro livre.',
      'Meu Falcão viu tudo e ainda marcou a posição pro resto do time.',
      'Diz o laudo que foi só um auto-ataque. Foram 47.',
      'O suporte pediu pra eu ir de crítico. Eu fui de AP. Olha o resultado.',
    ],
  },
  {
    comando: 'darius', id: 'Darius', nome: 'Darius', cor: 0xa61b1b, emoji: '🪓',
    descricao: 'Chama o Darius pra aplicar a justiça de Noxus em alguém',
    golpe: (a) => `🪓 **NOXUS! Enterrei o machado em ${a} e ainda resetei a ultimate.**`,
    falas: [
      'Cinco acúmulos de hemorragia e uma lição de humildade.',
      'A Guilhotina de Noxus não erra. Só passa por cima.',
      'Tentou fugir? Puxei de volta com o machado.',
      'Fica no chão, que é o seu lugar.',
      'Era 1x5. Eles eram os cinco. Coitados.',
    ],
  },
  {
    comando: 'teemo', id: 'Teemo', nome: 'Capitão Teemo', cor: 0x7cb342, emoji: '🍄',
    descricao: 'Chama o Teemo pra deixar alguém cego e envenenado',
    golpe: (a) => `🍄 **Deixei ${a} cego por 5 segundos e plantei um cogumelo no caminho de casa.**`,
    falas: [
      'Capitão Teemo, a serviço!',
      'O tamanho não importa.',
      'Cuidado onde pisa... ops, tarde demais.',
      'Esse veneno passa em uns três dias. Talvez quatro.',
      'Ninguém nunca me viu. Ninguém nunca me pegou.',
    ],
  },
  {
    comando: 'yasuo', id: 'Yasuo', nome: 'Yasuo', cor: 0x4a90c2, emoji: '🌪️',
    descricao: 'Chama o Yasuo pra dar um tornado em alguém (e morrer depois)',
    golpe: (a) => `🌪️ **Hasagi! Joguei ${a} pro alto com o tornado e finalizei com a ultimate.**`,
    falas: [
      'Fui 0/10, mas essa aqui foi de graça.',
      'A morte é como o vento: sempre ao meu lado. E sempre contra o meu time.',
      'Joguei a Muralha de Vento no lugar errado, mas valeu.',
      'Fluxo cheio, cabeça vazia.',
      'Morri logo depois, mas morri com estilo.',
    ],
  },
  {
    comando: 'blitz', id: 'Blitzcrank', nome: 'Blitzcrank', cor: 0xf0c419, emoji: '🤖',
    descricao: 'Chama o Blitzcrank pra puxar alguém pro meio do time',
    golpe: (a) => `🤖 **BEEP BOOP. Puxei ${a} pro meio do meu time inteiro.**`,
    falas: [
      'Gancho acertado com sucesso. Calculando chance de sobrevivência: 0%.',
      'Campo Estático ativado: desligou geral.',
      'Fui feito para isso.',
      'Erro 404: escapatória não encontrada.',
      'Soco Turbo aplicado. Recomenda-se gelo no local.',
    ],
  },
  {
    comando: 'garen', id: 'Garen', nome: 'Garen', cor: 0x2f6fd6, emoji: '⚔️',
    descricao: 'Chama o Garen pra girar em cima de alguém',
    golpe: (a) => `⚔️ **DEMACIAAA! Girei em cima de ${a} por três segundos seguidos.**`,
    falas: [
      'A Justiça Demaciana sempre acha quem mais matou.',
      'Silêncio! Agora você não usa skill nenhuma.',
      'Coragem é girar sem saber pra onde.',
      'Nada como um bom giro depois do almoço.',
      'Build? Armadura. Estratégia? Girar.',
    ],
  },
  {
    comando: 'jinx', id: 'Jinx', nome: 'Jinx', cor: 0xe84393, emoji: '🚀',
    descricao: 'Chama a Jinx pra mandar um míssil em alguém',
    golpe: (a) => `🚀 **Mandei um Super Mega Míssil da Morte em ${a} lá da outra rota!**`,
    falas: [
      'Ops, era pra ser no outro... não, era nesse mesmo.',
      'Pow-Pow pra cima de você!',
      'Regras são feitas para serem explodidas.',
      'Ganhei velocidade de ataque só de ver você cair.',
      'Corre! Ah, não dá mais tempo.',
    ],
  },
  {
    comando: 'thresh', id: 'Thresh', nome: 'Thresh', cor: 0x2ecc71, emoji: '🏮',
    descricao: 'Chama o Thresh pra prender a alma de alguém na lanterna',
    golpe: (a) => `🏮 **Puxei ${a} com a corrente e guardei a alma na minha lanterna.**`,
    falas: [
      'Que delícia de tormento.',
      'Ninguém escapa da Sentença.',
      'Pode clicar na lanterna... ah, não, essa é só pros meus amigos.',
      'Mais uma alma para a coleção.',
      'A Caixa fechou. Boa sorte aí dentro.',
    ],
  },
];

// Um webhook do bot por canal; o nome e a foto mudam a cada mensagem.
const ganchos = new Map<string, Webhook>();

async function webhookDo(canal: TextChannel, botId: string) {
  const salvo = ganchos.get(canal.id);
  if (salvo) return salvo;
  const existentes = await canal.fetchWebhooks();
  const gancho =
    existentes.find((w) => w.owner?.id === botId && (w.name === 'Taverna Campeões' || w.name === 'Ashe AP')) ??
    (await canal.createWebhook({ name: 'Taverna Campeões', reason: 'Comandos de campeões do LoL' }));
  ganchos.set(canal.id, gancho);
  return gancho;
}

const sortear = <T>(lista: readonly T[]) => lista[Math.floor(Math.random() * lista.length)];

async function executarCampeao(c: Campeao, i: ChatInputCommandInteraction) {
  const alvo = i.options.getUser('membro', true);
  const viaWebhook = i.channel?.type === ChannelType.GuildText;
  await i.deferReply(viaWebhook ? { flags: MessageFlags.Ephemeral } : {});
  const ehBot = alvo.id === i.client.user.id;

  let fala: string;
  let vezes = 0;
  if (ehBot) {
    fala = `${c.emoji} Mirei no taverneiro, mas ele se escondeu atrás do balcão. Me arruma outro alvo.`;
  } else {
    db.prepare('INSERT INTO vitimas (guild_id, user_id, campeao, vezes) VALUES (?, ?, ?, 1) ON CONFLICT DO UPDATE SET vezes = vezes + 1').run(i.guildId, alvo.id, c.id);
    vezes = (db.prepare('SELECT vezes FROM vitimas WHERE guild_id = ? AND user_id = ? AND campeao = ?').get(i.guildId, alvo.id, c.id) as { vezes: number }).vezes;
    const quem = alvo.id === i.user.id ? `${alvo}, que pediu pra apanhar` : `${alvo}`;
    fala = `${c.golpe(quem)}\n${sortear(c.falas)}`;
  }

  // Busca skins e ícone (com cache); se o Data Dragon cair, vai sem imagem.
  let splash: string | undefined;
  let icone: string | undefined;
  let nomeSkin = c.nome;
  try {
    const [skins, versao] = await Promise.all([skinsComSplash(c.id), versaoAtual()]);
    const skin = sortear(skins);
    splash = urlSplash(c.id, skin.num);
    icone = urlIcone(versao, c.id);
    if (skin.num !== 0) nomeSkin = skin.name;
  } catch {
    // segue sem imagem
  }

  const embed = new EmbedBuilder()
    .setColor(c.cor)
    .setFooter({ text: `${nomeSkin}${vezes ? ` · ${vezes}ª vez que ${alvo.displayName} apanha de ${c.nome}` : ''} · chamado por ${i.user.displayName}` });
  if (splash) embed.setImage(splash);
  const mensagem = { content: fala, embeds: [embed], allowedMentions: { users: ehBot ? [] : [alvo.id] } };

  if (viaWebhook && i.channel?.type === ChannelType.GuildText) {
    try {
      const gancho = await webhookDo(i.channel, i.client.user.id);
      await gancho.send({ ...mensagem, username: c.nome, avatarURL: icone });
      return i.deleteReply();
    } catch {
      ganchos.delete(i.channelId);
      // Sem a permissão "Gerenciar webhooks": manda pelo próprio bot, no formato de fala.
    }
  }
  embed.setAuthor({ name: c.nome, iconURL: icone });
  if (!viaWebhook) return i.editReply(mensagem);
  // A resposta adiada era só para quem chamou (efêmera): troca por uma pública.
  await i.deleteReply().catch(() => null);
  return i.followUp(mensagem);
}

export const comandosCampeoes: Comando[] = CAMPEOES.map((c) => ({
  data: new SlashCommandBuilder()
    .setName(c.comando)
    .setDescription(c.descricao)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('Quem vai apanhar').setRequired(true)),
  executar: (i) => executarCampeao(c, i),
}));

// ---------- /vitimas ----------

const nomeDoCampeao = (id: string) => CAMPEOES.find((c) => c.id === id);

export const vitimas: Comando = {
  data: new SlashCommandBuilder()
    .setName('vitimas')
    .setDescription('Placar de quem mais apanhou dos campeões (ou a ficha de alguém)')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('Ver de quem cada um apanhou')),
  async executar(i) {
    const g = i.guildId!;
    const membro = i.options.getUser('membro');

    if (membro) {
      const linhas = db.prepare('SELECT campeao, vezes FROM vitimas WHERE guild_id = ? AND user_id = ? ORDER BY vezes DESC').all(g, membro.id) as { campeao: string; vezes: number }[];
      if (!linhas.length) return i.reply({ content: `${membro.username} nunca apanhou de nenhum campeão. Por enquanto.`, flags: MessageFlags.Ephemeral });
      const total = linhas.reduce((s, l) => s + l.vezes, 0);
      const embed = new EmbedBuilder()
        .setColor(0xc0392b)
        .setAuthor({ name: `Ficha de ${membro.displayName}`, iconURL: membro.displayAvatarURL() })
        .setTitle(`🩹 Apanhou ${total} vez(es)`)
        .setDescription(linhas.map((l) => `${nomeDoCampeao(l.campeao)?.emoji ?? '⚔️'} **${nomeDoCampeao(l.campeao)?.nome ?? l.campeao}** · ${l.vezes}x`).join('\n'));
      return i.reply({ embeds: [embed] });
    }

    const top = db.prepare('SELECT user_id, SUM(vezes) AS total FROM vitimas WHERE guild_id = ? GROUP BY user_id ORDER BY total DESC LIMIT 10').all(g) as { user_id: string; total: number }[];
    if (!top.length) return i.reply({ content: 'Ninguém apanhou ainda. Use `/asheap`, `/darius`, `/teemo`...', flags: MessageFlags.Ephemeral });
    const favorito = (u: string) => {
      const l = db.prepare('SELECT campeao FROM vitimas WHERE guild_id = ? AND user_id = ? ORDER BY vezes DESC LIMIT 1').get(g, u) as { campeao: string };
      const c = nomeDoCampeao(l.campeao);
      return c ? `${c.emoji} mais de ${c.nome}` : '';
    };
    const medalhas = ['🥇', '🥈', '🥉'];
    const embed = new EmbedBuilder()
      .setColor(0xc0392b)
      .setTitle('🩹 Placar de vítimas da Taverna')
      .setDescription(top.map((t, k) => `${medalhas[k] ?? `**${k + 1}.**`} <@${t.user_id}> · apanhou **${t.total}x** · ${favorito(t.user_id)}`).join('\n'))
      .setFooter({ text: 'Veja a ficha de alguém com /vitimas membro:' });
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
