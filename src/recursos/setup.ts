import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  Routes,
  SlashCommandBuilder,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type OverwriteData,
  PermissionsBitField,
  type TextChannel,
} from 'discord.js';
import { ATIVIDADES, CANAIS, CANAIS_REMOVIDOS, CARGOS, CARGOS_NIVEL, JOGOS, NOME_SERVIDOR, PLANO, REGRAS, nomeCargoAtividade, nomeCargoJogo, type Acesso } from '../config.ts';
import { db } from '../db.ts';
import { canalPorNome, cargoPorNome, canalTexto } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';
import { painelDeAtividades, painelDeCargos } from './cargos.ts';
import { atualizarPainelGrupos } from './grupos.ts';
import { desligarFormularioDoDiscord, garantirComunidade, painelVerificacao, TITULO_VERIFICACAO } from './formulario.ts';
import { aplicarPermissoesComandos } from './permissoesComandos.ts';

const { ViewChannel, SendMessages, Connect, ReadMessageHistory } = PermissionFlagsBits;

// Staff modera, mas não administra o servidor.
const PERMISSOES_STAFF = [
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.ViewAuditLog,
];

function permissoes(guild: Guild, acesso: Acesso = { tipo: 'publico' }): OverwriteData[] {
  const todos = guild.roles.everyone.id;
  const base = cargoPorNome(guild, CARGOS.membro.nome)?.id;
  const admin = cargoPorNome(guild, CARGOS.admin.nome)?.id;
  const comAdmin = (lista: OverwriteData[]) =>
    admin && !lista.some((o) => o.id === admin) ? [...lista, { id: admin, allow: [ViewChannel, SendMessages, Connect] }] : lista;

  switch (acesso.tipo) {
    // Sem o cargo base (antes de responder o formulário) não se vê nada além de #verificacao.
    case 'publico':
      return comAdmin([{ id: todos, deny: [ViewChannel] }, ...(base ? [{ id: base, allow: [ViewChannel, Connect] }] : [])]);
    case 'leitura':
      return comAdmin([{ id: todos, deny: [ViewChannel, SendMessages] }, ...(base ? [{ id: base, allow: [ViewChannel], deny: [SendMessages] }] : [])]);
    case 'verificacao':
      return comAdmin([{ id: todos, allow: [ViewChannel, ReadMessageHistory], deny: [SendMessages] }, ...(base ? [{ id: base, deny: [ViewChannel] }] : [])]);
    case 'staff': {
      // Só Staff e acima (Taverneiro e Dono têm Administrador, que já vê tudo).
      const staff = cargoPorNome(guild, CARGOS.staff.nome)?.id;
      const lista: OverwriteData[] = [{ id: todos, deny: [ViewChannel] }];
      if (staff) lista.push({ id: staff, allow: [ViewChannel, SendMessages, ReadMessageHistory, Connect] });
      return comAdmin(lista);
    }
    case 'cargo': {
      const cargo = cargoPorNome(guild, acesso.cargo)?.id;
      const escrita = acesso.escrita ? cargoPorNome(guild, acesso.escrita)?.id : undefined;
      const lista: OverwriteData[] = [{ id: todos, deny: [ViewChannel] }];
      if (cargo) lista.push({ id: cargo, allow: [ViewChannel, Connect], deny: escrita ? [SendMessages] : [] });
      if (escrita) lista.push({ id: escrita, allow: [ViewChannel, SendMessages, Connect] });
      return comAdmin(lista);
    }
  }
}

