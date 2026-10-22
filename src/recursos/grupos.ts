import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type CategoryChannel,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type ModalSubmitInteraction,
  type OverwriteResolvable,
  type TextChannel,
} from 'discord.js';
import { CANAIS, CARGOS } from '../config.ts';
import { db } from '../db.ts';
import {
  emojiValido,
  MAX_GRUPOS_POR_DONO,
  nomeCargoGrupo,
  nomeCategoriaGrupo,
  nomeTextoGrupo,
  nomeVozGrupo,
  problemaNoNome,
  slugCanal,
} from '../lib/grupos.ts';
import { canalTexto, cargoPorNome, ehStaff } from '../lib/servidor.ts';
import type { Comando, HandlerBotao, HandlerModal } from '../tipos.ts';
import { garantirIntegracao } from './integracao.ts';

// Subgrupos: qualquer um pede, o admin aprova; cada grupo ganha cargo, categoria, texto e voz.
// O dono pode pedir canais extras (também com aprovação), convidar, remover, transferir e apagar.


const MAX_CANAIS_POR_GRUPO = 20;
const { ViewChannel, Connect, Speak, SendMessages, ReadMessageHistory, ManageMessages, MoveMembers, MuteMembers, DeafenMembers, PrioritySpeaker } = PermissionFlagsBits;

type Grupo = {
  id: number;
  guild_id: string;
  nome: string;
  emoji: string;
  descricao: string;
  dono_id: string;
  aberto: number;
  cargo_id: string;
  categoria_id: string;
  texto_id: string;
  voz_id: string;
  criado_em: number;
};
type DadosPedido =
  | { tipo: 'criar'; nome: string; emoji: string; descricao: string; aberto: boolean }
  | { tipo: 'renomear'; nome: string }
  | { tipo: 'canal'; canal: 'texto' | 'voz'; nome: string };
type Pedido = { id: number; guild_id: string; tipo: DadosPedido['tipo']; grupo_id: number | null; autor_id: string; dados: string; status: string; criado_em: number };

const grupoPorId = (id: number | string) => db.prepare('SELECT * FROM grupos WHERE id = ?').get(Number(id)) as Grupo | undefined;
const gruposDo = (g: string) => db.prepare('SELECT * FROM grupos WHERE guild_id = ? ORDER BY nome COLLATE NOCASE').all(g) as Grupo[];
const gruposDoDono = (g: string, u: string) => db.prepare('SELECT * FROM grupos WHERE guild_id = ? AND dono_id = ?').all(g, u) as Grupo[];
const pedidoPorId = (id: number | string) => db.prepare('SELECT * FROM grupo_pedidos WHERE id = ?').get(Number(id)) as Pedido | undefined;
const pedidosPendentes = (g: string, u: string, tipo: string) =>
  (db.prepare("SELECT COUNT(*) AS n FROM grupo_pedidos WHERE guild_id = ? AND autor_id = ? AND tipo = ? AND status = 'pendente'").get(g, u, tipo) as { n: number }).n;
const nomeEmUso = (g: string, nome: string, exceto?: number) =>
  !!db.prepare('SELECT 1 FROM grupos WHERE guild_id = ? AND nome = ? COLLATE NOCASE AND id != ?').get(g, nome, exceto ?? -1);
const titulo = (gr: Pick<Grupo, 'emoji' | 'nome'>) => `${gr.emoji} ${gr.nome}`;
const efemera = (content: string) => ({ content, flags: MessageFlags.Ephemeral }) as const;

// ---------- Permissões e estrutura ----------

function permissoesGrupo(guild: Guild, cargoId: string, donoId: string): OverwriteResolvable[] {
  const admin = cargoPorNome(guild, CARGOS.admin.nome)?.id;
  const lista: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [ViewChannel] },
    { id: cargoId, allow: [ViewChannel, Connect, Speak, SendMessages, ReadMessageHistory] },
    // O dono modera o próprio grupo (sem poder renomear: isso passa pela aprovação).
    { id: donoId, allow: [ViewChannel, Connect, Speak, SendMessages, ReadMessageHistory, ManageMessages, MoveMembers, MuteMembers, DeafenMembers, PrioritySpeaker] },
  ];
  if (admin) lista.push({ id: admin, allow: [ViewChannel, Connect, SendMessages] });
  return lista;
}

/** Aplica as permissões do grupo na categoria e em todos os canais dela (depois de trocar o dono). */
async function sincronizarPermissoes(guild: Guild, gr: Grupo) {
  const categoria = guild.channels.cache.get(gr.categoria_id) as CategoryChannel | undefined;
  if (!categoria) return;
  const regras = permissoesGrupo(guild, gr.cargo_id, gr.dono_id);
  await categoria.permissionOverwrites.set(regras);
  for (const canal of categoria.children.cache.values()) await canal.permissionOverwrites.set(regras).catch(() => {});
}

