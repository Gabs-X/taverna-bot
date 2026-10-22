import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GuildExplicitContentFilter,
  GuildFeature,
  GuildVerificationLevel,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type PartialGuildMember,
} from 'discord.js';
import { ATIVIDADES, CANAIS, CARGOS, JOGOS, NOME_SERVIDOR, REGRAS, nomeCargoAtividade, nomeCargoJogo } from '../config.ts';
import { db } from '../db.ts';
import { canalTexto, cargoPorNome } from '../lib/servidor.ts';
import type { HandlerBotao, HandlerModal, HandlerSelecao } from '../tipos.ts';
import { salvarAniversario } from './agenda.ts';
import { registrar } from './registro.ts';

// Verificação: sem o cargo base (🪑 Freguês) a pessoa só vê #verificacao. Lá, o botão abre o formulário do bot
// (jogos, atividades, subgrupos públicos e parabéns, tudo obrigatório); ao concluir, ganha os cargos escolhidos e
// o Freguês, que libera o servidor. Quem já é Freguês pode abrir de novo para trocar as escolhas.

export const TITULO_VERIFICACAO = `✅ Bem-vindo(a) à ${NOME_SERVIDOR}!`;

type Opcao = { valor: string; rotulo: string; emoji: string; descricao: string; cargo: string };

const DESCRICAO_JOGO: Record<string, string> = { cobblemon: 'Libera a categoria do Farbound, servidor de Cobblemon' };

const opcoesJogos = (): Opcao[] => [
  ...JOGOS.map((j) => ({ valor: j.id, rotulo: j.nome, emoji: j.emoji, descricao: DESCRICAO_JOGO[j.id] ?? 'Recebe os chamados do /lfg', cargo: nomeCargoJogo(j) })),
  { valor: 'rpg', rotulo: 'D&D 3.5', emoji: '⚔️', descricao: 'Libera a mesa de RPG de D&D 3.5', cargo: CARGOS.aventureiro.nome },
  { valor: 'daggerheart', rotulo: 'Daggerheart', emoji: '🌗', descricao: 'Libera a mesa de RPG de Daggerheart', cargo: CARGOS.daggerheart.nome },
];
const opcoesAtividades = (): Opcao[] =>
  ATIVIDADES.map((a) => ({ valor: a.id, rotulo: a.nome, emoji: a.emoji, descricao: a.topico, cargo: nomeCargoAtividade(a) }));

type GrupoAberto = { id: number; nome: string; emoji: string; descricao: string; cargo_id: string };
const gruposAbertos = (guild: Guild) =>
  (db.prepare('SELECT id, nome, emoji, descricao, cargo_id FROM grupos WHERE guild_id = ? AND aberto = 1 ORDER BY nome').all(guild.id) as GrupoAberto[])
    .filter((g) => guild.roles.cache.has(g.cargo_id))
    .slice(0, 24);

/** Mensagem fixa de #verificacao: regras e o botão do formulário. */
export function painelVerificacao() {
  const embed = new EmbedBuilder()
    .setColor(0x3ba55d)
    .setTitle(TITULO_VERIFICACAO)
    .setDescription(
      'Para liberar o servidor, responda o formulário rapidinho: seus jogos, as atividades do bot que você quer ver, ' +
        'se quer entrar em algum subgrupo e se quer parabéns no aniversário.\n\n' +
        `**📜 Regras**\n${REGRAS.map((r, n) => `**${n + 1}.** ${r}`).join('\n')}\n\n` +
        'Respondendo, você concorda com as regras. Dá para mudar as escolhas depois, é só clicar de novo.',
    );
  const botao = new ButtonBuilder().setCustomId('form:abrir').setLabel('Responder formulário').setEmoji('📝').setStyle(ButtonStyle.Success);
  return { embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(botao)] };
}

// Respostas em andamento (usuário → escolhas), até clicar em Concluir.
type Respostas = { jogos: string[]; atividades: string[]; grupos: string[]; parabens?: 'sim' | 'nao' };
const emAndamento = new Map<string, Respostas>();

function menu(id: string, placeholder: string, opcoes: Opcao[], escolhidos: string[], minimo: number) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`formsel:${id}`)
      .setPlaceholder(placeholder)
      .setMinValues(minimo)
      .setMaxValues(opcoes.length)
      .addOptions(
        opcoes.map((o) => ({ label: o.rotulo.slice(0, 100), value: o.valor, emoji: o.emoji, description: o.descricao.slice(0, 100), default: escolhidos.includes(o.valor) })),
      ),
  );
}