/** Aplica as regras de acesso no canal só se forem diferentes das atuais (cada mudança é uma chamada à API). */
async function sincronizarAcesso(canal: GuildBasedChannel, regras: OverwriteData[]): Promise<boolean> {
  if (!('permissionOverwrites' in canal)) return false;
  const chave = (id: string, allow: bigint, deny: bigint) => `${id}:${allow}:${deny}`;
  const desejado = regras
    .map((o) => chave(String(o.id), PermissionsBitField.resolve(o.allow ?? 0n), PermissionsBitField.resolve(o.deny ?? 0n)))
    .sort()
    .join('|');
  const atual = [...canal.permissionOverwrites.cache.values()].map((o) => chave(o.id, o.allow.bitfield, o.deny.bitfield)).sort().join('|');
  if (atual === desejado) return false;
  await canal.permissionOverwrites.set(regras);
  return true;
}

async function garantirCargos(guild: Guild, relatorio: string[]) {
  const desejados = [
    { ...CARGOS.dono, hoist: true, permissions: [PermissionFlagsBits.Administrator] },
    { ...CARGOS.admin, hoist: true, permissions: [PermissionFlagsBits.Administrator] },
    { ...CARGOS.staff, hoist: true, permissions: PERMISSOES_STAFF },
    { ...CARGOS.mestre, hoist: true, permissions: [] },
    { ...CARGOS.aventureiro, hoist: false, permissions: [] },
    { ...CARGOS.daggerheart, hoist: false, permissions: [] },
    { ...CARGOS.membro, hoist: true, permissions: [] },
    { ...CARGOS.honra, hoist: true, permissions: [] },
    { ...CARGOS.aniversario, hoist: false, permissions: [] },
    ...JOGOS.map((j) => ({ nome: nomeCargoJogo(j), cor: j.cor, hoist: false, permissions: [] })),
    ...CARGOS_NIVEL.map((c) => ({ nome: c.nome, cor: c.cor, hoist: true, permissions: [] })),
    ...ATIVIDADES.map((a) => ({ nome: nomeCargoAtividade(a), cor: a.cor, hoist: false, permissions: [] })),
  ];
  for (const c of desejados) {
    let existente = cargoPorNome(guild, c.nome);
    // Cargo renomeado no config (ex.: 🤪 Maluco → 🪑 Freguês): renomeia o antigo em vez de criar outro.
    const antigo = !existente && 'antigos' in c ? (c.antigos as readonly string[]).map((n) => cargoPorNome(guild, n)).find((r) => r) : undefined;
    if (antigo) {
      const nomeAntigo = antigo.name;
      existente = await antigo.edit({ name: c.nome });
      relatorio.push(`✏️ cargo ${nomeAntigo} → ${c.nome}`);
    }
    if (existente) {
      // Quem deve aparecer separado na lista de membros (ex.: cargos de nível criados antes disso).
      if (c.hoist && !existente.hoist && existente.editable) {
        await existente.setHoist(true).then(() => relatorio.push(`👥 ${c.nome} agora aparece separado na lista de membros`)).catch(() => {});
      }
      continue;
    }
    await guild.roles.create({ name: c.nome, colors: { primaryColor: c.cor }, hoist: c.hoist, permissions: c.permissions, mentionable: true });
    relatorio.push(`➕ cargo ${c.nome}`);
  }
  await ordenarCargos(guild, relatorio);
}

// Ordem dos cargos (de cima para baixo), logo abaixo do cargo do bot. Os de nível ficam acima dos Fregueses
// e aparecem separados na lista de membros, destacando quem é mais ativo no servidor.
const HIERARQUIA = [
  CARGOS.dono.nome,
  CARGOS.admin.nome,
  CARGOS.staff.nome,
  CARGOS.honra.nome,
  ...[...CARGOS_NIVEL].reverse().map((c) => c.nome),
  CARGOS.mestre.nome,
  CARGOS.membro.nome,
];

