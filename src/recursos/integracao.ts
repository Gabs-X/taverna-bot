import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  GuildExplicitContentFilter,
  GuildFeature,
  GuildOnboardingMode,
  GuildVerificationLevel,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type Guild,
  type GuildMember,
  type GuildOnboardingPromptData,
  type GuildOnboardingPromptOptionData,
  type PartialGuildMember,
} from 'discord.js';
import { ATIVIDADES, CANAIS, CARGOS, JOGOS, PLANO, nomeCargoAtividade, nomeCargoJogo } from '../config.ts';
import { db } from '../db.ts';
import { canalPorNome, canalTexto, cargoPorNome } from '../lib/servidor.ts';
import type { HandlerBotao, HandlerModal } from '../tipos.ts';
import { salvarAniversario } from './agenda.ts';

// Formulário de entrada (Integração do Discord): quem entra responde, obrigatoriamente, jogos, atividades,
// subgrupos públicos e se quer parabéns. Cada resposta dá um cargo. Só existe em servidor Comunidade.

const PERGUNTAS = {
  jogos: '🎮 Quais jogos você joga?',
  atividades: '🎉 Quais atividades do bot você quer ver?',
  grupos: '👥 Quer entrar em algum subgrupo público?',
  aniversario: '🎂 Quer que a galera te dê parabéns no seu aniversário?',
};

const DESCRICAO_JOGO: Record<string, string> = {
  cobblemon: 'Libera a categoria do Farbound, servidor de Cobblemon',
};

/** Liga o modo Comunidade (exigido pelo formulário de entrada), com #regras e #logs como canais do Discord. */
export async function garantirComunidade(guild: Guild, relatorio: string[]) {
  if (guild.features.includes(GuildFeature.Community)) return;
  const regras = canalTexto(guild, CANAIS.regras);
  const avisos = canalTexto(guild, CANAIS.logs);
  if (!regras || !avisos) return;
  await guild.edit({
    features: [...guild.features, GuildFeature.Community],
    rulesChannel: regras,
    publicUpdatesChannel: avisos,
    verificationLevel: Math.max(guild.verificationLevel, GuildVerificationLevel.Low),
    explicitContentFilter: GuildExplicitContentFilter.AllMembers,
  });
  relatorio.push('🏘️ servidor virou Comunidade (exigido pelo formulário de entrada)');
}

type GrupoAberto = { nome: string; emoji: string; descricao: string; cargo_id: string };

