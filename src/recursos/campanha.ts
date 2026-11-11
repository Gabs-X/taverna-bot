import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type GuildScheduledEventEditOptions,
  type SlashCommandStringOption,
  type Guild,
  type GuildMember,
  type OverwriteResolvable,
} from 'discord.js';
import { db } from '../db.ts';
import { CANAIS, NOME_SERVIDOR } from '../config.ts';
import { encerrarSalas } from '../lib/campanhaSessao.ts';
import { DURACAO_CONVITE, registroDaSessao, type LinhaChat } from '../lib/mapa.ts';
import { canalPorNome, canalTexto, ehMestre } from '../lib/servidor.ts';
import { interpretarDataHora, tsCompleto, tsRelativo } from '../lib/tempo.ts';
import { duracaoTexto } from '../lib/tela.ts';
import type { Comando } from '../tipos.ts';
import { apagarMapa, avisarMapa, liberarBardos, linkDoMapa, mapaPublico } from './mapa.ts';

// Campanhas: um mestre cria a mesa, escolhe o sistema e adiciona os jogadores. Cada personagem é a ficha do
// jogador no sistema da campanha: ele cria no próprio mapa (com foto) ou pelo /dh ficha criar e /ficha criar.
// O /sessao mapa leva cada um para o mapa da mesa (servidor em mapa.ts), com link pessoal: é ele que diz ao site
// quem é cada jogador. No mapa fica o chat da mesa com as rolagens de todos (e as escondidas do mestre).

export type Sistema = 'dh' | 'dnd';
export const SISTEMAS: Record<Sistema, { nome: string; tabela: string; emoji: string; voz: string; avisos: string }> = {
  dh: { nome: 'Daggerheart', tabela: 'fichas_dh', emoji: '🌗', voz: CANAIS.mesaDh, avisos: CANAIS.avisosDh },
  dnd: { nome: 'D&D 3.5', tabela: 'fichas', emoji: '🐉', voz: CANAIS.mesaRpg, avisos: CANAIS.avisosRpg },
};
const COR = 0x8e44ad;
const finalizando = new Set<number>();

export type Campanha = {
  id: number;
  guild_id: string;
  nome: string;
  sistema: Sistema;
  mestre_id: string;
  criada_em: number;
  canal_id: string | null;
  canal_voz_id: string | null;
  canal_resumos_id: string | null;
  canal_sessao_id: string | null;
  sessao_inicio: number | null;
  evento_id: string | null;
  evento_inicio: number | null;
};
type FichaResumo = { nome: string; classe: string; nivel: number };

export const porNome = (g: string, nome: string) =>
  db.prepare('SELECT * FROM campanhas WHERE guild_id = ? AND nome = ? COLLATE NOCASE').get(g, nome) as Campanha | undefined;
export const porId = (id: number) => db.prepare('SELECT * FROM campanhas WHERE id = ?').get(id) as Campanha | undefined;
export const personagens = (campanhaId: number) =>
  (db.prepare('SELECT user_id FROM campanha_personagens WHERE campanha_id = ? ORDER BY rowid').all(campanhaId) as { user_id: string }[]).map((r) => r.user_id);
export const fichaDe = (sistema: Sistema, g: string, u: string) =>
  db.prepare(`SELECT nome, classe, nivel FROM ${SISTEMAS[sistema].tabela} WHERE guild_id = ? AND user_id = ?`).get(g, u) as FichaResumo | undefined;

// Só o mestre da campanha (quem criou) ou um mestre/admin do servidor mexe nela.
const podeMexer = (i: ChatInputCommandInteraction, c: Campanha) => c.mestre_id === i.user.id || ehMestre(i.member as GuildMember);

const SEM_CAMPANHA = (nome: string) => `Não achei a campanha **${nome}**. Veja as campanhas com \`/campanha ver\`.`;

/** Campanhas em que a pessoa é mestre ou joga. */
const minhasCampanhas = (g: string, u: string) =>
  db.prepare(`SELECT * FROM campanhas WHERE guild_id = ? AND (mestre_id = ? OR id IN (SELECT campanha_id FROM campanha_personagens WHERE user_id = ?)) ORDER BY nome`)
    .all(g, u, u) as Campanha[];

/** A campanha do comando: a escolhida no campo ou, se ficou em branco, a única da pessoa (ou a única com sessão aberta). */
export function campanhaDaVez(i: ChatInputCommandInteraction): Campanha | string {
  const g = i.guildId!, nome = i.options.getString('campanha');
  if (nome) return porNome(g, nome) ?? SEM_CAMPANHA(nome);
  const minhas = minhasCampanhas(g, i.user.id);
  if (minhas.length === 1) return minhas[0];
  const abertas = minhas.filter((c) => c.sessao_inicio);
  if (abertas.length === 1) return abertas[0];
  if (!minhas.length) return 'Você não está em nenhuma campanha. O mestre te coloca na mesa com `/campanha adicionar`.';
  return `Você está em mais de uma campanha (${minhas.map((c) => `**${c.nome}**`).join(', ')}): escolha uma no campo \`campanha\`.`;
}

/** Autocompletar do campo campanha: as da pessoa primeiro (com a sessão aberta marcada), depois as outras. */
async function autocompletarCampanha(i: AutocompleteInteraction) {
  const digitado = i.options.getFocused().toLowerCase();
  const minhas = new Set(minhasCampanhas(i.guildId!, i.user.id).map((c) => c.id));
  const todas = db.prepare('SELECT id, nome, sessao_inicio FROM campanhas WHERE guild_id = ? ORDER BY nome LIMIT 100').all(i.guildId!) as Pick<Campanha, 'id' | 'nome' | 'sessao_inicio'>[];
  const opcoes = todas
    .filter((c) => c.nome.toLowerCase().includes(digitado))
    .sort((a, b) => Number(minhas.has(b.id)) - Number(minhas.has(a.id)))
    .slice(0, 25)
    .map((c) => ({ name: `${c.nome}${c.sessao_inicio ? ' · 🔴 sessão aberta' : ''}`, value: c.nome }));
  return i.respond(opcoes);
}
const SEM_PERMISSAO = { content: 'Só o mestre da campanha (ou um mestre do servidor) mexe nela.', flags: MessageFlags.Ephemeral as const };

