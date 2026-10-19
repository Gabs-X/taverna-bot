import {
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type OverwriteResolvable,
  type TextChannel,
} from 'discord.js';
import { CANAIS, CARGOS, JOGOS, NOME_SERVIDOR, PLANO, REGRAS, nomeCargoJogo, type Acesso } from '../config.ts';
import { db } from '../db.ts';
import { cargoPorNome, canalTexto } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';
import { painelDeCargos } from './cargos.ts';

const { ViewChannel, SendMessages, Connect } = PermissionFlagsBits;

function permissoes(guild: Guild, acesso: Acesso | undefined): OverwriteResolvable[] | undefined {
  if (!acesso || acesso.tipo === 'publico') return undefined;
  const todos = guild.roles.everyone.id;
  const admin = cargoPorNome(guild, CARGOS.admin.nome)?.id;
  const comAdmin = (lista: OverwriteResolvable[]) =>
    admin ? [...lista, { id: admin, allow: [ViewChannel, SendMessages, Connect] }] : lista;

  switch (acesso.tipo) {
    case 'leitura':
      return comAdmin([{ id: todos, deny: [SendMessages] }]);
    case 'staff':
      return comAdmin([{ id: todos, deny: [ViewChannel] }]);
    case 'cargo': {
      const cargo = cargoPorNome(guild, acesso.cargo)?.id;
      const escrita = acesso.escrita ? cargoPorNome(guild, acesso.escrita)?.id : undefined;
      const lista: OverwriteResolvable[] = [{ id: todos, deny: [ViewChannel] }];
      if (cargo) lista.push({ id: cargo, allow: [ViewChannel, Connect], deny: escrita ? [SendMessages] : [] });
      if (escrita) lista.push({ id: escrita, allow: [ViewChannel, SendMessages, Connect] });
      return comAdmin(lista);
    }
  }
}

async function garantirCargos(guild: Guild, relatorio: string[]) {
  const desejados = [
    { ...CARGOS.admin, hoist: true, permissions: [PermissionFlagsBits.Administrator] },
    { ...CARGOS.mestre, hoist: true, permissions: [] },
    { ...CARGOS.aventureiro, hoist: false, permissions: [] },
    { ...CARGOS.membro, hoist: true, permissions: [] },
    ...JOGOS.map((j) => ({ nome: nomeCargoJogo(j), cor: j.cor, hoist: false, permissions: [] })),
  ];
  for (const c of desejados) {
    if (cargoPorNome(guild, c.nome)) continue;
    await guild.roles.create({ name: c.nome, colors: { primaryColor: c.cor }, hoist: c.hoist, permissions: c.permissions, mentionable: true });
    relatorio.push(`➕ cargo ${c.nome}`);
  }
}

async function garantirCanais(guild: Guild, relatorio: string[]) {
  const doPlano = new Set<string>();

  for (const cat of PLANO) {
    let categoria = guild.channels.cache.find(
      (c): c is CategoryChannel => c.type === ChannelType.GuildCategory && c.name === cat.nome,
    );
    if (!categoria) {
      categoria = await guild.channels.create({
        name: cat.nome,
        type: ChannelType.GuildCategory,
        permissionOverwrites: permissoes(guild, cat.acesso),
      });
      relatorio.push(`➕ categoria ${cat.nome}`);
    }
    doPlano.add(categoria.id);

    for (const canal of cat.canais) {
      const tipo = canal.voz ? ChannelType.GuildVoice : ChannelType.GuildText;
      let existente = guild.channels.cache.find((c) => c.type === tipo && c.name === canal.nome);
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
      } else if (existente.parentId !== categoria.id && 'setParent' in existente) {
        await existente.setParent(categoria.id, { lockPermissions: false });
      }
      doPlano.add(existente.id);
    }
  }
  return doPlano;
}

async function jaPostou(canal: TextChannel, titulo: string) {
  const msgs = await canal.messages.fetch({ limit: 20 });
  return msgs.some((m) => m.author.id === canal.client.user.id && m.embeds[0]?.title === titulo);
}

async function postarMensagensFixas(guild: Guild, relatorio: string[]) {
  const regras = canalTexto(guild, CANAIS.regras);
  if (regras && !(await jaPostou(regras, `📜 Regras da ${NOME_SERVIDOR}`))) {
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`📜 Regras da ${NOME_SERVIDOR}`)
      .setDescription(REGRAS.map((r, n) => `**${n + 1}.** ${r}`).join('\n'))
      .setFooter({ text: 'Comandos do bot: /ajuda' });
    await regras.send({ embeds: [embed] });
    relatorio.push('📌 regras postadas');
  }

  const escolha = canalTexto(guild, CANAIS.escolhaJogos);
  if (escolha && !(await jaPostou(escolha, '🎮 Escolha seus jogos'))) {
    await escolha.send(painelDeCargos());
    relatorio.push('📌 painel de jogos postado');
  }
}

export const setup: Comando = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Monta (ou completa) a estrutura do servidor: cargos, categorias, canais e painéis.')
    .addBooleanOption((o) => o.setName('renomear').setDescription(`Renomear o servidor para "${NOME_SERVIDOR}" (padrão: sim)`))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild),

  async executar(i) {
    const guild = i.guild!;
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const relatorio: string[] = [];

    if ((i.options.getBoolean('renomear') ?? true) && guild.name !== NOME_SERVIDOR) {
      await guild.setName(NOME_SERVIDOR);
      relatorio.push(`✏️ servidor renomeado para ${NOME_SERVIDOR}`);
    }

    await garantirCargos(guild, relatorio);
    const doPlano = await garantirCanais(guild, relatorio);

    const afk = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice && c.name === '💤 AFK');
    if (afk && guild.afkChannelId !== afk.id) await guild.setAFKChannel(afk.id);

    // Quem já está no servidor vira Maluco; quem rodou o setup vira Taverneiro.
    const membro = cargoPorNome(guild, CARGOS.membro.nome);
    const admin = cargoPorNome(guild, CARGOS.admin.nome);
    const membros = await guild.members.fetch();
    let novos = 0;
    for (const m of membros.values()) {
      if (m.user.bot || !membro || m.roles.cache.has(membro.id)) continue;
      await m.roles.add(membro).catch(() => {});
      novos++;
    }
    if (novos) relatorio.push(`🤪 cargo ${CARGOS.membro.nome} dado a ${novos} membro(s)`);
    if (admin) await membros.get(i.user.id)?.roles.add(admin).catch(() => {});

    await postarMensagensFixas(guild, relatorio);

    // Canais antigos não são apagados: só listados para você decidir.
    const temporarias = new Set(
      (db.prepare('SELECT canal_id FROM calls_temporarias WHERE guild_id = ?').all(guild.id) as { canal_id: string }[]).map(
        (r) => r.canal_id,
      ),
    );
    const fora = guild.channels.cache.filter(
      (c: GuildBasedChannel) => !doPlano.has(c.id) && !temporarias.has(c.id) && c.type !== ChannelType.GuildCategory,
    );

    const linhas = [
      relatorio.length ? relatorio.join('\n') : '✅ Tudo já estava no lugar.',
      fora.size
        ? `\n**Canais fora do plano (não mexi):** ${fora.map((c) => `<#${c.id}>`).join(' ')}\nApague ou mova os que não usar mais.`
        : '',
      `\nDê o cargo **${CARGOS.mestre.nome}** a quem narra o RPG.`,
    ];
    return i.editReply(linhas.join('\n').slice(0, 1900));
  },
};