/** Põe os cargos da HIERARQUIA em ordem, logo abaixo do cargo do bot (o bot só mexe em cargos abaixo do dele). */
async function ordenarCargos(guild: Guild, relatorio: string[]) {
  const topoBot = guild.members.me?.roles.highest.position ?? 0;
  const principais = HIERARQUIA.map((n) => cargoPorNome(guild, n)).filter((c) => !!c);
  // O resto (RPG, atividades, jogos...) vai para baixo dos Fregueses, mantendo a ordem que já tinha entre si.
  const resto = [...guild.roles.cache.values()]
    .filter((c) => !c.managed && c.id !== guild.id && c.position < topoBot && !principais.includes(c))
    .sort((x, y) => y.position - x.position || x.name.localeCompare(y.name));
  const cargos = [...principais, ...resto];
  const emOrdem = cargos.every((c, k) => c.position < topoBot && (k === 0 || cargos[k - 1].position > c.position));
  if (emOrdem) return;
  try {
    // Chamada direta à API: o setPositions do discord.js falha quando vários cargos têm a mesma posição
    // (comum depois de criar muitos cargos de uma vez).
    await guild.client.rest.patch(Routes.guildRoles(guild.id), {
      body: cargos.map((c, k) => ({ id: c.id, position: Math.max(1, topoBot - 1 - k) })),
      reason: 'Hierarquia da Taverna (/setup)',
    });
    relatorio.push(`↕️ cargos em ordem: ${cargos.map((c) => c.name).join(' > ')}`);
  } catch {
    // Em bloco o Discord às vezes recusa (ex.: com o cargo de Server Booster no meio). Um a um, de cima para
    // baixo, só os da HIERARQUIA: cada cargo vai para logo abaixo do anterior.
    try {
      let teto = topoBot;
      for (const c of principais) {
        const atual = guild.roles.cache.get(c.id)!;
        if (atual.position >= teto || atual.position < teto - 2) await atual.setPosition(teto - 1, { reason: 'Hierarquia da Taverna (/setup)' });
        teto = guild.roles.cache.get(c.id)!.position;
      }
      relatorio.push(`↕️ cargos principais em ordem: ${principais.map((c) => c.name).join(' > ')}`);
    } catch {
      relatorio.push('⚠️ Não consegui ordenar os cargos. Em Configurações do servidor > Cargos, arraste o cargo do bot para o topo e rode /setup de novo.');
    }
  }
}

// Emojis da Taverna (gerados por scripts/gerar-emojis.ts): sobe os que ainda não existem, até o limite do nível de impulso.
const PASTA_EMOJIS = fileURLToPath(new URL('../../assets/emojis/', import.meta.url));
const LIMITE_EMOJIS = [50, 100, 150, 250];

async function garantirEmojis(guild: Guild, relatorio: string[]) {
  if (!existsSync(PASTA_EMOJIS)) return;
  const emojis = await guild.emojis.fetch();
  let livres = LIMITE_EMOJIS[guild.premiumTier] - emojis.filter((e) => !e.animated).size;
  const novos: string[] = [];
  for (const arquivo of readdirSync(PASTA_EMOJIS).filter((f) => f.endsWith('.png')).sort()) {
    const nome = arquivo.replace(/.png$/, '');
    if (emojis.some((e) => e.name === nome)) continue;
    if (livres <= 0) {
      relatorio.push(`⚠️ sem espaço para mais emojis (limite do nível ${guild.premiumTier}); faltou :${nome}: e os seguintes`);
      break;
    }
    try {
      const e = await guild.emojis.create({ attachment: join(PASTA_EMOJIS, arquivo), name: nome, reason: 'Emojis da Taverna (/setup)' });
      novos.push(`${e}`);
      livres--;
    } catch (erro) {
      relatorio.push(`⚠️ não consegui criar :${nome}: (${(erro as Error).message})`);
    }
  }
  if (novos.length) relatorio.push(`😀 ${novos.length} emoji(s) novo(s): ${novos.join(' ')}`);
}