async function criarEstrutura(guild: Guild, d: Extract<DadosPedido, { tipo: 'criar' }>, donoId: string) {
  const cargo = await guild.roles.create({ name: nomeCargoGrupo(d.emoji, d.nome), mentionable: true, reason: `Subgrupo aprovado: ${d.nome}` });
  const regras = permissoesGrupo(guild, cargo.id, donoId);
  const categoria = await guild.channels.create({ name: nomeCategoriaGrupo(d.emoji, d.nome), type: ChannelType.GuildCategory, permissionOverwrites: regras });
  const texto = await guild.channels.create({
    name: nomeTextoGrupo(d.nome),
    type: ChannelType.GuildText,
    parent: categoria.id,
    topic: d.descricao || `Canal do grupo ${d.nome}.`,
    permissionOverwrites: regras,
  });
  const voz = await guild.channels.create({ name: nomeVozGrupo(d.emoji, d.nome), type: ChannelType.GuildVoice, parent: categoria.id, permissionOverwrites: regras });
  const dono = await guild.members.fetch(donoId).catch(() => null);
  await dono?.roles.add(cargo).catch(() => {});

  const r = db.prepare(
    'INSERT INTO grupos (guild_id, nome, emoji, descricao, dono_id, aberto, cargo_id, categoria_id, texto_id, voz_id, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(guild.id, d.nome, d.emoji, d.descricao, donoId, d.aberto ? 1 : 0, cargo.id, categoria.id, texto.id, voz.id, Date.now());
  const gr = grupoPorId(Number(r.lastInsertRowid))!;

  await texto.send({
    content:
      `${d.emoji} **Bem-vindos ao ${d.nome}!** Grupo de <@${donoId}>${d.descricao ? `: ${d.descricao}` : '.'}\n` +
      `Ele é **${d.aberto ? 'aberto (entra quem quiser)' : 'fechado (o dono aprova quem entra)'}**. Comandos do dono: ` +
      '`/grupo convidar`, `/grupo remover`, `/grupo canal` (pede canal novo), `/grupo renomear`, `/grupo privacidade`, `/grupo transferir`, `/grupo apagar`.',
    allowedMentions: { users: [donoId] },
  });
  return gr;
}

async function apagarEstrutura(guild: Guild, gr: Grupo) {
  const categoria = guild.channels.cache.get(gr.categoria_id) as CategoryChannel | undefined;
  for (const canal of categoria?.children.cache.values() ?? []) await canal.delete('Subgrupo apagado').catch(() => {});
  // Canais principais que tenham sido tirados da categoria.
  for (const id of [gr.texto_id, gr.voz_id]) await guild.channels.cache.get(id)?.delete('Subgrupo apagado').catch(() => {});
  await categoria?.delete('Subgrupo apagado').catch(() => {});
  await guild.roles.cache.get(gr.cargo_id)?.delete('Subgrupo apagado').catch(() => {});
  db.prepare('DELETE FROM grupo_entradas WHERE grupo_id = ?').run(gr.id);
  db.prepare("UPDATE grupo_pedidos SET status = 'cancelado' WHERE grupo_id = ? AND status = 'pendente'").run(gr.id);
  db.prepare('DELETE FROM grupos WHERE id = ?').run(gr.id);
}

// ---------- Painel de #subgrupos ----------

const TITULO_PAINEL = '👥 Subgrupos da Taverna';

export async function atualizarPainelGrupos(guild: Guild) {
  // Os subgrupos abertos também são uma pergunta do formulário de entrada.
  garantirIntegracao(guild).catch((e) => console.error('[formulário de entrada]', e));
  const canal = canalTexto(guild, CANAIS.subgrupos);
  if (!canal) return;
  const antigas = await canal.messages.fetch({ limit: 50 });
  for (const m of antigas.values()) {
    if (m.author.id === guild.client.user.id && m.embeds[0]?.title?.startsWith('👥 Subgrupos')) await m.delete().catch(() => {});
  }

  const grupos = gruposDo(guild.id);
  if (!grupos.length) {
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(TITULO_PAINEL).setDescription('Nenhum grupo ainda. Peça o seu com `/grupo criar` e um admin aprova.');
    await canal.send({ embeds: [embed] });
    return;
  }

  // 25 botões por mensagem (5 linhas de 5).
  for (let k = 0; k < grupos.length; k += 25) {
    const lote = grupos.slice(k, k + 25);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(k === 0 ? TITULO_PAINEL : '👥 Subgrupos (continuação)')
      .setDescription(
        (k === 0 ? 'Clique para **entrar** ou **sair**. 🔓 aberto: entra na hora · 🔒 fechado: o dono aprova. Peça o seu com `/grupo criar`.\n\n' : '') +
          lote
            .map((gr) => {
              const membros = guild.roles.cache.get(gr.cargo_id)?.members.size ?? 0;
              return `${gr.aberto ? '🔓' : '🔒'} ${titulo(gr)} · ${membros} membro(s) · dono <@${gr.dono_id}>${gr.descricao ? `\n> ${gr.descricao}` : ''}`;
            })
            .join('\n'),
      );
    const botoes = lote.map((gr) =>
      new ButtonBuilder().setCustomId(`grupo:alternar:${gr.id}`).setLabel(gr.nome.slice(0, 80)).setEmoji(gr.emoji).setStyle(gr.aberto ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
    const linhas: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let j = 0; j < botoes.length; j += 5) linhas.push(new ActionRowBuilder<ButtonBuilder>().addComponents(botoes.slice(j, j + 5)));
    await canal.send({ embeds: [embed], components: linhas, allowedMentions: { parse: [] } });
  }
}

// ---------- Pedidos para o admin ----------

const canalAprovacoes = (guild: Guild) => canalTexto(guild, CANAIS.aprovacoes) ?? canalTexto(guild, CANAIS.logs);

function descreverPedido(p: Pedido, d: DadosPedido) {
  const gr = p.grupo_id ? grupoPorId(p.grupo_id) : undefined;
  const embed = new EmbedBuilder().setColor(0xf5b544).setFooter({ text: `Pedido #${p.id}` }).setTimestamp(p.criado_em);
  if (d.tipo === 'criar') {
    embed.setTitle('📥 Pedido de subgrupo novo').addFields(
      { name: 'Nome', value: `${d.emoji} ${d.nome}`, inline: true },
      { name: 'Entrada', value: d.aberto ? '🔓 aberta' : '🔒 o dono aprova', inline: true },
      { name: 'Pedido por', value: `<@${p.autor_id}>`, inline: true },
      { name: 'Descrição', value: d.descricao || '—' },
    );
  } else if (d.tipo === 'renomear') {
    embed.setTitle('📥 Pedido para renomear grupo').addFields(
      { name: 'Grupo', value: gr ? titulo(gr) : '(apagado)', inline: true },
      { name: 'Nome novo', value: `${gr?.emoji ?? ''} ${d.nome}`, inline: true },
      { name: 'Pedido por', value: `<@${p.autor_id}>`, inline: true },
    );
  } else {
    embed.setTitle(`📥 Pedido de canal de ${d.canal} no grupo`).addFields(
      { name: 'Grupo', value: gr ? titulo(gr) : '(apagado)', inline: true },
      { name: 'Canal', value: d.canal === 'texto' ? `# ${slugCanal(d.nome)}` : `🔊 ${d.nome}`, inline: true },
      { name: 'Pedido por', value: `<@${p.autor_id}>`, inline: true },
    );
  }
  return embed;
}

async function enviarPedido(guild: Guild, autorId: string, grupoId: number | null, d: DadosPedido) {
  const canal = canalAprovacoes(guild);
  if (!canal) return false;
  const r = db.prepare('INSERT INTO grupo_pedidos (guild_id, tipo, grupo_id, autor_id, dados, criado_em) VALUES (?, ?, ?, ?, ?, ?)').run(
    guild.id, d.tipo, grupoId, autorId, JSON.stringify(d), Date.now(),
  );
  const p = pedidoPorId(Number(r.lastInsertRowid))!;
  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`grupo:aprovar:${p.id}`).setLabel('Aprovar').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`grupo:outronome:${p.id}`).setLabel('Aprovar com outro nome').setEmoji('✏️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`grupo:recusar:${p.id}`).setLabel('Recusar').setEmoji('❌').setStyle(ButtonStyle.Danger),
  );
  await canal.send({ embeds: [descreverPedido(p, d)], components: [botoes], allowedMentions: { parse: [] } });
  return true;
}