function embedCampanha(c: Campanha, g: string) {
  const linhas = personagens(c.id).map((u) => {
    const f = fichaDe(c.sistema, g, u);
    return f ? `**${f.nome}** · ${f.classe} nível ${f.nivel} · <@${u}>` : `_personagem ainda não criado (no mapa)_ · <@${u}>`;
  });
  return new EmbedBuilder()
    .setColor(COR)
    .setTitle(`🐉 ${c.nome}`)
    .setDescription(
      [
        `Sistema: **${SISTEMAS[c.sistema].nome}** · Mestre: <@${c.mestre_id}>`,
        c.sessao_inicio ? `🔴 Sessão aberta ${tsRelativo(c.sessao_inicio)} · \`/sessao mapa\` para entrar` : null,
        c.evento_inicio && c.evento_inicio > Date.now() ? `📅 Próxima sessão: ${tsCompleto(c.evento_inicio)} (${tsRelativo(c.evento_inicio)})` : null,
      ].filter(Boolean).join('\n'),
    )
    .addFields({ name: `Personagens (${linhas.length})`, value: linhas.length ? linhas.join('\n') : '_nenhum ainda: use `/campanha adicionar`_' });
}

// ---------- Canais da campanha (criados pelo /sessao iniciar) ----------

const nomeDeCanal = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'campanha';

// O Discord responde "Unknown Channel" (10003) para canal apagado à mão: vira null. Outros erros (rede, permissão) sobem.
const CANAL_INEXISTENTE = 10003;
const semCanal = (erro: unknown) => (erro as { code?: unknown })?.code === CANAL_INEXISTENTE;
async function buscarCanal(guild: Guild, id: string | null) {
  if (!id) return null;
  try {
    return await guild.channels.fetch(id);
  } catch (erro) {
    if (semCanal(erro)) return null;
    throw erro;
  }
}

/**
 * Garante o canal de texto e a call da campanha, só para o mestre e os jogadores (o resto do servidor não vê).
 * Se já existem (de uma sessão anterior), só confere quem tem acesso. O canal de texto vira o canal ligado ao chat do mapa.
 */
const topicoDaMesa = (c: Campanha, comando: string) =>
  `Campanha ${c.nome} (${SISTEMAS[c.sistema].nome}): o que se escreve aqui aparece no chat do mapa e vice-versa. ${comando} abre o mapa.`;

async function prepararCanais(guild: Guild, c: Campanha, jogadores: string[]) {
  const { ViewChannel, SendMessages, ReadMessageHistory, Connect, Speak, ManageChannels } = PermissionFlagsBits;
  const eu = guild.members.me;
  if (!eu) throw new Error('bot fora do servidor');
  // Quem saiu do servidor não pode entrar nas permissões.
  const gente = (
    await Promise.all([...new Set([c.mestre_id, ...jogadores])].map((id) => guild.members.fetch(id).then(() => id).catch(() => null)))
  ).filter((id): id is string => !!id);

  const regras = (permitido: bigint[]): OverwriteResolvable[] => [
    { id: guild.roles.everyone.id, deny: [ViewChannel] },
    { id: eu.id, allow: [ViewChannel, SendMessages, ReadMessageHistory, Connect, Speak, ManageChannels] },
    ...gente.map((id) => ({ id, allow: permitido })),
  ];
  const pai = canalTexto(guild, c.sistema === 'dh' ? CANAIS.mesaDhTexto : CANAIS.mesaRpgTexto)?.parentId ?? undefined;
  const nome = nomeDeCanal(c.nome);
  const novos: string[] = [];

  let texto = c.canal_id ? await guild.channels.fetch(c.canal_id).catch(() => null) : null;
  if (texto?.type !== ChannelType.GuildText) {
    texto = await guild.channels.create({
      name: `🗺️・${nome}`,
      type: ChannelType.GuildText,
      parent: pai,
      topic: topicoDaMesa(c, '/sessao mapa'),
      permissionOverwrites: regras([ViewChannel, SendMessages, ReadMessageHistory]),
      reason: `/sessao iniciar ${c.nome}`,
    });
    novos.push('texto');
    db.prepare('UPDATE campanhas SET canal_sessao_id = ? WHERE id = ?').run(texto.id, c.id);
  } else {
    for (const id of gente) await texto.permissionOverwrites.edit(id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
  }

  let voz = c.canal_voz_id ? await guild.channels.fetch(c.canal_voz_id).catch(() => null) : null;
  if (voz?.type !== ChannelType.GuildVoice) {
    voz = await guild.channels.create({
      name: `🔊・${nome}`,
      type: ChannelType.GuildVoice,
      parent: pai,
      permissionOverwrites: regras([ViewChannel, Connect, Speak]),
      reason: `/sessao iniciar ${c.nome}`,
    });
    novos.push('call');
  } else {
    for (const id of gente) await voz.permissionOverwrites.edit(id, { ViewChannel: true, Connect: true, Speak: true }).catch(() => {});
  }

  db.prepare('UPDATE campanhas SET canal_id = ?, canal_voz_id = ? WHERE id = ?').run(texto.id, voz.id, c.id);
  // Os bardos (contas de música do PC de casa) precisam entrar na call privada para tocar a trilha da mesa.
  await liberarBardos({ voz: voz.id, texto: texto.id });
  return { texto, voz, novos };
}

async function prepararResumos(guild: Guild, c: Campanha) {
  const { ViewChannel, SendMessages, ReadMessageHistory, AttachFiles, EmbedLinks, ManageChannels } = PermissionFlagsBits;
  const eu = guild.members.me;
  if (!eu) throw new Error('bot fora do servidor');
  const gente = (await Promise.all([...new Set([c.mestre_id, ...personagens(c.id)])]
    .map((id) => guild.members.fetch(id).then(() => id).catch(() => null))))
    .filter((id): id is string => !!id);
  const regras: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [ViewChannel] },
    { id: eu.id, allow: [ViewChannel, SendMessages, ReadMessageHistory, AttachFiles, EmbedLinks, ManageChannels] },
    ...gente.map((id) => ({ id, allow: [ViewChannel, ReadMessageHistory] })),
  ];
  const existente = await buscarCanal(guild, c.canal_resumos_id);
  if (existente?.type === ChannelType.GuildText) {
    await existente.permissionOverwrites.set(regras);
    return existente;
  }
  const canal = await guild.channels.create({
    name: `📜・resumos-${nomeDeCanal(c.nome)}`,
    type: ChannelType.GuildText,
    parent: canalTexto(guild, c.sistema === 'dh' ? CANAIS.mesaDhTexto : CANAIS.mesaRpgTexto)?.parentId ?? undefined,
    topic: `Resumos e registros das sessões de ${c.nome}. Este canal é preservado ao finalizar a sessão.`,
    permissionOverwrites: regras,
    reason: `/sessao finalizar ${c.nome}: arquivo de sessões`,
  });
  db.prepare('UPDATE campanhas SET canal_resumos_id = ? WHERE id = ?').run(canal.id, c.id);
  return canal;
}