async function garantirCanais(guild: Guild, relatorio: string[]) {
  const doPlano = new Set<string>();
  let ajustados = 0;
  let audioMelhorado = 0;
  const ajustar = async (canal: GuildBasedChannel, acesso: Acesso | undefined) => {
    try {
      if (await sincronizarAcesso(canal, permissoes(guild, acesso))) ajustados++;
    } catch (e) {
      relatorio.push(`⚠️ não consegui ajustar o acesso de ${canal.name} (${(e as Error).message})`);
    }
  };

  for (const cat of PLANO) {
    let categoria = canalPorNome<CategoryChannel>(guild, cat.nome, ChannelType.GuildCategory);
    const antiga = guild.channels.cache.find(
      (c): c is CategoryChannel => c.type === ChannelType.GuildCategory && (cat.antigos ?? []).includes(c.name),
    );
    if (!categoria && antiga) {
      categoria = await antiga.setName(cat.nome);
      relatorio.push(`✏️ categoria ${antiga.name} → ${cat.nome}`);
    }
    if (!categoria) {
      categoria = await guild.channels.create({
        name: cat.nome,
        type: ChannelType.GuildCategory,
        permissionOverwrites: permissoes(guild, cat.acesso),
      });
      relatorio.push(`➕ categoria ${cat.nome}`);
    }
    doPlano.add(categoria.id);
    await ajustar(categoria, cat.acesso);

    for (const canal of cat.canais) {
      const tipo = canal.voz ? ChannelType.GuildVoice : ChannelType.GuildText;
      let existente: GuildBasedChannel | undefined = canalPorNome(guild, canal.nome, tipo);
      const anterior = existente ? undefined : guild.channels.cache.find((c) => c.type === tipo && (canal.antigos ?? []).includes(c.name));
      if (anterior) {
        existente = await anterior.setName(canal.nome);
        relatorio.push(`✏️ ${anterior.name} → ${canal.nome}`);
      }
      if (!existente) {
        existente = await guild.channels.create({
          name: canal.nome,
          type: tipo,
          parent: categoria.id,
          topic: canal.voz ? undefined : canal.topico,
          userLimit: canal.limite,
          // Sem regra própria, herda a da categoria.
          permissionOverwrites: permissoes(guild, canal.acesso ?? cat.acesso),
        });
        relatorio.push(`➕ ${canal.voz ? '🔊' : '#'} ${canal.nome}`);
        // Canal novo que é o primeiro da categoria no plano (ex.: #verificacao) vai para o topo dela.
        if (canal === cat.canais[0] && 'setPosition' in existente) await existente.setPosition(0).catch(() => {});
      } else if (existente.parentId !== categoria.id && 'setParent' in existente) {
        await existente.setParent(categoria.id, { lockPermissions: false });
        // Mudou de categoria (ex.: #goticas foi para ATIVIDADES): aplica o acesso novo.
        relatorio.push(`🔀 ${canal.nome} → ${cat.nome}`);
      }
      // Sem regra própria, vale a da categoria.
      await ajustar(existente, canal.acesso ?? cat.acesso);
      // Calls na melhor qualidade de áudio que o nível de impulso do servidor permite (voz e música).
      if (existente.type === ChannelType.GuildVoice && existente.bitrate < guild.maximumBitrate) {
        await existente.setBitrate(guild.maximumBitrate).then(() => audioMelhorado++).catch(() => {});
      }
      doPlano.add(existente.id);
    }
  }
  if (ajustados) relatorio.push(`🔐 acesso ajustado em ${ajustados} canal(is)/categoria(s)`);
  if (audioMelhorado) relatorio.push(`🔊 ${audioMelhorado} call(s) agora em ${guild.maximumBitrate / 1000} kbps`);
  return doPlano;
}

async function mensagemDoBot(canal: TextChannel, titulo: string) {
  const msgs = await canal.messages.fetch({ limit: 20 });
  return msgs.find((m) => m.author.id === canal.client.user.id && m.embeds[0]?.title === titulo);
}