/** Avisa quem pediu: por mensagem privada; se a DM estiver fechada, no #comandos-do-bot. */
async function avisar(guild: Guild, userId: string, texto: string) {
  const membro = await guild.members.fetch(userId).catch(() => null);
  const foi = await membro?.send(`**${guild.name}** · ${texto}`).then(() => true, () => false);
  if (!foi) await canalTexto(guild, CANAIS.comandos)?.send({ content: `<@${userId}> ${texto}`, allowedMentions: { users: [userId] } }).catch(() => {});
}

async function decidir(i: ButtonInteraction | ModalSubmitInteraction, pedidoId: string, aprovar: boolean, nomeNovo?: string, motivo?: string) {
  const guild = i.guild!;
  if (!ehStaff(guild, i.user.id)) return i.reply(efemera('Só a staff aprova pedidos.'));
  const p = pedidoPorId(pedidoId);
  if (!p || p.status !== 'pendente') return i.reply(efemera('Esse pedido já foi resolvido.'));
  const d = JSON.parse(p.dados) as DadosPedido;
  await i.deferUpdate();

  const fechar = async (cor: number, linha: string) => {
    const embed = descreverPedido(p, d).setColor(cor).addFields({ name: 'Decisão', value: linha });
    await i.editReply({ embeds: [embed], components: [] });
  };

  if (!aprovar) {
    db.prepare("UPDATE grupo_pedidos SET status = 'recusado' WHERE id = ?").run(p.id);
    await avisar(guild, p.autor_id, `❌ Seu pedido (${d.tipo === 'criar' ? `grupo **${d.nome}**` : d.tipo === 'renomear' ? `nome **${d.nome}**` : `canal **${d.nome}**`}) foi recusado.${motivo ? ` Motivo: ${motivo}` : ''}`);
    return fechar(0xc0392b, `❌ Recusado por <@${i.user.id}>${motivo ? `: ${motivo}` : ''}`);
  }

  const nome = (nomeNovo ?? d.nome).trim();
  const problema = problemaNoNome(nome);
  if (problema) return i.followUp(efemera(`Nome inválido: ${problema}`));

  try {
    if (d.tipo === 'criar') {
      if (nomeEmUso(guild.id, nome)) return i.followUp(efemera(`Já existe um grupo chamado **${nome}**. Use "Aprovar com outro nome".`));
      const gr = await criarEstrutura(guild, { ...d, nome }, p.autor_id);
      await atualizarPainelGrupos(guild);
      await avisar(guild, p.autor_id, `✅ Seu grupo **${titulo(gr)}** foi aprovado! Os canais já estão no ar: <#${gr.texto_id}>.`);
    } else {
      const gr = p.grupo_id ? grupoPorId(p.grupo_id) : undefined;
      if (!gr) {
        db.prepare("UPDATE grupo_pedidos SET status = 'cancelado' WHERE id = ?").run(p.id);
        return fechar(0x95a5a6, 'O grupo não existe mais.');
      }
      if (d.tipo === 'renomear') {
        if (nomeEmUso(guild.id, nome, gr.id)) return i.followUp(efemera(`Já existe um grupo chamado **${nome}**.`));
        await guild.roles.cache.get(gr.cargo_id)?.setName(nomeCargoGrupo(gr.emoji, nome)).catch(() => {});
        await guild.channels.cache.get(gr.categoria_id)?.setName(nomeCategoriaGrupo(gr.emoji, nome)).catch(() => {});
        await guild.channels.cache.get(gr.texto_id)?.setName(nomeTextoGrupo(nome)).catch(() => {});
        await guild.channels.cache.get(gr.voz_id)?.setName(nomeVozGrupo(gr.emoji, nome)).catch(() => {});
        db.prepare('UPDATE grupos SET nome = ? WHERE id = ?').run(nome, gr.id);
        await atualizarPainelGrupos(guild);
        await avisar(guild, p.autor_id, `✅ O grupo agora se chama **${gr.emoji} ${nome}**.`);
      } else {
        const categoria = guild.channels.cache.get(gr.categoria_id) as CategoryChannel | undefined;
        if (!categoria) return fechar(0x95a5a6, 'A categoria do grupo sumiu. Recrie o grupo.');
        if (categoria.children.cache.size >= MAX_CANAIS_POR_GRUPO) return i.followUp(efemera(`O grupo já tem ${MAX_CANAIS_POR_GRUPO} canais (limite).`));
        const novo = await guild.channels.create({
          name: d.canal === 'texto' ? slugCanal(nome) : nome,
          type: d.canal === 'texto' ? ChannelType.GuildText : ChannelType.GuildVoice,
          parent: categoria.id,
          permissionOverwrites: permissoesGrupo(guild, gr.cargo_id, gr.dono_id),
        });
        await avisar(guild, p.autor_id, `✅ Canal ${novo} criado no grupo **${titulo(gr)}**.`);
      }
    }
  } catch (erro) {
    console.error('[grupos]', erro);
    return i.followUp(efemera('Não consegui criar no Discord (permissão do bot ou limite de canais/cargos). Nada foi aprovado.'));
  }

  db.prepare("UPDATE grupo_pedidos SET status = 'aprovado' WHERE id = ?").run(p.id);
  return fechar(0x2ecc71, `✅ Aprovado por <@${i.user.id}>${nomeNovo ? ` com o nome **${nome}**` : ''}`);
}