export const campanha: Comando = {
  data: new SlashCommandBuilder()
    .setName('campanha')
    .setDescription('Campanhas de RPG: monte a mesa (criar, jogadores, mestre). A sessão em si fica no /sessao')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('criar')
        .setDescription('Cria uma campanha (só Mestre)')
        .addStringOption((o) => o.setName('nome').setDescription('Nome da campanha').setRequired(true).setMaxLength(50))
        .addStringOption((o) =>
          o.setName('sistema').setDescription('Sistema de jogo').setRequired(true).addChoices({ name: 'Daggerheart', value: 'dh' }, { name: 'D&D 3.5', value: 'dnd' }),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('adicionar')
        .setDescription('Adiciona um jogador à mesa (ele cria o personagem no mapa)')
        .addStringOption((o) => o.setName('campanha').setDescription('Campanha').setRequired(true).setAutocomplete(true))
        .addUserOption((o) => o.setName('jogador').setDescription('Quem joga o personagem').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('remover')
        .setDescription('Tira um personagem da campanha (a ficha continua salva)')
        .addStringOption((o) => o.setName('campanha').setDescription('Campanha').setRequired(true).setAutocomplete(true))
        .addUserOption((o) => o.setName('jogador').setDescription('Quem joga o personagem').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('ver')
        .setDescription('Lista as campanhas, ou mostra os personagens de uma')
        .addStringOption((o) => o.setName('campanha').setDescription('Campanha').setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('canal')
        .setDescription('Liga o chat do mapa a um canal do Discord (o que um escreve aparece no outro). Sem canal, desliga')
        .addStringOption((o) => o.setName('campanha').setDescription('Campanha').setRequired(true).setAutocomplete(true))
        .addChannelOption((o) => o.setName('canal').setDescription('Canal de texto da mesa').addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((s) =>
      s
        .setName('mestre')
        .setDescription('Define quem é o mestre da campanha (passa o comando adiante)')
        .addStringOption((o) => o.setName('campanha').setDescription('Campanha').setRequired(true).setAutocomplete(true))
        .addUserOption((o) => o.setName('novo_mestre').setDescription('Quem vai mestrar').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('apagar')
        .setDescription('Apaga a campanha e a lista de personagens (as fichas continuam salvas)')
        .addStringOption((o) => o.setName('campanha').setDescription('Campanha').setRequired(true).setAutocomplete(true))
        .addBooleanOption((o) => o.setName('confirmar').setDescription('Marque para confirmar').setRequired(true)),
    ),

  autocompletar: autocompletarCampanha,

  async executar(i) {
    const g = i.guildId!;
    const sub = i.options.getSubcommand();

    if (sub === 'criar') {
      if (!ehMestre(i.member as GuildMember)) return i.reply({ content: 'Só o Mestre cria campanha.', flags: MessageFlags.Ephemeral });
      const nome = i.options.getString('nome', true).trim();
      const sistema = i.options.getString('sistema', true) as Sistema;
      if (porNome(g, nome)) return i.reply({ content: `Já existe uma campanha chamada **${nome}** neste servidor.`, flags: MessageFlags.Ephemeral });
      db.prepare('INSERT INTO campanhas (guild_id, nome, sistema, mestre_id, criada_em) VALUES (?, ?, ?, ?, ?)').run(g, nome, sistema, i.user.id, Date.now());
      const nova = porNome(g, nome)!;
      return i.reply({ content: `🐉 Campanha criada! Agora adicione os personagens com \`/campanha adicionar\`.`, embeds: [embedCampanha(nova, g)] });
    }

    if (sub === 'ver') {
      const nome = i.options.getString('campanha');
      if (!nome) {
        const todas = db
          .prepare(
            'SELECT c.nome, c.sistema, c.mestre_id, COUNT(p.user_id) AS total FROM campanhas c LEFT JOIN campanha_personagens p ON p.campanha_id = c.id WHERE c.guild_id = ? GROUP BY c.id ORDER BY c.nome',
          )
          .all(g) as { nome: string; sistema: Sistema; mestre_id: string; total: number }[];
        if (!todas.length) return i.reply({ content: 'Nenhuma campanha ainda. O Mestre pode usar `/campanha criar`.', flags: MessageFlags.Ephemeral });
        const embed = new EmbedBuilder()
          .setColor(COR)
          .setTitle('🐉 Campanhas do servidor')
          .setDescription(todas.map((c) => `**${c.nome}** · ${SISTEMAS[c.sistema].nome} · mestre <@${c.mestre_id}> · ${c.total} personagem(ns)`).join('\n'));
        return i.reply({ embeds: [embed] });
      }
      const c = porNome(g, nome);
      if (!c) return i.reply({ content: SEM_CAMPANHA(nome), flags: MessageFlags.Ephemeral });
      return i.reply({ embeds: [embedCampanha(c, g)] });
    }

    // Os comandos abaixo mexem numa campanha existente.
    const nome = i.options.getString('campanha', true);
    const c = porNome(g, nome);
    if (!c) return i.reply({ content: SEM_CAMPANHA(nome), flags: MessageFlags.Ephemeral });

    if (!podeMexer(i, c)) return i.reply(SEM_PERMISSAO);
    if (finalizando.has(c.id)) {
      return i.reply({ content: 'Esta sessão está sendo finalizada. Aguarde o encerramento.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'adicionar' || sub === 'remover') {
      const jogador = i.options.getUser('jogador', true);
      const ja = personagens(c.id).includes(jogador.id);

      if (sub === 'adicionar') {
        if (ja) return i.reply({ content: `${jogador} já está em **${c.nome}**.`, flags: MessageFlags.Ephemeral });
        // Não precisa de ficha antes: quem ainda não tem cria o personagem (ficha e foto) no próprio mapa.
        db.prepare('INSERT INTO campanha_personagens (campanha_id, user_id) VALUES (?, ?)').run(c.id, jogador.id);
        avisarMapa(c.id);
        const semFicha = !fichaDe(c.sistema, g, jogador.id);
        return i.reply({
          content: `⚔️ ${jogador} entrou em **${c.nome}**.` + (semFicha ? ' O personagem (ficha e foto) é criado no mapa, pelo `/sessao mapa`.' : ''),
          embeds: [embedCampanha(c, g)],
        });
      }

      if (!ja) return i.reply({ content: `${jogador} não está em **${c.nome}**.`, flags: MessageFlags.Ephemeral });
      db.prepare('DELETE FROM campanha_personagens WHERE campanha_id = ? AND user_id = ?').run(c.id, jogador.id);
      avisarMapa(c.id);
      return i.reply({ content: `🚪 ${jogador} saiu de **${c.nome}**.`, embeds: [embedCampanha(c, g)] });
    }

    if (sub === 'canal') {
      const canal = i.options.getChannel('canal');
      if (!canal) {
        db.prepare('UPDATE campanhas SET canal_id = NULL WHERE id = ?').run(c.id);
        return i.reply({ content: `🔌 O chat do mapa de **${c.nome}** não está mais ligado a nenhum canal.`, flags: MessageFlags.Ephemeral });
      }
      const outra = db.prepare('SELECT nome FROM campanhas WHERE guild_id = ? AND canal_id = ? AND id != ?').get(g, canal.id, c.id) as { nome: string } | undefined;
      if (outra) return i.reply({ content: `${canal} já está ligado à campanha **${outra.nome}**. Use outro canal.`, flags: MessageFlags.Ephemeral });
      const alvo = i.guild!.channels.cache.get(canal.id);
      const eu = i.guild!.members.me;
      if (!alvo?.isTextBased() || !eu || !alvo.permissionsFor(eu).has(['ViewChannel', 'SendMessages'])) {
        return i.reply({ content: `Não consigo escrever em ${canal}. Dê ao bot as permissões de ver e enviar mensagens nesse canal.`, flags: MessageFlags.Ephemeral });
      }
      db.prepare('UPDATE campanhas SET canal_id = ? WHERE id = ?').run(canal.id, c.id);
      return i.reply({
        content:
          `🔗 Chat do mapa de **${c.nome}** ligado a ${canal}.\n` +
          '• O que o mestre e os jogadores escreverem no mapa (e as rolagens públicas) aparece lá.\n' +
          '• O que eles escreverem lá aparece no chat do mapa.\n' +
          '• Rolagens escondidas do mestre nunca vão para o Discord; ao revelar, vão.',
      });
    }

    if (sub === 'mestre') {
      const novo = i.options.getUser('novo_mestre', true);
      if (novo.bot) return i.reply({ content: 'Bot não mestra campanha.', flags: MessageFlags.Ephemeral });
      if (novo.id === c.mestre_id) return i.reply({ content: `${novo} já é o mestre de **${c.nome}**.`, flags: MessageFlags.Ephemeral });
      const membro = await i.guild!.members.fetch(novo.id).catch(() => null);
      if (!membro) return i.reply({ content: `${novo} não está neste servidor.`, flags: MessageFlags.Ephemeral });
      if (!ehMestre(membro)) {
        return i.reply({ content: `${novo} não tem o cargo 🐉 Mestre. Peça para um admin dar o cargo antes.`, flags: MessageFlags.Ephemeral });
      }
      db.prepare('UPDATE campanhas SET mestre_id = ? WHERE id = ?').run(novo.id, c.id);
      avisarMapa(c.id);
      return i.reply({ content: `🐉 ${novo} é o novo mestre de **${c.nome}**.`, embeds: [embedCampanha({ ...c, mestre_id: novo.id }, g)] });
    }

    if (sub === 'apagar') {
      if (!i.options.getBoolean('confirmar', true)) {
        return i.reply({ content: 'Apagar a campanha é definitivo. Rode de novo com `confirmar: Sim` se tiver certeza.', flags: MessageFlags.Ephemeral });
      }
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM campanha_personagens WHERE campanha_id = ?').run(c.id);
        db.prepare('DELETE FROM campanhas WHERE id = ?').run(c.id);
        db.exec('COMMIT');
      } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
      }
      avisarMapa(c.id);
      apagarMapa(c.id);
      return i.reply({ content: `🗑️ Campanha **${c.nome}** apagada. As fichas dos jogadores continuam salvas.${c.canal_id || c.canal_voz_id ? ' O canal de texto e a call da campanha continuam no servidor: apague à mão se quiser.' : ''}`, flags: MessageFlags.Ephemeral });
    }
  },
};

// ---------- /sessao: tudo da sessão num comando só (marcar, abrir o mapa, iniciar e finalizar) ----------

const opcaoCampanha = (o: SlashCommandStringOption) =>
  o.setName('campanha').setDescription('Campanha (se você está em uma só, pode deixar em branco)').setAutocomplete(true);

async function eventoDa(guild: Guild, c: Campanha) {
  if (!c.evento_id) return null;
  return guild.scheduledEvents.fetch(c.evento_id).catch(() => null);
}

/** No /sessao iniciar: o evento marcado vira "ao vivo" (e passa para a call da campanha, se for de voz). */
async function iniciarEvento(guild: Guild, c: Campanha, vozId?: string) {
  try {
    const e = await eventoDa(guild, c);
    if (!e || e.status !== GuildScheduledEventStatus.Scheduled) return false;
    const mudar: GuildScheduledEventEditOptions<GuildScheduledEventStatus.Scheduled, GuildScheduledEventStatus.Active> = { status: GuildScheduledEventStatus.Active };
    if (vozId && e.entityType === GuildScheduledEventEntityType.Voice && e.channelId !== vozId) mudar.channel = vozId;
    await e.edit(mudar);
    return true;
  } catch (erro) {
    console.error('[sessao] iniciar evento:', erro);
    return false;
  }
}

/** No /sessao finalizar: o evento ao vivo é concluído. Um evento marcado para depois (a próxima sessão) fica. */
async function concluirEvento(guild: Guild, c: Campanha) {
  try {
    const e = await eventoDa(guild, c);
    if (e && e.status === GuildScheduledEventStatus.Scheduled && (e.scheduledStartTimestamp ?? 0) > Date.now()) return;
    if (e?.status === GuildScheduledEventStatus.Active) await e.edit({ status: GuildScheduledEventStatus.Completed });
    db.prepare('UPDATE campanhas SET evento_id = NULL, evento_inicio = NULL WHERE id = ?').run(c.id);
  } catch (erro) {
    console.error('[sessao] concluir evento:', erro);
  }
}

/** Aviso no canal de avisos do sistema, chamando os jogadores da campanha. */
async function avisarMesa(guild: Guild, c: Campanha, embed: EmbedBuilder) {
  const avisos = canalTexto(guild, SISTEMAS[c.sistema].avisos);
  if (!avisos) return null;
  const gente = personagens(c.id);
  await avisos.send({ content: gente.length ? gente.map((id) => `<@${id}>`).join(' ') : undefined, embeds: [embed], allowedMentions: { users: gente } });
  return avisos;
}

async function marcarSessao(i: ChatInputCommandInteraction, c: Campanha) {
  const inicio = interpretarDataHora(i.options.getString('data', true), i.options.getString('hora', true));
  if (!inicio) return i.reply({ content: 'Não entendi a data ou a hora. Use, por exemplo, `data:25/10 hora:20h`.', flags: MessageFlags.Ephemeral });
  if (inicio.getTime() < Date.now() + 60_000) return i.reply({ content: 'Essa data já passou.', flags: MessageFlags.Ephemeral });
  const guild = i.guild!;
  const sis = SISTEMAS[c.sistema];
  const titulo = i.options.getString('titulo') ?? `${sis.emoji} ${c.nome}`;
  const recado = i.options.getString('descricao');
  const descricao = recado ?? `Sessão de ${c.nome} (${sis.nome}). No dia, o mapa abre pelo /sessao mapa.`;
  const fim = new Date(inicio.getTime() + (i.options.getInteger('duracao') ?? 4) * 3_600_000);
  await i.deferReply({ flags: MessageFlags.Ephemeral });

  // Já tinha uma marcada e ainda não começou: remarca a mesma (quem marcou "Interessado" continua avisado).
  const antigo = await eventoDa(guild, c);
  const remarcar = antigo?.status === GuildScheduledEventStatus.Scheduled;
  let evento;
  if (antigo && remarcar) {
    evento = await antigo.edit({ name: titulo, description: descricao, scheduledStartTime: inicio, scheduledEndTime: fim });
  } else {
    const salaAtual = await buscarCanal(guild, c.canal_voz_id).catch(() => null);
    const voz = salaAtual?.type === ChannelType.GuildVoice ? salaAtual : canalPorNome(guild, sis.voz, ChannelType.GuildVoice);
    evento = await guild.scheduledEvents.create({
      name: titulo,
      description: descricao,
      scheduledStartTime: inicio,
      scheduledEndTime: fim,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      ...(voz
        ? { entityType: GuildScheduledEventEntityType.Voice, channel: voz.id }
        : { entityType: GuildScheduledEventEntityType.External, entityMetadata: { location: NOME_SERVIDOR } }),
    });
  }
  db.prepare('UPDATE campanhas SET evento_id = ?, evento_inicio = ? WHERE id = ?').run(evento.id, inicio.getTime(), c.id);

  const membro = i.member as GuildMember;
  const embed = new EmbedBuilder()
    .setColor(COR)
    .setAuthor({ name: `${membro.displayName} ${remarcar ? 'remarcou' : 'marcou'} a próxima sessão`, iconURL: membro.displayAvatarURL() })
    .setTitle(titulo)
    .setURL(evento.url)
    .setDescription(
      [
        `📅 ${tsCompleto(inicio.getTime())} (${tsRelativo(inicio.getTime())})`,
        `🗺️ Campanha **${c.nome}** · ${sis.nome}`,
        recado ? `\n> ${recado}` : null,
        '\nClique no título e marque **Interessado** para o Discord te lembrar na hora. No dia, o mestre abre a sessão e o link do mapa chega no seu privado.',
      ].filter(Boolean).join('\n'),
    );
  const avisos = await avisarMesa(guild, c, embed).catch(() => null);
  return i.editReply(`✅ Sessão de **${c.nome}** ${remarcar ? 'remarcada' : 'marcada'}: ${evento.url}${avisos ? `\nAvisei os jogadores em ${avisos}.` : ''}`);
}

async function desmarcarSessao(i: ChatInputCommandInteraction, c: Campanha) {
  const guild = i.guild!;
  const e = await eventoDa(guild, c);
  if (!e || e.status !== GuildScheduledEventStatus.Scheduled) {
    return i.reply({ content: `**${c.nome}** não tem sessão marcada. Marque com \`/sessao marcar\`.`, flags: MessageFlags.Ephemeral });
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const quando = e.scheduledStartTimestamp ?? 0;
  await e.edit({ status: GuildScheduledEventStatus.Canceled });
  db.prepare('UPDATE campanhas SET evento_id = NULL, evento_inicio = NULL WHERE id = ?').run(c.id);
  const motivo = i.options.getString('motivo');
  const embed = new EmbedBuilder()
    .setColor(0x7f8c8d)
    .setTitle(`❌ ${e.name} · desmarcada`)
    .setDescription(`A sessão de **${c.nome}** de ${tsCompleto(quando)} não vai acontecer.${motivo ? `\n> ${motivo}` : ''}`);
  const avisos = await avisarMesa(guild, c, embed).catch(() => null);
  return i.editReply(`Sessão desmarcada.${avisos ? ` Avisei em ${avisos}.` : ''}`);
}

async function proximasSessoes(i: ChatInputCommandInteraction) {
  const guild = i.guild!;
  const abertas = (db.prepare('SELECT * FROM campanhas WHERE guild_id = ? AND sessao_inicio IS NOT NULL ORDER BY nome').all(guild.id) as Campanha[])
    .map((c) => `🔴 **${c.nome}** · sessão aberta ${tsRelativo(c.sessao_inicio!)} · \`/sessao mapa\` para entrar`);
  const eventos = [...(await guild.scheduledEvents.fetch()).values()]
    .filter((e) => e.status === GuildScheduledEventStatus.Scheduled || e.status === GuildScheduledEventStatus.Active)
    .sort((a, b) => (a.scheduledStartTimestamp ?? 0) - (b.scheduledStartTimestamp ?? 0))
    .slice(0, 10);
  const campanhaDoEvento = new Map((db.prepare('SELECT nome, evento_id FROM campanhas WHERE guild_id = ? AND evento_id IS NOT NULL').all(guild.id) as { nome: string; evento_id: string }[]).map((c) => [c.evento_id, c.nome]));
  if (!abertas.length && !eventos.length) {
    return i.reply({ content: 'Nenhuma sessão marcada. O mestre marca com `/sessao marcar`.', flags: MessageFlags.Ephemeral });
  }
  const linhas = eventos.map((e) => {
    const ms = e.scheduledStartTimestamp ?? 0;
    const ativo = e.status === GuildScheduledEventStatus.Active ? ' · 🔴 rolando agora' : '';
    const camp = campanhaDoEvento.get(e.id);
    return `**[${e.name}](${e.url})**${camp ? ` · ${camp}` : ''}\n${tsCompleto(ms)} (${tsRelativo(ms)})${ativo} · ${e.userCount ?? 0} interessado(s)`;
  });
  const embed = new EmbedBuilder()
    .setColor(COR)
    .setTitle('📅 Sessões')
    .setDescription([...(abertas.length ? [abertas.join('\n')] : []), ...linhas].join('\n\n'))
    .setFooter({ text: '/sessao mapa abre o mapa da sua campanha' });
  return i.reply({ embeds: [embed] });
}

export const sessao: Comando = {
  data: new SlashCommandBuilder()
    .setName('sessao')
    .setDescription('Sessões de RPG: abrir o mapa, marcar, iniciar e finalizar')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('mapa').setDescription('Abre o mapa da sua campanha (o link é só seu)').addStringOption(opcaoCampanha))
    .addSubcommand((s) => s.setName('proximas').setDescription('Sessões abertas agora e as próximas marcadas'))
    .addSubcommand((s) =>
      s
        .setName('marcar')
        .setDescription('Marca (ou remarca) a próxima sessão: vira evento do Discord e avisa os jogadores (mestre)')
        .addStringOption((o) => o.setName('data').setDescription('Ex.: 25/10 ou 25/10/2026').setRequired(true).setMaxLength(10))
        .addStringOption((o) => o.setName('hora').setDescription('Ex.: 20h, 20:30').setRequired(true).setMaxLength(5))
        .addStringOption(opcaoCampanha)
        .addStringOption((o) => o.setName('titulo').setDescription('Ex.: Sessão 12 · A Cripta do Lich').setMaxLength(100))
        .addStringOption((o) => o.setName('descricao').setDescription('Resumo, o que levar, recado do mestre').setMaxLength(500))
        .addIntegerOption((o) => o.setName('duracao').setDescription('Em horas (padrão: 4)').setMinValue(1).setMaxValue(12)),
    )
    .addSubcommand((s) =>
      s
        .setName('desmarcar')
        .setDescription('Cancela a sessão marcada e avisa os jogadores (mestre)')
        .addStringOption(opcaoCampanha)
        .addStringOption((o) => o.setName('motivo').setDescription('Opcional: por que foi desmarcada').setMaxLength(300)),
    )
    .addSubcommand((s) =>
      s.setName('iniciar').setDescription('Abre a sessão: canal e call da mesa, e o mapa no privado de cada jogador (mestre)').addStringOption(opcaoCampanha),
    )
    .addSubcommand((s) =>
      s.setName('finalizar').setDescription('Encerra a sessão: resumo no canal de resumos e apaga as salas temporárias (mestre)').addStringOption(opcaoCampanha),
    ),

  autocompletar: autocompletarCampanha,

  async executar(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'proximas') return proximasSessoes(i);
    const achada = campanhaDaVez(i);
    if (typeof achada === 'string') return i.reply({ content: achada, flags: MessageFlags.Ephemeral });
    const c = achada;

    // O mapa é de todos da mesa: o mestre importa a imagem, cada jogador movimenta o seu personagem.
    if (sub === 'mapa') {
      const mestre = c.mestre_id === i.user.id;
      if (!mestre && !personagens(c.id).includes(i.user.id)) {
        return i.reply({ content: `Você não está em **${c.nome}**. Peça ao mestre para te adicionar com \`/campanha adicionar\`.`, flags: MessageFlags.Ephemeral });
      }
      const botao = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir o mapa').setEmoji('🗺️').setURL(linkDoMapa(c.id, i.user.id));
      return i.reply({
        content:
          `🗺️ **Mapa de ${c.nome}** · o link é só seu e vale por 1 hora (depois o navegador lembra de você por 7 dias). Não compartilhe.\n` +
          (mestre
            ? 'Você é o mestre: importe a imagem do mapa, mova qualquer peça e role escondido no chat (`/gr 1d20`), revelando depois se quiser.'
            : 'Arraste o seu personagem pelo mapa e role no chat da mesa (`/r 1d20+3`); todo mundo vê na hora.') +
          (mapaPublico() ? '' : '\n⚠️ O mapa está no endereço local deste PC. Para a mesa abrir de fora, defina `MAPA_URL` no `.env` (veja o README).'),
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(botao)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!podeMexer(i, c)) return i.reply(SEM_PERMISSAO);
    if (finalizando.has(c.id)) {
      return i.reply({ content: 'Esta sessão está sendo finalizada. Aguarde o encerramento.', flags: MessageFlags.Ephemeral });
    }
    if (sub === 'marcar') return marcarSessao(i, c);
    if (sub === 'desmarcar') return desmarcarSessao(i, c);

    if (sub === 'iniciar') {
      if (!mapaPublico()) {
        return i.reply({
          content: 'O mapa ainda não tem um endereço que os jogadores consigam abrir (falta `MAPA_URL` no `.env`). Veja o README.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const jogadores = personagens(c.id);
      await i.deferReply({ flags: MessageFlags.Ephemeral });

      // Canal de texto e call da sessão; a próxima sessão recria as salas apagadas.
      let salas: Awaited<ReturnType<typeof prepararCanais>> | undefined;
      try {
        salas = await prepararCanais(i.guild!, c, jogadores);
      } catch (e) {
        console.error('[campanha] canais:', e);
      }

      // Marca o começo da sessão (se já estava aberta, mantém o horário original).
      db.prepare('UPDATE campanhas SET sessao_inicio = COALESCE(sessao_inicio, ?) WHERE id = ?').run(Date.now(), c.id);
      // O evento marcado pelo /sessao marcar fica "ao vivo", já na call da mesa.
      const aoVivo = await iniciarEvento(i.guild!, c, salas?.voz.id);

      const enviados: string[] = [];
      const falharam: string[] = [];
      for (const id of jogadores) {
        const ficha = fichaDe(c.sistema, c.guild_id, id);
        const botao = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Entrar no mapa').setEmoji('🗺️').setURL(linkDoMapa(c.id, id, DURACAO_CONVITE));
        const convite = new EmbedBuilder()
          .setColor(COR)
          .setTitle(`🗺️ ${c.nome} · a sessão vai começar`)
          .setDescription(
            `<@${c.mestre_id}> abriu o mapa da campanha.\n` +
              (ficha
                ? `Seu personagem: **${ficha.nome}** (${ficha.classe}, nível ${ficha.nivel}).\n`
                : 'Você ainda não tem personagem nesta mesa: ao entrar no mapa, crie a ficha com nome e foto.\n') +
              (salas ? `Sala da mesa: ${salas.texto} · call: ${salas.voz}\n` : '') +
              'Clique em **Entrar no mapa**: o link é só seu e vale por 12 horas. Não compartilhe.',
          )
          .setFooter({ text: `${SISTEMAS[c.sistema].nome} · se o botão vencer, use /sessao mapa` });
        try {
          const usuario = await i.client.users.fetch(id);
          await usuario.send({ embeds: [convite], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(botao)] });
          enviados.push(id);
        } catch {
          falharam.push(id);
        }
      }

      // O mestre entra pelo botão desta resposta; se o canal da mesa estiver ligado, avisa lá que a sessão começou.
      const botaoMestre = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir o mapa').setEmoji('🗺️').setURL(linkDoMapa(c.id, c.mestre_id, DURACAO_CONVITE));
      const canal = salas?.texto ?? (c.canal_id ? await i.client.channels.fetch(c.canal_id).catch(() => null) : null);
      if (canal?.isTextBased() && 'send' in canal) {
        await canal
          .send({ content: `🗺️ **${c.nome}**: a sessão começou! Os links do mapa foram enviados no privado. Não recebeu? Use \`/sessao mapa\`.`, allowedMentions: { parse: [] } })
          .catch(() => {});
      }
      return i.editReply({
        content:
          (jogadores.length
            ? `🗺️ Convites de **${c.nome}** enviados no privado: ${enviados.length}/${jogadores.length}.`
            : `🗺️ Sessão de **${c.nome}** aberta, por enquanto só com você: ainda não há jogadores (use \`/campanha adicionar\`; o jogador cria o personagem no mapa e o próximo \`/sessao iniciar\` manda o convite).`) +
          (falharam.length
            ? `\n⚠️ Não consegui falar no privado com ${falharam.map((id) => `<@${id}>`).join(', ')} (DMs fechadas). Peça para usarem \`/sessao mapa\`.`
            : '') +
          (salas
            ? `\n📁 ${salas.novos.length ? `Criei ${salas.novos.map((n) => (n === 'texto' ? 'o canal de texto' : 'a call')).join(' e ')}` : 'Canais da campanha'}: ${salas.texto} e ${salas.voz} (só o mestre e os jogadores veem). O chat do mapa está ligado ao canal de texto.`
            : '\n⚠️ Não consegui criar o canal e a call da campanha (o bot precisa da permissão **Gerenciar Canais**).') +
          (aoVivo ? '\n📅 O evento da sessão no Discord está ao vivo.' : '') +
          '\nSeu link de mestre está no botão abaixo.',
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(botaoMestre)],
      });
    }

    if (sub === 'finalizar') {
      if (!c.sessao_inicio) {
        return i.reply({ content: `**${c.nome}** não tem sessão em andamento. Use \`/sessao iniciar\` para abrir uma.`, flags: MessageFlags.Ephemeral });
      }
      finalizando.add(c.id);
      let encerrada = false;
      try {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const fim = Date.now();
        const linhas = db.prepare('SELECT * FROM mapa_chat WHERE campanha_id = ? AND criada_em >= ? ORDER BY id').all(c.id, c.sessao_inicio) as LinhaChat[];
        const publicas = linhas.filter((l) => !l.secreta);
        const mensagens = publicas.filter((l) => l.tipo === 'msg').length;
        const rolagens = publicas.length - mensagens;
        const texto = registroDaSessao(c.nome, c.sessao_inicio, fim, linhas);

        // O chat do mapa guarda só as últimas mensagens, então o registro da sessão fica salvo em arquivo.
        const dia = new Date(c.sessao_inicio).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        const arquivo = `${nomeDeCanal(c.nome)}-${dia}-${c.sessao_inicio}.txt`;
        mkdirSync('dados/campanhas', { recursive: true });
        writeFileSync(join('dados', 'campanhas', `${c.id}-${arquivo}`), texto);

        const resumo = new EmbedBuilder()
          .setColor(COR)
          .setTitle(`🏁 ${c.nome} · sessão encerrada`)
          .setDescription(
            `Mestre: <@${c.mestre_id}>\n` +
              `⏱️ Duração: **${duracaoTexto(fim - c.sessao_inicio)}**\n` +
              `💬 **${mensagens}** mensagens · 🎲 **${rolagens}** rolagens no mapa\n` +
              'O registro do chat da sessão está no arquivo anexo. Até a próxima!',
          )
          .setFooter({ text: 'Resumos preservados; /sessao iniciar cria as salas da próxima sessão. O mapa continua disponível.' });
        const canal = await prepararResumos(i.guild!, c);
        // Em sessões anteriores à migração, reconhece o canal pelo tópico criado pelo próprio bot.
        const legado = await buscarCanal(i.guild!, c.canal_id);
        const topicos = [topicoDaMesa(c, '/sessao mapa'), topicoDaMesa(c, '/campanha mapa')];
        const textoId = c.canal_sessao_id ?? (legado?.type === ChannelType.GuildText && topicos.includes(legado.topic ?? '') ? legado.id : null);
        const ids = [...new Set([textoId, c.canal_voz_id].filter((id): id is string => !!id && id !== canal.id))];
        const falhas = await encerrarSalas(
          async () => {
            await canal.send({ embeds: [resumo], files: [new AttachmentBuilder(Buffer.from(texto, 'utf8'), { name: arquivo })], allowedMentions: { parse: [] } });
          },
          () => {
            db.prepare('UPDATE campanhas SET sessao_inicio = NULL WHERE id = ?').run(c.id);
            // Entrada no diário da campanha (o mapa mostra a lista e o registro de cada sessão).
            db.prepare('INSERT INTO campanha_sessoes (campanha_id, inicio, fim, mensagens, rolagens, arquivo) VALUES (?, ?, ?, ?, ?, ?)').run(
              c.id, c.sessao_inicio, fim, mensagens, rolagens, `${c.id}-${arquivo}`,
            );
            encerrada = true;
          },
          ids.map((id) => ({ id, apagar: async () => {
            // Sala que alguém já apagou à mão conta como apagada (o ID é limpo e não vira aviso toda sessão).
            const sala = await buscarCanal(i.guild!, id);
            if (sala) await sala.delete(`/sessao finalizar ${c.nome}`).catch((erro) => { if (!semCanal(erro)) throw erro; });
            db.prepare(`UPDATE campanhas SET
              canal_id = CASE WHEN canal_id = ? THEN NULL ELSE canal_id END,
              canal_sessao_id = CASE WHEN canal_sessao_id = ? THEN NULL ELSE canal_sessao_id END,
              canal_voz_id = CASE WHEN canal_voz_id = ? THEN NULL ELSE canal_voz_id END WHERE id = ?`).run(id, id, id, c.id);
          } })),
        );
        if (encerrada) await concluirEvento(i.guild!, c);
        return i.editReply({ content:
          `🏁 Sessão de **${c.nome}** encerrada. Resumo e registro enviados para ${canal}.` +
          (falhas.length ? `\n⚠️ Não consegui apagar estas salas: ${falhas.map((id) => `<#${id}>`).join(', ')}. Verifique a permissão **Gerenciar Canais**.`
            : '\nOs canais temporários de texto e voz foram apagados. /sessao iniciar cria os da próxima sessão.'),
        });
      } catch (erro) {
        console.error('[campanha] finalizar:', erro);
        return i.editReply({ content: encerrada
          ? 'A sessão foi encerrada e o resumo foi enviado, mas houve um erro ao informar o resultado. Confira o canal de resumos e as salas da campanha.'
          : 'Não consegui concluir o envio do resumo e o encerramento. A sessão continua aberta e nenhuma sala foi apagada. Verifique as permissões do bot para gerenciar canais, enviar mensagens, inserir links e anexar arquivos; depois tente novamente. O registro também ficou salvo no servidor.' });
      } finally {
        finalizando.delete(c.id);
      }
    }

  },
};