/** Monta (ou atualiza) as perguntas do formulário de entrada. Chamado pelo /setup e quando um subgrupo muda. */
export async function garantirIntegracao(guild: Guild): Promise<string | undefined> {
  if (!guild.features.includes(GuildFeature.Community)) return undefined;
  const atual = await guild.fetchOnboarding();
  // Reaproveita os ids das perguntas e opções que já existem, para não perder as respostas de quem já entrou.
  const idPergunta = (titulo: string) => atual.prompts.find((p) => p.title === titulo)?.id;
  const idOpcao = (pergunta: string, titulo: string) => atual.prompts.find((p) => p.title === pergunta)?.options.find((o) => o.title === titulo)?.id;
  const opcao = (pergunta: string, o: GuildOnboardingPromptOptionData): GuildOnboardingPromptOptionData => ({
    ...o,
    title: o.title.slice(0, 50),
    description: o.description?.slice(0, 100) || null,
    id: idOpcao(pergunta, o.title.slice(0, 50)),
  });
  const comCargo = (nome: string) => cargoPorNome(guild, nome)?.id;

  const jogos = [
    ...JOGOS.map((j) => ({ title: j.nome, emoji: j.emoji, cargo: comCargo(nomeCargoJogo(j)), description: DESCRICAO_JOGO[j.id] ?? 'Recebe os chamados do /lfg' })),
    { title: 'D&D 3.5', emoji: '⚔️', cargo: comCargo(CARGOS.aventureiro.nome), description: 'Libera a mesa de RPG de D&D 3.5' },
    { title: 'Daggerheart', emoji: '🌗', cargo: comCargo(CARGOS.daggerheart.nome), description: 'Libera a mesa de RPG de Daggerheart' },
  ];
  const atividades = ATIVIDADES.map((a) => ({ title: a.nome, emoji: a.emoji, cargo: comCargo(nomeCargoAtividade(a)), description: a.topico }));
  const grupos = (db.prepare('SELECT nome, emoji, descricao, cargo_id FROM grupos WHERE guild_id = ? AND aberto = 1 ORDER BY nome').all(guild.id) as GrupoAberto[])
    .filter((g) => guild.roles.cache.has(g.cargo_id))
    .slice(0, 49);
  const subgrupos = canalTexto(guild, CANAIS.subgrupos);
  const geral = canalTexto(guild, CANAIS.geral);
  const parabens = comCargo(CARGOS.aniversario.nome);

  const prompts: GuildOnboardingPromptData[] = [];
  const pergunta = (titulo: string, singleSelect: boolean, opcoes: GuildOnboardingPromptOptionData[]) => {
    if (opcoes.length) prompts.push({ id: idPergunta(titulo), title: titulo, singleSelect, required: true, inOnboarding: true, options: opcoes.map((o) => opcao(titulo, o)) });
  };
  pergunta(PERGUNTAS.jogos, false, jogos.filter((j) => j.cargo).map((j) => ({ title: j.title, emoji: j.emoji, description: j.description, roles: [j.cargo!] })));
  pergunta(PERGUNTAS.atividades, false, atividades.filter((a) => a.cargo).map((a) => ({ title: a.title, emoji: a.emoji, description: a.description, roles: [a.cargo!] })));
  if (grupos.length && subgrupos) {
    pergunta(PERGUNTAS.grupos, false, [
      ...grupos.map((g) => ({ title: g.nome, emoji: g.emoji, description: g.descricao || 'Subgrupo aberto da galera', roles: [g.cargo_id] })),
      { title: 'Nenhum por enquanto', emoji: '👀', description: `Dá para entrar depois em #${subgrupos.name}`, channels: [subgrupos.id] },
    ]);
  }
  if (parabens && geral) {
    pergunta(PERGUNTAS.aniversario, true, [
      { title: 'Sim, quero parabéns', emoji: '🎉', description: 'O bot te chama no privado para salvar a data', roles: [parabens] },
      { title: 'Não, valeu', emoji: '🙅', description: 'Dá para salvar depois com /aniversario definir', channels: [geral.id] },
    ]);
  }

  // Canais que todo mundo vê já de cara: os públicos do plano (sem cargo).
  const todos = guild.roles.everyone;
  const padrao = PLANO.filter((c) => !c.acesso)
    .flatMap((c) => c.canais.filter((canal) => !canal.acesso || canal.acesso.tipo !== 'cargo' && canal.acesso.tipo !== 'staff'))
    .map((canal) => canalPorNome(guild, canal.nome, canal.voz ? ChannelType.GuildVoice : ChannelType.GuildText))
    .filter((c) => c && c.permissionsFor(todos)?.has(PermissionFlagsBits.ViewChannel))
    .map((c) => c!.id);

  await guild.editOnboarding({ prompts, defaultChannels: padrao, enabled: true, mode: GuildOnboardingMode.OnboardingDefault });
  return `📝 formulário de entrada com ${prompts.length} perguntas obrigatórias`;
}

// ---------- Aniversário: quem marcou "quero parabéns" recebe no privado um botão para salvar a data ----------

export async function aoMudarMembro(antes: GuildMember | PartialGuildMember, depois: GuildMember) {
  const cargo = cargoPorNome(depois.guild, CARGOS.aniversario.nome);
  if (!cargo || !depois.roles.cache.has(cargo.id) || antes.roles?.cache.has(cargo.id)) return;
  if (db.prepare('SELECT 1 FROM aniversarios WHERE guild_id = ? AND user_id = ?').get(depois.guild.id, depois.id)) return;
  const botao = new ButtonBuilder().setCustomId(`aniv:${depois.guild.id}`).setLabel('Salvar meu aniversário').setEmoji('🎂').setStyle(ButtonStyle.Primary);
  await depois
    .send({
      content: `🎂 Você marcou na entrada da **${depois.guild.name}** que quer parabéns! Clique para dizer o dia e o mês (sem o ano).`,
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