// ---------- Entrar e sair ----------

async function alternar(i: ChatInputCommandInteraction | ButtonInteraction, gr: Grupo, querEntrar?: boolean) {
  const membro = i.member as GuildMember;
  const cargo = i.guild!.roles.cache.get(gr.cargo_id);
  if (!cargo) return i.reply(efemera('O cargo desse grupo sumiu. Avise um admin.'));
  const dentro = membro.roles.cache.has(cargo.id);

  if (dentro && querEntrar !== true) {
    if (gr.dono_id === membro.id) return i.reply(efemera('Você é o dono. Para sair, passe o grupo com `/grupo transferir` ou apague com `/grupo apagar`.'));
    await membro.roles.remove(cargo);
    await atualizarPainelGrupos(i.guild!).catch(() => {});
    return i.reply(efemera(`Você saiu de **${titulo(gr)}**.`));
  }
  if (dentro) return i.reply(efemera(`Você já está em **${titulo(gr)}**: <#${gr.texto_id}>.`));
  if (querEntrar === false) return i.reply(efemera(`Você não está em **${titulo(gr)}**.`));

  const texto = i.guild!.channels.cache.get(gr.texto_id) as TextChannel | undefined;
  if (gr.aberto) {
    await membro.roles.add(cargo);
    await texto?.send({ content: `👋 ${membro} entrou no grupo!`, allowedMentions: { users: [] } }).catch(() => {});
    await atualizarPainelGrupos(i.guild!).catch(() => {});
    return i.reply(efemera(`${gr.emoji} Bem-vindo a **${gr.nome}**! Canal: <#${gr.texto_id}>.`));
  }

  if (db.prepare('SELECT 1 FROM grupo_entradas WHERE grupo_id = ? AND user_id = ?').get(gr.id, membro.id)) {
    return i.reply(efemera('Seu pedido já está com o dono. Aguarde.'));
  }
  db.prepare('INSERT INTO grupo_entradas (grupo_id, user_id) VALUES (?, ?)').run(gr.id, membro.id);
  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`grupo:aceitar:${gr.id}:${membro.id}`).setLabel('Aceitar').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`grupo:negar:${gr.id}:${membro.id}`).setLabel('Recusar').setEmoji('❌').setStyle(ButtonStyle.Danger),
  );
  // O canal só aparece para quem está no grupo; quem decide é o dono (ou um admin).
  await texto?.send({ content: `🚪 <@${gr.dono_id}>, ${membro} quer entrar no grupo.`, components: [botoes], allowedMentions: { users: [gr.dono_id] } });
  return i.reply(efemera(`🔒 **${titulo(gr)}** é fechado. Pedido enviado ao dono.`));
}