async function postarMensagensFixas(guild: Guild, relatorio: string[]) {
  await atualizarPainelGrupos(guild);
  const verificacao = canalTexto(guild, CANAIS.verificacao);
  if (verificacao) {
    const painel = await mensagemDoBot(verificacao, TITULO_VERIFICACAO);
    if (painel) await painel.edit(painelVerificacao());
    else {
      await verificacao.send(painelVerificacao());
      relatorio.push('📌 formulário de verificação postado');
    }
  }
  const regras = canalTexto(guild, CANAIS.regras);
  if (regras && !(await mensagemDoBot(regras, `📜 Regras da ${NOME_SERVIDOR}`))) {
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`📜 Regras da ${NOME_SERVIDOR}`)
      .setDescription(REGRAS.map((r, n) => `**${n + 1}.** ${r}`).join('\n'))
      .setFooter({ text: 'Comandos do bot: /ajuda' });
    await regras.send({ embeds: [embed] });
    relatorio.push('📌 regras postadas');
  }

  const escolha = canalTexto(guild, CANAIS.escolhaJogos);
  if (escolha) {
    // Se o painel já existe, atualiza os botões (ex.: entrou uma mesa nova).
    const painel = await mensagemDoBot(escolha, '🎮 Escolha seus jogos');
    if (painel) await painel.edit(painelDeCargos());
    else {
      await escolha.send(painelDeCargos());
      relatorio.push('📌 painel de jogos postado');
    }
    const atividades = await mensagemDoBot(escolha, '🎉 Desbloqueie as atividades');
    if (atividades) await atividades.edit(painelDeAtividades());
    else {
      await escolha.send(painelDeAtividades());
      relatorio.push('📌 painel de atividades postado');
    }
  }
}

// Monta ou completa o servidor e devolve o relatório em texto.
export async function montarServidor(guild: Guild, autorId: string, renomear: boolean): Promise<string> {
  const relatorio: string[] = [];

  if (renomear && guild.name !== NOME_SERVIDOR) {
    await guild.setName(NOME_SERVIDOR);
    relatorio.push(`✏️ servidor renomeado para ${NOME_SERVIDOR}`);
  }

  await garantirCargos(guild, relatorio);
  const doPlano = await garantirCanais(guild, relatorio);
  await garantirEmojis(guild, relatorio);

  for (const velho of CANAIS_REMOVIDOS) {
    const tipo = velho.voz ? ChannelType.GuildVoice : ChannelType.GuildText;
    const canal = guild.channels.cache.find((c) => c.type === tipo && c.name === velho.nome && !doPlano.has(c.id));
    if (!canal) continue;
    try {
      await canal.delete('Saiu do plano do servidor (/setup)');
      relatorio.push(`🗑️ ${velho.voz ? '🔊' : '#'} ${velho.nome} apagado`);
    } catch {
      relatorio.push(`⚠️ não consegui apagar ${velho.nome}`);
    }
  }

  const afk = canalPorNome(guild, '💤 AFK', ChannelType.GuildVoice);
  if (afk && guild.afkChannelId !== afk.id) await guild.setAFKChannel(afk.id);

  // Gente ganha o cargo base respondendo o formulário de #verificacao; os bots (ex.: bardos da música) ganham
  // aqui, para enxergar as calls. Quem rodou o setup vira Taverneiro.
  const membro = cargoPorNome(guild, CARGOS.membro.nome);
  const admin = cargoPorNome(guild, CARGOS.admin.nome);
  const membros = await guild.members.fetch();
  for (const m of membros.values()) {
    if (m.user.bot && membro && !m.roles.cache.has(membro.id)) await m.roles.add(membro).catch(() => {});
  }
  if (admin) await membros.get(autorId)?.roles.add(admin).catch(() => {});
  // O dono do servidor ganha o cargo de Dono.
  const cargoDono = cargoPorNome(guild, CARGOS.dono.nome);
  const dono = membros.get(guild.ownerId);
  if (cargoDono && dono && !dono.roles.cache.has(cargoDono.id)) {
    await dono.roles.add(cargoDono).then(() => relatorio.push(`👑 ${dono} recebeu ${cargoDono.name}`)).catch(() => relatorio.push(`⚠️ não consegui dar ${cargoDono.name} ao dono (o cargo do bot precisa estar acima)`));
  }

  await postarMensagensFixas(guild, relatorio);
  await garantirComunidade(guild, relatorio).catch((e) => relatorio.push(`⚠️ Comunidade: ${(e as Error).message}`));
  await desligarFormularioDoDiscord(guild, relatorio).catch((e) => relatorio.push(`⚠️ Formulário do Discord: ${(e as Error).message}`));
  relatorio.push(await aplicarPermissoesComandos(guild).catch((e) => `⚠️ Permissões por cargo: ${(e as Error).message}`));

  // Canais antigos não são apagados aqui: só listados para você decidir.
  const temporarias = new Set(
    (db.prepare('SELECT canal_id FROM calls_temporarias WHERE guild_id = ?').all(guild.id) as { canal_id: string }[]).map(
      (r) => r.canal_id,
    ),
  );
  // Canais dos subgrupos também não entram na lista (são criados pelo /grupo).
  const dosGrupos = new Set((db.prepare('SELECT categoria_id FROM grupos WHERE guild_id = ?').all(guild.id) as { categoria_id: string }[]).map((r) => r.categoria_id));
  const fora = guild.channels.cache.filter(
    (c: GuildBasedChannel) =>
      !doPlano.has(c.id) && !temporarias.has(c.id) && c.type !== ChannelType.GuildCategory && !(c.parentId && dosGrupos.has(c.parentId)),
  );

  return [
    relatorio.length ? relatorio.join('\n') : '✅ Tudo já estava no lugar.',
    fora.size
      ? `\n**Canais fora do plano (não mexi):** ${fora.map((c) => `<#${c.id}>`).join(' ')}\nApague ou mova os que não usar mais.`
      : '',
    `\nDê o cargo **${CARGOS.mestre.nome}** a quem narra o RPG e **${CARGOS.staff.nome}** a quem modera (\`/staff adicionar\`).`,
  ]
    .join('\n')
    .slice(0, 1900);
}

