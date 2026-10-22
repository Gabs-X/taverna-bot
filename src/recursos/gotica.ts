import { Resvg } from '@resvg/resvg-js';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { db } from '../db.ts';
import {
  ACOES,
  aplicarAcao,
  barra,
  DESBLOQUEIOS,
  gostoDe,
  humorDe,
  sortearAparencia,
  sortearPersonalidade,
  statusAgora,
  xpParaProximo,
  type Acao,
  type Aparencia,
  type Estado,
} from '../lib/gotica.ts';
import { desenharGotica } from '../lib/goticaArte.ts';
import type { Comando, HandlerBotao } from '../tipos.ts';

type Linha = {
  guild_id: string;
  user_id: string;
  nome: string;
  aparencia: string;
  personalidade: string;
  nivel: number;
  xp: number;
  barriga: number;
  humor: number;
  energia: number;
  atualizado_em: number;
  ultimas: string;
  criada_em: number;
};

const COR = { feliz: 0x9b59b6, neutra: 0x6c3483, triste: 0x34495e } as const;
const ROSTO = { feliz: '😊 feliz', neutra: '😐 de boa', triste: '😢 tristinha' } as const;
const SEM_GOTICA = 'Você ainda não tem uma gótica. Adote uma com `/gotica adotar`.';

const ler = (g: string, u: string) =>
  db.prepare('SELECT * FROM goticas WHERE guild_id = ? AND user_id = ?').get(g, u) as Linha | undefined;

const estadoDe = (l: Linha): Estado => ({
  nivel: l.nivel,
  xp: l.xp,
  barriga: l.barriga,
  humor: l.humor,
  energia: l.energia,
  atualizadoEm: l.atualizado_em,
  ultimas: JSON.parse(l.ultimas),
});

function salvar(l: Linha, e: Estado) {
  db.prepare(
    `UPDATE goticas SET nivel = ?, xp = ?, barriga = ?, humor = ?, energia = ?, atualizado_em = ?, ultimas = ?
     WHERE guild_id = ? AND user_id = ?`,
  ).run(e.nivel, e.xp, e.barriga, e.humor, e.energia, e.atualizadoEm, JSON.stringify(e.ultimas), l.guild_id, l.user_id);
}

/** Embed com o retrato (PNG gerado na hora) e, para a dona, os botões de cuidar. */
function cartao(l: Linha, e: Estado, extra?: string) {
  const s = statusAgora(e, Date.now());
  const humor = humorDe(s);
  const svg = desenharGotica(JSON.parse(l.aparencia) as Aparencia, e.nivel, humor);
  const imagem = new AttachmentBuilder(new Resvg(svg).render().asPng(), { name: 'gotica.png' });
  const proximo = DESBLOQUEIOS.find((d) => d.nivel > e.nivel);

  const embed = new EmbedBuilder()
    .setColor(COR[humor])
    .setTitle(`🦇 ${l.nome} · nível ${e.nivel}`)
    .setDescription(
      [
        extra,
        `De <@${l.user_id}> · ${l.personalidade}, ${ROSTO[humor]}`,
        '',
        `🍰 Barriga  ${barra(s.barriga)}`,
        `🖤 Humor    ${barra(s.humor)}`,
        `⚡ Energia  ${barra(s.energia)}`,
        `✨ XP ${e.xp}/${xpParaProximo(e.nivel)}`,
      ].filter((x) => x !== undefined).join('\n'),
    )
    .setImage('attachment://gotica.png')
    .setFooter({ text: proximo ? `Nível ${proximo.nivel} desbloqueia ${proximo.texto}` : 'Todos os acessórios desbloqueados 🦇' });

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    (Object.keys(ACOES) as Acao[]).map((a) =>
      new ButtonBuilder().setCustomId(`gotica:${a}:${l.user_id}`).setLabel(ACOES[a].rotulo).setEmoji(ACOES[a].emoji).setStyle(ButtonStyle.Secondary),
    ),
  );
  return { embeds: [embed], files: [imagem], components: [botoes], allowedMentions: { parse: [] } };
}