// ---------- Comando ----------

/** Grupo de um comando do dono: o escolhido na opção, ou o único dele. Admin pode mexer em qualquer um. */
function grupoDoDono(i: ChatInputCommandInteraction): Grupo | string {
  const escolhido = i.options.getString('grupo');
  const admin = ehStaff(i.guild!, i.user.id);
  if (escolhido) {
    const gr = grupoPorId(escolhido);
    if (!gr || gr.guild_id !== i.guildId) return 'Grupo não encontrado.';
    if (gr.dono_id !== i.user.id && !admin) return 'Só o dono do grupo (ou um admin) pode fazer isso.';
    return gr;
  }
  const meus = gruposDoDono(i.guildId!, i.user.id);
  if (meus.length === 1) return meus[0];
  if (!meus.length) return 'Você não é dono de nenhum grupo. Peça um com `/grupo criar`.';
  return 'Você tem mais de um grupo: escolha qual na opção `grupo`.';
}

const opcaoGrupo = (o: import('discord.js').SlashCommandStringOption, obrigatoria = false) =>
  o.setName('grupo').setDescription('Qual grupo').setAutocomplete(true).setRequired(obrigatoria);

export const grupo: Comando = {
  data: new SlashCommandBuilder()
    .setName('grupo')
    .setDescription('Subgrupos com canais próprios (criados com aprovação)')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s.setName('criar').setDescription('Pede um subgrupo novo (um admin aprova)')
        .addStringOption((o) => o.setName('nome').setDescription('Nome do grupo').setRequired(true).setMaxLength(32))
        .addStringOption((o) => o.setName('emoji').setDescription('Um emoji para o grupo (padrão: 👥)').setMaxLength(16))
        .addStringOption((o) => o.setName('descricao').setDescription('Sobre o que é o grupo').setMaxLength(200))
        .addBooleanOption((o) => o.setName('fechado').setDescription('Se sim, você aprova quem entra (padrão: aberto)')),
    )
    .addSubcommand((s) => s.setName('entrar').setDescription('Entra num grupo').addStringOption((o) => opcaoGrupo(o, true)))
    .addSubcommand((s) => s.setName('sair').setDescription('Sai de um grupo').addStringOption((o) => opcaoGrupo(o, true)))
    .addSubcommand((s) => s.setName('lista').setDescription('Todos os grupos do servidor'))
    .addSubcommand((s) =>
      s.setName('canal').setDescription('(Dono) Pede um canal de texto ou voz novo no grupo')
        .addStringOption((o) => o.setName('tipo').setDescription('Texto ou voz').setRequired(true).addChoices({ name: 'Texto', value: 'texto' }, { name: 'Voz', value: 'voz' }))
        .addStringOption((o) => o.setName('nome').setDescription('Nome do canal').setRequired(true).setMaxLength(32))
        .addStringOption((o) => opcaoGrupo(o)),
    )
    .addSubcommand((s) =>
      s.setName('renomear').setDescription('(Dono) Pede um nome novo para o grupo')
        .addStringOption((o) => o.setName('nome').setDescription('Nome novo').setRequired(true).setMaxLength(32))
        .addStringOption((o) => opcaoGrupo(o)),
    )
    .addSubcommand((s) =>
      s.setName('convidar').setDescription('(Dono) Coloca alguém no grupo')
        .addUserOption((o) => o.setName('membro').setDescription('Quem').setRequired(true))
        .addStringOption((o) => opcaoGrupo(o)),
    )
    .addSubcommand((s) =>
      s.setName('remover').setDescription('(Dono) Tira alguém do grupo')
        .addUserOption((o) => o.setName('membro').setDescription('Quem').setRequired(true))
        .addStringOption((o) => opcaoGrupo(o)),
    )
    .addSubcommand((s) =>
      s.setName('privacidade').setDescription('(Dono) Abre ou fecha a entrada no grupo')
        .addBooleanOption((o) => o.setName('fechado').setDescription('Sim: você aprova quem entra · Não: entra quem quiser').setRequired(true))
        .addStringOption((o) => opcaoGrupo(o)),
    )
    .addSubcommand((s) =>
      s.setName('transferir').setDescription('(Dono) Passa o grupo para outra pessoa do grupo')
        .addUserOption((o) => o.setName('membro').setDescription('Novo dono').setRequired(true))
        .addStringOption((o) => opcaoGrupo(o)),
    )
    .addSubcommand((s) => s.setName('apagar').setDescription('(Dono ou admin) Apaga o grupo e todos os canais dele').addStringOption((o) => opcaoGrupo(o))),

  async autocompletar(i) {
    const sub = i.options.getSubcommand();
    const digitado = i.options.getFocused().toLowerCase();
    const todos = gruposDo(i.guildId!);
    const lista = sub === 'entrar' || sub === 'sair' || ehStaff(i.guild!, i.user.id) ? todos : todos.filter((g) => g.dono_id === i.user.id);
    return i.respond(
      lista.filter((g) => g.nome.toLowerCase().includes(digitado)).slice(0, 25).map((g) => ({ name: `${g.emoji} ${g.nome}`.slice(0, 100), value: String(g.id) })),
    );
  },

  async executar(i) {
    const guild = i.guild!;
    const g = guild.id;
    const sub = i.options.getSubcommand();

    if (sub === 'criar') {
      const nome = i.options.getString('nome', true).trim();
      const problema = problemaNoNome(nome);
      if (problema) return i.reply(efemera(problema));
      if (nomeEmUso(g, nome)) return i.reply(efemera(`Já existe um grupo chamado **${nome}**.`));
      if (pedidosPendentes(g, i.user.id, 'criar')) return i.reply(efemera('Você já tem um pedido de grupo esperando aprovação.'));
      if (gruposDoDono(g, i.user.id).length >= MAX_GRUPOS_POR_DONO) return i.reply(efemera(`Cada pessoa pode ser dona de até ${MAX_GRUPOS_POR_DONO} grupos.`));
      const d: DadosPedido = {
        tipo: 'criar',
        nome,
        emoji: emojiValido(i.options.getString('emoji')),
        descricao: i.options.getString('descricao')?.trim() ?? '',
        aberto: !i.options.getBoolean('fechado'),
      };
      if (!(await enviarPedido(guild, i.user.id, null, d))) return i.reply(efemera('O servidor ainda não tem canal de aprovações. Peça a um admin para rodar `/setup`.'));
      return i.reply(efemera(`📨 Pedido do grupo **${d.emoji} ${d.nome}** enviado! Você recebe a resposta por mensagem privada (ou no #comandos-do-bot).`));
    }

    if (sub === 'entrar' || sub === 'sair') {
      const gr = grupoPorId(i.options.getString('grupo', true));
      if (!gr || gr.guild_id !== g) return i.reply(efemera('Grupo não encontrado. Escolha um da lista.'));
      return alternar(i, gr, sub === 'entrar');
    }

    if (sub === 'lista') {
      const grupos = gruposDo(g);
      if (!grupos.length) return i.reply(efemera('Nenhum grupo ainda. Peça o seu com `/grupo criar`.'));
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('👥 Subgrupos')
        .setDescription(grupos.map((gr) => `${gr.aberto ? '🔓' : '🔒'} ${titulo(gr)} · ${guild.roles.cache.get(gr.cargo_id)?.members.size ?? 0} membro(s) · dono <@${gr.dono_id}>`).join('\n').slice(0, 4000));
      return i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // Daqui para baixo, comandos do dono.
    const gr = grupoDoDono(i);
    if (typeof gr === 'string') return i.reply(efemera(gr));

    if (sub === 'canal' || sub === 'renomear') {
      const nome = i.options.getString('nome', true).trim();
      const problema = problemaNoNome(nome);
      if (problema) return i.reply(efemera(problema));
      if (pedidosPendentes(g, i.user.id, sub) >= 3) return i.reply(efemera('Você já tem 3 pedidos desse tipo esperando. Aguarde a aprovação.'));
      const d: DadosPedido = sub === 'canal' ? { tipo: 'canal', canal: i.options.getString('tipo', true) as 'texto' | 'voz', nome } : { tipo: 'renomear', nome };
      if (!(await enviarPedido(guild, i.user.id, gr.id, d))) return i.reply(efemera('O servidor ainda não tem canal de aprovações. Peça a um admin para rodar `/setup`.'));
      return i.reply(efemera(`📨 Pedido enviado para aprovação (${sub === 'canal' ? `canal de ${d.tipo === 'canal' ? d.canal : ''} **${nome}**` : `nome **${nome}**`} em ${titulo(gr)}).`));
    }

    if (sub === 'convidar' || sub === 'remover' || sub === 'transferir') {
      const alvo = await guild.members.fetch(i.options.getUser('membro', true).id).catch(() => null);
      const cargo = guild.roles.cache.get(gr.cargo_id);
      if (!alvo || alvo.user.bot) return i.reply(efemera('Escolha uma pessoa do servidor.'));
      if (!cargo) return i.reply(efemera('O cargo desse grupo sumiu. Avise um admin.'));
      const texto = guild.channels.cache.get(gr.texto_id) as TextChannel | undefined;

      if (sub === 'convidar') {
        if (alvo.roles.cache.has(cargo.id)) return i.reply(efemera(`${alvo.displayName} já está no grupo.`));
        await alvo.roles.add(cargo);
        db.prepare('DELETE FROM grupo_entradas WHERE grupo_id = ? AND user_id = ?').run(gr.id, alvo.id);
        await texto?.send({ content: `👋 ${alvo} entrou no grupo (convite de ${i.user}).`, allowedMentions: { users: [alvo.id] } }).catch(() => {});
        await atualizarPainelGrupos(guild).catch(() => {});
        return i.reply(efemera(`${alvo.displayName} agora está em **${titulo(gr)}**.`));
      }
      if (sub === 'remover') {
        if (alvo.id === gr.dono_id) return i.reply(efemera('O dono não pode ser removido. Use `/grupo transferir` antes.'));
        if (!alvo.roles.cache.has(cargo.id)) return i.reply(efemera(`${alvo.displayName} não está no grupo.`));
        await alvo.roles.remove(cargo);
        alvo.voice.channel?.parentId === gr.categoria_id && (await alvo.voice.disconnect().catch(() => {}));
        await atualizarPainelGrupos(guild).catch(() => {});
        return i.reply(efemera(`${alvo.displayName} saiu de **${titulo(gr)}**.`));
      }
      // transferir
      if (!alvo.roles.cache.has(cargo.id)) return i.reply(efemera('O novo dono precisa estar no grupo. Convide antes.'));
      if (gruposDoDono(g, alvo.id).length >= MAX_GRUPOS_POR_DONO) return i.reply(efemera(`${alvo.displayName} já é dono de ${MAX_GRUPOS_POR_DONO} grupos.`));
      db.prepare('UPDATE grupos SET dono_id = ? WHERE id = ?').run(alvo.id, gr.id);
      await sincronizarPermissoes(guild, { ...gr, dono_id: alvo.id });
      await texto?.send({ content: `👑 ${alvo} é o novo dono do grupo.`, allowedMentions: { users: [alvo.id] } }).catch(() => {});
      await atualizarPainelGrupos(guild).catch(() => {});
      return i.reply(efemera(`👑 **${titulo(gr)}** agora é de ${alvo.displayName}.`));
    }

    if (sub === 'privacidade') {
      const fechado = i.options.getBoolean('fechado', true);
      db.prepare('UPDATE grupos SET aberto = ? WHERE id = ?').run(fechado ? 0 : 1, gr.id);
      await atualizarPainelGrupos(guild).catch(() => {});
      return i.reply(efemera(fechado ? `🔒 **${titulo(gr)}** agora é fechado: você aprova quem entra.` : `🔓 **${titulo(gr)}** agora é aberto.`));
    }

    // apagar
    const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`grupo:apagar:${gr.id}`).setLabel(`Apagar ${gr.nome}`.slice(0, 80)).setEmoji('🧨').setStyle(ButtonStyle.Danger),
    );
    return i.reply({
      content: `⚠️ Isso apaga **${titulo(gr)}**: o cargo, a categoria e **todos** os canais e mensagens dele. Não dá para desfazer.`,
      components: [botoes],
      flags: MessageFlags.Ephemeral,
    });
  },
};