async function abrir(i: ButtonInteraction) {
  const membro = i.member as GuildMember;
  const tem = (nome: string) => !!cargoPorNome(i.guild!, nome) && membro.roles.cache.has(cargoPorNome(i.guild!, nome)!.id);
  const grupos = gruposAbertos(i.guild!);
  const parabens = cargoPorNome(i.guild!, CARGOS.aniversario.nome);
  const jaVerificado = tem(CARGOS.membro.nome);
  // Começa com o que a pessoa já tem (quem refaz o formulário só troca o que quiser).
  const r: Respostas = {
    jogos: opcoesJogos().filter((o) => tem(o.cargo)).map((o) => o.valor),
    atividades: opcoesAtividades().filter((o) => tem(o.cargo)).map((o) => o.valor),
    grupos: grupos.filter((g) => membro.roles.cache.has(g.cargo_id)).map((g) => String(g.id)),
    parabens: jaVerificado ? (parabens && membro.roles.cache.has(parabens.id) ? 'sim' : 'nao') : undefined,
  };
  emAndamento.set(i.user.id, r);

  const linhas = [
    menu('jogos', '🎮 Quais jogos você joga? (escolha pelo menos 1)', opcoesJogos(), r.jogos, 1),
    menu('atividades', '🎉 Quais atividades do bot você quer ver? (pelo menos 1)', opcoesAtividades(), r.atividades, 1),
  ];
  if (grupos.length) {
    const opcoes = grupos.map((g) => ({ valor: String(g.id), rotulo: g.nome, emoji: g.emoji, descricao: g.descricao || 'Subgrupo aberto da galera', cargo: '' }));
    linhas.push(menu('grupos', '👥 Quer entrar em algum subgrupo? (opcional)', opcoes, r.grupos, 0));
  }
  // Escolha única: sim ou não.
  linhas.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('formsel:parabens')
        .setPlaceholder('🎂 Quer parabéns no seu aniversário?')
        .addOptions(
          { label: 'Sim, quero parabéns', value: 'sim', emoji: '🎉', description: 'O bot te chama no privado para salvar a data', default: r.parabens === 'sim' },
          { label: 'Não, valeu', value: 'nao', emoji: '🙅', description: 'Dá para salvar depois com /aniversario definir', default: r.parabens === 'nao' },
        ),
    ),
  );
  const concluir = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('form:concluir').setLabel('Concluir').setEmoji('✅').setStyle(ButtonStyle.Success),
  );
  return i.reply({
    content: '📝 **Formulário da Taverna.** Escolha em cada menu e clique em **Concluir**.',
    components: [...linhas, concluir],
    flags: MessageFlags.Ephemeral,
  });
}

async function concluir(i: ButtonInteraction) {
  const r = emAndamento.get(i.user.id);
  if (!r) return i.reply({ content: 'O formulário expirou. Clique em **Responder formulário** de novo.', flags: MessageFlags.Ephemeral });
  const falta = [!r.jogos.length && 'jogos', !r.atividades.length && 'atividades', !r.parabens && 'parabéns'].filter(Boolean);
  if (falta.length) return i.reply({ content: `Falta responder: **${falta.join(', ')}**.`, flags: MessageFlags.Ephemeral });

  const guild = i.guild!;
  const membro = i.member as GuildMember;
  const id = (nome: string) => cargoPorNome(guild, nome)?.id;
  const grupos = gruposAbertos(guild);
  // Todos os cargos que o formulário controla, e os escolhidos entre eles.
  const controlados = [
    ...opcoesJogos().map((o) => id(o.cargo)),
    ...opcoesAtividades().map((o) => id(o.cargo)),
    ...grupos.map((g) => g.cargo_id),
    id(CARGOS.aniversario.nome),
    id(CARGOS.membro.nome),
  ].filter((x): x is string => !!x);
  const escolhidos = [
    ...opcoesJogos().filter((o) => r.jogos.includes(o.valor)).map((o) => id(o.cargo)),
    ...opcoesAtividades().filter((o) => r.atividades.includes(o.valor)).map((o) => id(o.cargo)),
    ...grupos.filter((g) => r.grupos.includes(String(g.id))).map((g) => g.cargo_id),
    r.parabens === 'sim' ? id(CARGOS.aniversario.nome) : undefined,
    id(CARGOS.membro.nome),
  ].filter((x): x is string => !!x);
  const novos = [...membro.roles.cache.keys()].filter((c) => c !== guild.id && !controlados.includes(c));
  const primeiraVez = !membro.roles.cache.has(id(CARGOS.membro.nome) ?? '');

  await i.deferUpdate();
  await membro.roles.set([...new Set([...novos, ...escolhidos])], 'Formulário da Taverna');
  emAndamento.delete(i.user.id);
  registrar({ guild, userId: i.user.id, tipo: 'auto', acao: primeiraVez ? '✅ respondeu o formulário e foi liberado' : '📝 refez o formulário' });
  const geral = canalTexto(guild, CANAIS.geral);
  return i.editReply({
    content: primeiraVez
      ? `✅ Pronto! Agora você é **${CARGOS.membro.nome}** e já vê o servidor.${geral ? ` Chega mais em ${geral}!` : ''}`
      : '✅ Escolhas atualizadas!',
    components: [],
  });
}