export const setup: Comando = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Monta (ou completa) a estrutura do servidor: cargos, categorias, canais e painéis.')
    .addBooleanOption((o) => o.setName('renomear').setDescription(`Renomear o servidor para "${NOME_SERVIDOR}" (padrão: sim)`))
    .addBooleanOption((o) =>
      o.setName('limpar_tudo').setDescription('⚠️ Apaga TODOS os canais e cargos antes de montar (pede confirmação)'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild),

  async executar(i) {
    const renomear = i.options.getBoolean('renomear') ?? true;

    if (i.options.getBoolean('limpar_tudo')) {
      const guild = i.guild!;
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('⚠️ Apagar o servidor inteiro?')
        .setDescription(
          `Vou apagar **${guild.channels.cache.size} canais** (com todas as mensagens) e todos os cargos que eu conseguir, ` +
            'e depois montar a Taverna do zero.\n\n' +
            '**Fica:** membros, emojis, figurinhas e cargos de bots/boost.\n' +
            '**Antes de apagar** eu salvo a estrutura antiga (canais, cargos e permissões) num backup. ' +
            '**Mensagens não têm volta.**',
        )
        .setFooter({ text: 'O botão expira em 2 minutos e só funciona para você.' });
      const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`reset:confirmar:${i.user.id}:${renomear ? 1 : 0}`)
          .setLabel('Apagar tudo e montar')
          .setEmoji('💣')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`reset:cancelar:${i.user.id}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
      );
      return i.reply({ embeds: [embed], components: [botoes], flags: MessageFlags.Ephemeral });
    }

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    return i.editReply(await montarServidor(i.guild!, i.user.id, renomear));
  },
};