// ---------- Botões e formulários ----------

export const botaoGrupo: HandlerBotao = {
  prefixo: 'grupo',
  async executar(i, argumento) {
    const [acao, id, extra] = argumento.split(':');
    const guild = i.guild!;

    if (acao === 'aprovar') return decidir(i, id, true);
    if (acao === 'outronome' || acao === 'recusar') {
      if (!ehStaff(guild, i.user.id)) return i.reply(efemera('Só a staff aprova pedidos.'));
      const p = pedidoPorId(id);
      if (!p || p.status !== 'pendente') return i.reply(efemera('Esse pedido já foi resolvido.'));
      const d = JSON.parse(p.dados) as DadosPedido;
      const campo =
        acao === 'outronome'
          ? new TextInputBuilder().setCustomId('valor').setLabel('Nome que vai ser usado').setStyle(TextInputStyle.Short).setValue(d.nome).setMinLength(2).setMaxLength(32).setRequired(true)
          : new TextInputBuilder().setCustomId('valor').setLabel('Motivo (a pessoa recebe)').setStyle(TextInputStyle.Paragraph).setMaxLength(300).setRequired(false);
      const modal = new ModalBuilder()
        .setCustomId(`grupom:${acao}:${p.id}`)
        .setTitle(acao === 'outronome' ? 'Aprovar com outro nome' : 'Recusar pedido')
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(campo));
      return i.showModal(modal);
    }

    const gr = grupoPorId(id);
    if (!gr) return i.reply(efemera('Esse grupo não existe mais.'));

    if (acao === 'alternar') return alternar(i, gr);

    if (acao === 'aceitar' || acao === 'negar') {
      if (i.user.id !== gr.dono_id && !ehStaff(guild, i.user.id)) return i.reply(efemera('Só o dono do grupo decide quem entra.'));
      if (!db.prepare('SELECT 1 FROM grupo_entradas WHERE grupo_id = ? AND user_id = ?').get(gr.id, extra)) {
        return i.update({ content: 'Esse pedido já foi resolvido.', components: [] });
      }
      db.prepare('DELETE FROM grupo_entradas WHERE grupo_id = ? AND user_id = ?').run(gr.id, extra);
      if (acao === 'negar') {
        await avisar(guild, extra, `🔒 Seu pedido para entrar em **${titulo(gr)}** foi recusado.`);
        return i.update({ content: `❌ Pedido de <@${extra}> recusado por ${i.user}.`, components: [], allowedMentions: { parse: [] } });
      }
      const membro = await guild.members.fetch(extra).catch(() => null);
      if (!membro) return i.update({ content: 'A pessoa saiu do servidor.', components: [] });
      await membro.roles.add(gr.cargo_id);
      await atualizarPainelGrupos(guild).catch(() => {});
      return i.update({ content: `✅ ${membro} entrou no grupo (aprovado por ${i.user}). Bem-vindo!`, components: [], allowedMentions: { users: [membro.id] } });
    }

    if (acao === 'apagar') {
      if (i.user.id !== gr.dono_id && !ehStaff(guild, i.user.id)) return i.reply(efemera('Só o dono (ou um admin) pode apagar.'));
      await i.update({ content: `🧨 Apagando **${titulo(gr)}**...`, components: [] });
      await apagarEstrutura(guild, gr);
      await atualizarPainelGrupos(guild).catch(() => {});
      return i.editReply({ content: `🗑️ **${titulo(gr)}** foi apagado.` }).catch(() => null);
    }
    return i.deferUpdate();
  },
};

export const modalGrupo: HandlerModal = {
  prefixo: 'grupom',
  async executar(i, argumento) {
    const [acao, id] = argumento.split(':');
    const valor = i.fields.getTextInputValue('valor').trim();
    if (!i.isFromMessage()) return i.reply(efemera('Formulário inválido.'));
    if (acao === 'outronome') return decidir(i, id, true, valor);
    return decidir(i, id, false, undefined, valor || undefined);
  },
};

/** O canal está dentro da categoria de algum subgrupo? (lá dentro o /grupo também funciona) */
export const ehCanalDeGrupo = (guildId: string, categoriaId: string | null) =>
  !!categoriaId && !!db.prepare('SELECT 1 FROM grupos WHERE guild_id = ? AND categoria_id = ?').get(guildId, categoriaId);