export const gotica: Comando = {
  data: new SlashCommandBuilder()
    .setName('gotica')
    .setDescription('Sua gótica de estimação: cuide dela para subir de nível')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s.setName('adotar').setDescription('Adota uma gótica com aparência e personalidade sorteadas')
        .addStringOption((o) => o.setName('nome').setDescription('Como ela vai se chamar').setRequired(true).setMaxLength(32)),
    )
    .addSubcommand((s) =>
      s.setName('ver').setDescription('Mostra a sua gótica (ou a de alguém) e os botões de cuidar')
        .addUserOption((o) => o.setName('membro').setDescription('De quem (padrão: você)')),
    )
    .addSubcommand((s) =>
      s.setName('renomear').setDescription('Muda o nome da sua gótica')
        .addStringOption((o) => o.setName('nome').setDescription('Novo nome').setRequired(true).setMaxLength(32)),
    )
    .addSubcommand((s) =>
      s.setName('visual').setDescription('Sorteia de novo a aparência dela (nome, nível e XP continuam)')
        .addBooleanOption((o) => o.setName('personalidade').setDescription('Sortear a personalidade também')),
    )
    .addSubcommand((s) => s.setName('ranking').setDescription('As góticas mais bem cuidadas do servidor')),

  async executar(i) {
    const g = i.guildId!;
    const sub = i.options.getSubcommand();

    if (sub === 'adotar') {
      const existente = ler(g, i.user.id);
      if (existente) return i.reply({ content: `Você já cuida da **${existente.nome}**. Uma gótica por pessoa, ela é ciumenta.`, flags: MessageFlags.Ephemeral });
      const agora = Date.now();
      const personalidade = sortearPersonalidade();
      db.prepare(
        `INSERT INTO goticas (guild_id, user_id, nome, aparencia, personalidade, barriga, humor, energia, atualizado_em, criada_em)
         VALUES (?, ?, ?, ?, ?, 70, 70, 80, ?, ?)`,
      ).run(g, i.user.id, i.options.getString('nome', true).trim(), JSON.stringify(sortearAparencia()), personalidade, agora, agora);
      const l = ler(g, i.user.id)!;
      // Gerar a imagem leva ~0,5 s: responde "pensando" antes para não estourar os 3 s do Discord.
      await i.deferReply();
      return i.editReply(cartao(l, estadoDe(l), `🖤 **Essa é a sua gótica, ${l.nome}!** Ela é ${personalidade} e gosta de ${gostoDe(personalidade)}. Cuide dela pelos botões abaixo para ela subir de nível e ganhar acessórios.\n`));
    }

    if (sub === 'ver') {
      const dono = i.options.getUser('membro') ?? i.user;
      const l = ler(g, dono.id);
      if (!l) return i.reply({ content: dono.id === i.user.id ? SEM_GOTICA : `${dono.username} ainda não adotou uma gótica.`, flags: MessageFlags.Ephemeral });
      await i.deferReply();
      return i.editReply(cartao(l, estadoDe(l)));
    }

    if (sub === 'visual') {
      const l = ler(g, i.user.id);
      if (!l) return i.reply({ content: SEM_GOTICA, flags: MessageFlags.Ephemeral });
      // Sorteia até sair diferente da atual, pra o botão nunca "não fazer nada".
      let aparencia = JSON.stringify(sortearAparencia());
      while (aparencia === l.aparencia) aparencia = JSON.stringify(sortearAparencia());
      let personalidade = l.personalidade;
      if (i.options.getBoolean('personalidade')) {
        while (personalidade === l.personalidade) personalidade = sortearPersonalidade();
      }
      db.prepare('UPDATE goticas SET aparencia = ?, personalidade = ? WHERE guild_id = ? AND user_id = ?').run(aparencia, personalidade, g, i.user.id);
      const nova = { ...l, aparencia, personalidade };
      const mudouJeito = personalidade !== l.personalidade ? ` E voltou ${personalidade}, agora gosta de ${gostoDe(personalidade)}.` : '';
      await i.deferReply();
      return i.editReply(cartao(nova, estadoDe(nova), `💄 **${l.nome}** passou a madrugada no espelho e voltou com um visual novo!${mudouJeito}\n`));
    }

    if (sub === 'renomear') {
      const l = ler(g, i.user.id);
      if (!l) return i.reply({ content: SEM_GOTICA, flags: MessageFlags.Ephemeral });
      const nome = i.options.getString('nome', true).trim();
      db.prepare('UPDATE goticas SET nome = ? WHERE guild_id = ? AND user_id = ?').run(nome, g, i.user.id);
      return i.reply({ content: `🦇 A **${l.nome}** agora atende por **${nome}**. Ela fingiu que não ligou, mas gostou.`, allowedMentions: { parse: [] } });
    }

    const top = db.prepare('SELECT * FROM goticas WHERE guild_id = ? ORDER BY nivel DESC, xp DESC LIMIT 10').all(g) as Linha[];
    if (!top.length) return i.reply({ content: 'Ninguém adotou uma gótica ainda. Seja a primeira pessoa: `/gotica adotar`.', flags: MessageFlags.Ephemeral });
    const medalhas = ['🥇', '🥈', '🥉'];
    const embed = new EmbedBuilder()
      .setColor(COR.feliz)
      .setTitle('🦇 Ranking das góticas')
      .setDescription(top.map((l, k) => `${medalhas[k] ?? `**${k + 1}.**`} **${l.nome}** · nível ${l.nivel} · de <@${l.user_id}>`).join('\n'));
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

export const botaoGotica: HandlerBotao = {
  prefixo: 'gotica',
  async executar(i, argumento) {
    const [acao, donoId] = argumento.split(':') as [Acao, string];
    if (!(acao in ACOES)) return i.deferUpdate();
    if (i.user.id !== donoId) {
      return i.reply({ content: 'Essa gótica não é sua. Adote a sua com `/gotica adotar`.', flags: MessageFlags.Ephemeral });
    }
    const l = ler(i.guildId!, donoId);
    if (!l) return i.reply({ content: SEM_GOTICA, flags: MessageFlags.Ephemeral });

    const r = aplicarAcao(estadoDe(l), acao, Date.now());
    if (!r.ok) {
      const quando = r.liberaEm ? `Ela acabou de fazer isso. Tente de novo <t:${Math.ceil(r.liberaEm / 1000)}:R>.` : r.motivo;
      return i.reply({ content: `🦇 ${quando}`, flags: MessageFlags.Ephemeral });
    }
    salvar(l, r.estado);

    const linhas = [`${ACOES[acao].emoji} **${l.nome}** ${r.fala}. (+${r.xpGanho} XP)`];
    for (const n of r.subiu) {
      const ganhou = DESBLOQUEIOS.find((d) => d.nivel === n);
      linhas.push(`🎉 **Subiu para o nível ${n}!**${ganhou ? ` Ganhou ${ganhou.texto}.` : ''}`);
    }
    await i.deferUpdate();
    return i.editReply({ ...cartao(l, r.estado, linhas.join('\n') + '\n'), attachments: [] });
  },
};