export const botaoFormulario: HandlerBotao = {
  prefixo: 'form',
  async executar(i, acao) {
    if (acao === 'abrir') return abrir(i);
    return concluir(i);
  },
};

export const selecaoFormulario: HandlerSelecao = {
  prefixo: 'formsel',
  async executar(i, campo) {
    const r = emAndamento.get(i.user.id);
    if (!r) return i.reply({ content: 'O formulário expirou. Clique em **Responder formulário** de novo.', flags: MessageFlags.Ephemeral });
    if (campo === 'jogos') r.jogos = i.values;
    else if (campo === 'atividades') r.atividades = i.values;
    else if (campo === 'grupos') r.grupos = i.values;
    else if (campo === 'parabens') r.parabens = i.values[0] as 'sim' | 'nao';
    return i.deferUpdate();
  },
};

// ---------- Servidor ----------

/** Liga o modo Comunidade, com #verificacao como canal de regras e #logs recebendo os avisos do Discord. */
export async function garantirComunidade(guild: Guild, relatorio: string[]) {
  if (guild.features.includes(GuildFeature.Community)) return;
  const regras = canalTexto(guild, CANAIS.verificacao) ?? canalTexto(guild, CANAIS.regras);
  const avisos = canalTexto(guild, CANAIS.logs);
  if (!regras || !avisos) return;
  await guild.edit({
    features: [...guild.features, GuildFeature.Community],
    rulesChannel: regras,
    publicUpdatesChannel: avisos,
    verificationLevel: Math.max(guild.verificationLevel, GuildVerificationLevel.Low),
    explicitContentFilter: GuildExplicitContentFilter.AllMembers,
  });
  relatorio.push('🏘️ servidor virou Comunidade');
}

/** O formulário de entrada do próprio Discord exige canais abertos para quem não tem cargo: fica desligado. */
export async function desligarFormularioDoDiscord(guild: Guild, relatorio: string[]) {
  if (!guild.features.includes(GuildFeature.Community)) return;
  const atual = await guild.fetchOnboarding();
  if (!atual.enabled) return;
  await guild.editOnboarding({ enabled: false });
  relatorio.push('📝 formulário de entrada do Discord desligado (agora é o do bot, em #verificacao)');
}

// ---------- Aniversário: quem marcou "quero parabéns" recebe no privado um botão para salvar a data ----------

export async function aoMudarMembro(antes: GuildMember | PartialGuildMember, depois: GuildMember) {
  const cargo = cargoPorNome(depois.guild, CARGOS.aniversario.nome);
  if (!cargo || !depois.roles.cache.has(cargo.id) || antes.roles?.cache.has(cargo.id)) return;
  if (db.prepare('SELECT 1 FROM aniversarios WHERE guild_id = ? AND user_id = ?').get(depois.guild.id, depois.id)) return;
  const botao = new ButtonBuilder().setCustomId(`aniv:${depois.guild.id}`).setLabel('Salvar meu aniversário').setEmoji('🎂').setStyle(ButtonStyle.Primary);
  await depois
    .send({
      content: `🎂 Você marcou no formulário da **${depois.guild.name}** que quer parabéns! Clique para dizer o dia e o mês (sem o ano).`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(botao)],
    })
    .catch(() => {}); // privado fechado: dá para salvar depois com /aniversario definir
}

export const botaoAniversario: HandlerBotao = {
  prefixo: 'aniv',
  async executar(i, guildId) {
    const campo = new TextInputBuilder()
      .setCustomId('data')
      .setLabel('Dia e mês do seu aniversário')
      .setPlaceholder('ex.: 25/12')
      .setStyle(TextInputStyle.Short)
      .setMinLength(3)
      .setMaxLength(5)
      .setRequired(true);
    const modal = new ModalBuilder()
      .setCustomId(`anivm:${guildId}`)
      .setTitle('🎂 Seu aniversário')
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(campo));
    return i.showModal(modal);
  },
};

export const modalAniversario: HandlerModal = {
  prefixo: 'anivm',
  async executar(i, guildId) {
    const m = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})$/.exec(i.fields.getTextInputValue('data').trim());
    if (!m) return i.reply({ content: 'Não entendi a data. Use dia/mês, por exemplo **25/12**. Clique no botão de novo.', flags: MessageFlags.Ephemeral });
    return i.reply({ content: salvarAniversario(guildId, i.user.id, Number(m[1]), Number(m[2])), flags: MessageFlags.Ephemeral });
  },
};
