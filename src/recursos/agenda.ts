import {
  ChannelType,
  EmbedBuilder,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type Client,
  type GuildMember,
} from 'discord.js';
import { CANAIS, CARGOS, NOME_SERVIDOR } from '../config.ts';
import { db } from '../db.ts';
import { canalTexto, cargoPorNome, ehAdmin } from '../lib/servidor.ts';
import {
  dataValida,
  ehBissexto,
  interpretarDataHora,
  interpretarDuracao,
  partesBrasilia,
  tsCompleto,
  tsRelativo,
} from '../lib/tempo.ts';
import type { Comando } from '../tipos.ts';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const HORA_PARABENS = 9; // horário de Brasília

// ---------- /sessao: marca a próxima sessão de RPG como evento do Discord ----------

export const sessao: Comando = {
  data: new SlashCommandBuilder()
    .setName('sessao')
    .setDescription('Sessões de RPG: marcar (vira evento do Discord) e ver as próximas')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('marcar')
        .setDescription('Marca uma sessão e avisa os Aventureiros (Mestre ou admin)')
        .addStringOption((o) => o.setName('data').setDescription('Ex.: 25/10 ou 25/10/2026').setRequired(true).setMaxLength(10))
        .addStringOption((o) => o.setName('hora').setDescription('Ex.: 20h, 20:30').setRequired(true).setMaxLength(5))
        .addStringOption((o) => o.setName('titulo').setDescription('Ex.: Sessão 12 · A Cripta do Lich').setMaxLength(100))
        .addStringOption((o) => o.setName('descricao').setDescription('Resumo, o que levar, recado do Mestre').setMaxLength(500))
        .addIntegerOption((o) => o.setName('duracao').setDescription('Em horas (padrão: 4)').setMinValue(1).setMaxValue(12)),
    )
    .addSubcommand((s) => s.setName('proximas').setDescription('Lista as próximas sessões e eventos do servidor')),

  async executar(i) {
    const guild = i.guild!;

    if (i.options.getSubcommand() === 'proximas') {
      const eventos = [...(await guild.scheduledEvents.fetch()).values()]
        .filter((e) => e.status === GuildScheduledEventStatus.Scheduled || e.status === GuildScheduledEventStatus.Active)
        .sort((a, b) => (a.scheduledStartTimestamp ?? 0) - (b.scheduledStartTimestamp ?? 0))
        .slice(0, 10);
      if (!eventos.length) return i.reply({ content: 'Nenhuma sessão marcada. O Mestre pode usar `/sessao marcar`.', flags: MessageFlags.Ephemeral });
      const embed = new EmbedBuilder()
        .setColor(CARGOS.mestre.cor)
        .setTitle('📅 Próximas sessões e eventos')
        .setDescription(
          eventos
            .map((e) => {
              const ms = e.scheduledStartTimestamp ?? 0;
              const ativo = e.status === GuildScheduledEventStatus.Active ? ' · 🔴 rolando agora' : '';
              return `**[${e.name}](${e.url})**\n${tsCompleto(ms)} (${tsRelativo(ms)})${ativo} · ${e.userCount ?? 0} interessado(s)`;
            })
            .join('\n\n'),
        );
      return i.reply({ embeds: [embed] });
    }

    const membro = i.member as GuildMember;
    if (!membro.roles.cache.some((r) => r.name === CARGOS.mestre.nome) && !ehAdmin(guild, i.user.id)) {
      return i.reply({ content: `Só quem tem o cargo **${CARGOS.mestre.nome}** marca sessões.`, flags: MessageFlags.Ephemeral });
    }

    const inicio = interpretarDataHora(i.options.getString('data', true), i.options.getString('hora', true));
    if (!inicio) return i.reply({ content: 'Não entendi a data ou a hora. Use, por exemplo, `data:25/10 hora:20h`.', flags: MessageFlags.Ephemeral });
    if (inicio.getTime() < Date.now() + 60_000) return i.reply({ content: 'Essa data já passou.', flags: MessageFlags.Ephemeral });

    const titulo = i.options.getString('titulo') ?? 'Sessão de D&D';
    const descricao = i.options.getString('descricao') ?? undefined;
    const fim = new Date(inicio.getTime() + (i.options.getInteger('duracao') ?? 4) * 3_600_000);
    const mesa = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice && c.name === CANAIS.mesaRpg);

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const evento = await guild.scheduledEvents.create({
      name: titulo,
      description: descricao,
      scheduledStartTime: inicio,
      scheduledEndTime: fim,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      ...(mesa
        ? { entityType: GuildScheduledEventEntityType.Voice, channel: mesa.id }
        : { entityType: GuildScheduledEventEntityType.External, entityMetadata: { location: NOME_SERVIDOR } }),
    });

    const aventureiro = cargoPorNome(guild, CARGOS.aventureiro.nome);
    const avisos = canalTexto(guild, CANAIS.avisosRpg);
    if (avisos) {
      const embed = new EmbedBuilder()
        .setColor(CARGOS.mestre.cor)
        .setAuthor({ name: `${membro.displayName} marcou a próxima sessão`, iconURL: membro.displayAvatarURL() })
        .setTitle(`🐉 ${titulo}`)
        .setURL(evento.url)
        .setDescription(
          [
            `📅 ${tsCompleto(inicio.getTime())} (${tsRelativo(inicio.getTime())})`,
            mesa ? `🔊 ${mesa}` : null,
            descricao ? `\n> ${descricao}` : null,
            '\nClique no título e marque **Interessado** para o Discord te lembrar na hora.',
          ]
            .filter(Boolean)
            .join('\n'),
        );
      await avisos.send({
        content: aventureiro ? `${aventureiro}` : undefined,
        embeds: [embed],
        allowedMentions: { roles: aventureiro ? [aventureiro.id] : [] },
      });
    }

    return i.editReply(`✅ Sessão marcada: ${evento.url}${avisos ? `\nAvisei em ${avisos}.` : ''}`);
  },
};

// ---------- /lembrete ----------

type Lembrete = { id: number; guild_id: string; canal_id: string; user_id: string; quando: number; texto: string };
const MAX_LEMBRETES = 10;
const MAX_ESPERA = 30 * 86_400_000;

export const lembrete: Comando = {
  data: new SlashCommandBuilder()
    .setName('lembrete')
    .setDescription('O bot te lembra de algo depois de um tempo')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('criar')
        .setDescription('Cria um lembrete neste canal')
        .addStringOption((o) => o.setName('tempo').setDescription('Daqui a quanto tempo. Ex.: 30m, 2h, 1h30m, 3d').setRequired(true).setMaxLength(20))
        .addStringOption((o) => o.setName('texto').setDescription('Do que lembrar').setRequired(true).setMaxLength(300)),
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Mostra os seus lembretes ativos'))
    .addSubcommand((s) =>
      s
        .setName('apagar')
        .setDescription('Apaga um lembrete seu')
        .addIntegerOption((o) => o.setName('numero').setDescription('Número que aparece em /lembrete lista').setRequired(true).setMinValue(1)),
    ),

  async executar(i) {
    const guild = i.guild!.id;
    const sub = i.options.getSubcommand();

    if (sub === 'lista') {
      const meus = db
        .prepare('SELECT * FROM lembretes WHERE guild_id = ? AND user_id = ? ORDER BY quando')
        .all(guild, i.user.id) as Lembrete[];
      if (!meus.length) return i.reply({ content: 'Você não tem lembretes ativos.', flags: MessageFlags.Ephemeral });
      const linhas = meus.map((l) => `**#${l.id}** · ${tsRelativo(l.quando)} em <#${l.canal_id}>\n> ${l.texto}`);
      return i.reply({ content: `⏰ **Seus lembretes**\n\n${linhas.join('\n')}`.slice(0, 1900), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'apagar') {
      const r = db
        .prepare('DELETE FROM lembretes WHERE id = ? AND guild_id = ? AND user_id = ?')
        .run(i.options.getInteger('numero', true), guild, i.user.id);
      return i.reply({ content: r.changes ? '🗑️ Lembrete apagado.' : 'Não achei esse lembrete entre os seus.', flags: MessageFlags.Ephemeral });
    }

    const espera = interpretarDuracao(i.options.getString('tempo', true));
    if (!espera || espera < 60_000 || espera > MAX_ESPERA) {
      return i.reply({ content: 'Use um tempo entre 1 minuto e 30 dias, como `30m`, `2h`, `1h30m` ou `3d`.', flags: MessageFlags.Ephemeral });
    }
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM lembretes WHERE guild_id = ? AND user_id = ?').get(guild, i.user.id) as { n: number };
    if (n >= MAX_LEMBRETES) return i.reply({ content: `Você já tem ${MAX_LEMBRETES} lembretes. Apague algum com \`/lembrete apagar\`.`, flags: MessageFlags.Ephemeral });

    const quando = Date.now() + espera;
    const texto = i.options.getString('texto', true);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO lembretes (guild_id, canal_id, user_id, quando, texto) VALUES (?, ?, ?, ?, ?)')
      .run(guild, i.channelId, i.user.id, quando, texto);
    return i.reply({ content: `⏰ Combinado! Te lembro ${tsRelativo(quando)} (lembrete #${lastInsertRowid}).`, flags: MessageFlags.Ephemeral });
  },
};

async function entregarLembretes(client: Client) {
  const vencidos = db.prepare('SELECT * FROM lembretes WHERE quando <= ?').all(Date.now()) as Lembrete[];
  for (const l of vencidos) {
    // Apaga antes de enviar: se o canal sumiu, o lembrete não fica tentando para sempre.
    db.prepare('DELETE FROM lembretes WHERE id = ?').run(l.id);
    const mensagem = { content: `⏰ <@${l.user_id}>, lembrete: **${l.texto}**`, allowedMentions: { users: [l.user_id] } };
    const canal = await client.channels.fetch(l.canal_id).catch(() => null);
    if (canal?.isSendable()) {
      await canal.send(mensagem).catch(() => {});
    } else {
      const usuario = await client.users.fetch(l.user_id).catch(() => null);
      await usuario?.send(mensagem).catch(() => {});
    }
  }
}

// ---------- /aniversario ----------

type Aniversario = { guild_id: string; user_id: string; dia: number; mes: number; ultimo_ano_avisado: number };

// Dias até o próximo aniversário (0 = hoje), contando a partir de hoje em Brasília.
function diasAte(dia: number, mes: number) {
  const hoje = partesBrasilia(new Date());
  const base = Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia);
  let alvo = Date.UTC(hoje.ano, mes - 1, dia);
  if (alvo < base) alvo = Date.UTC(hoje.ano + 1, mes - 1, dia);
  return Math.round((alvo - base) / 86_400_000);
}

const formatarData = (dia: number, mes: number) => `${dia} de ${MESES[mes - 1]}`;

export const aniversario: Comando = {
  data: new SlashCommandBuilder()
    .setName('aniversario')
    .setDescription('Aniversários da galera: o bot dá parabéns no dia')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('definir')
        .setDescription('Salva o seu aniversário')
        .addIntegerOption((o) => o.setName('dia').setDescription('Dia').setRequired(true).setMinValue(1).setMaxValue(31))
        .addIntegerOption((o) =>
          o
            .setName('mes')
            .setDescription('Mês')
            .setRequired(true)
            .addChoices(...MESES.map((m, n) => ({ name: m, value: n + 1 }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('ver')
        .setDescription('Mostra o aniversário de alguém')
        .addUserOption((o) => o.setName('membro').setDescription('Quem (padrão: você)')),
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Próximos aniversários do servidor'))
    .addSubcommand((s) => s.setName('remover').setDescription('Apaga o seu aniversário')),

  async executar(i) {
    const guild = i.guild!.id;
    const sub = i.options.getSubcommand();

    if (sub === 'definir') {
      const dia = i.options.getInteger('dia', true);
      const mes = i.options.getInteger('mes', true);
      if (!dataValida(dia, mes)) return i.reply({ content: `${dia}/${mes} não existe 🤔`, flags: MessageFlags.Ephemeral });
      // Se já passou do horário de hoje, não avisa de novo neste ano.
      const hoje = partesBrasilia(new Date());
      const jaAvisado = hoje.dia === dia && hoje.mes === mes && hoje.hora >= HORA_PARABENS ? hoje.ano : 0;
      db.prepare(
        `INSERT INTO aniversarios (guild_id, user_id, dia, mes, ultimo_ano_avisado) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET dia = excluded.dia, mes = excluded.mes, ultimo_ano_avisado = excluded.ultimo_ano_avisado`,
      ).run(guild, i.user.id, dia, mes, jaAvisado);
      return i.reply({ content: `🎂 Anotado: **${formatarData(dia, mes)}**. No dia eu chamo a galera para te dar parabéns!`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'remover') {
      const r = db.prepare('DELETE FROM aniversarios WHERE guild_id = ? AND user_id = ?').run(guild, i.user.id);
      return i.reply({ content: r.changes ? 'Aniversário apagado.' : 'Você não tinha aniversário salvo.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'ver') {
      const alvo = i.options.getUser('membro') ?? i.user;
      const a = db.prepare('SELECT * FROM aniversarios WHERE guild_id = ? AND user_id = ?').get(guild, alvo.id) as Aniversario | undefined;
      if (!a) {
        const dica = alvo.id === i.user.id ? ' Use `/aniversario definir`.' : '';
        return i.reply({ content: `Não sei o aniversário de ${alvo}.${dica}`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      }
      const dias = diasAte(a.dia, a.mes);
      const falta = dias === 0 ? '**é hoje!** 🎉' : `faltam ${dias} dia(s)`;
      return i.reply({ content: `🎂 ${alvo} faz aniversário em **${formatarData(a.dia, a.mes)}** · ${falta}`, allowedMentions: { parse: [] } });
    }

    const todos = db.prepare('SELECT * FROM aniversarios WHERE guild_id = ?').all(guild) as Aniversario[];
    if (!todos.length) return i.reply({ content: 'Ninguém salvou o aniversário ainda. Use `/aniversario definir`.', flags: MessageFlags.Ephemeral });
    const proximos = todos
      .map((a) => ({ ...a, dias: diasAte(a.dia, a.mes) }))
      .sort((a, b) => a.dias - b.dias)
      .slice(0, 15);
    const embed = new EmbedBuilder()
      .setColor(0xff73fa)
      .setTitle('🎂 Próximos aniversários')
      .setDescription(
        proximos
          .map((a) => `**${formatarData(a.dia, a.mes)}** · <@${a.user_id}> · ${a.dias === 0 ? 'hoje! 🎉' : `em ${a.dias} dia(s)`}`)
          .join('\n'),
      );
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

const PARABENS = [
  'mais um ano de maluquice completo!',
  'a taverna inteira levanta a caneca por você! 🍻',
  'rolou um 20 natural na vida hoje.',
  'subiu de nível! +1 em tudo.',
];

async function darParabens(client: Client) {
  const agora = partesBrasilia(new Date());
  if (agora.hora < HORA_PARABENS) return;
  // Quem nasceu em 29/02 comemora no dia 28 nos anos que não são bissextos.
  const pendentes = db
    .prepare(
      `SELECT * FROM aniversarios WHERE ultimo_ano_avisado < ? AND mes = ? AND (dia = ? OR (? AND dia = 29 AND mes = 2))`,
    )
    .all(agora.ano, agora.mes, agora.dia, agora.mes === 2 && agora.dia === 28 && !ehBissexto(agora.ano) ? 1 : 0) as Aniversario[];

  for (const a of pendentes) {
    db.prepare('UPDATE aniversarios SET ultimo_ano_avisado = ? WHERE guild_id = ? AND user_id = ?').run(agora.ano, a.guild_id, a.user_id);
    const guild = client.guilds.cache.get(a.guild_id);
    const membro = await guild?.members.fetch(a.user_id).catch(() => null);
    const canal = guild && canalTexto(guild, CANAIS.geral);
    if (!membro || !canal) continue;
    const embed = new EmbedBuilder()
      .setColor(0xff73fa)
      .setTitle(`🎂 Feliz aniversário, ${membro.displayName}!`)
      .setDescription(`${membro}, ${PARABENS[Math.floor(Math.random() * PARABENS.length)]}\n\nDeixem os parabéns aí embaixo! 🎉`)
      .setThumbnail(membro.displayAvatarURL({ size: 256 }));
    await canal.send({ content: `🎉 @here hoje é aniversário do(a) ${membro}!`, embeds: [embed], allowedMentions: { parse: ['everyone'], users: [membro.id] } }).catch(() => {});
  }
}

// ---------- Relógio da agenda ----------

export function iniciarAgenda(client: Client) {
  const passo = () =>
    Promise.all([entregarLembretes(client), darParabens(client)]).catch((e) => console.error('[agenda]', e));
  void passo();
  setInterval(passo, 30_000);
}
