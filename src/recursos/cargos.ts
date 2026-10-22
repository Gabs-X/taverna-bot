import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, type GuildMember } from 'discord.js';
import { ATIVIDADES, CARGOS, JOGOS, nomeCargoAtividade, nomeCargoJogo } from '../config.ts';
import { cargoPorNome } from '../lib/servidor.ts';
import type { HandlerBotao } from '../tipos.ts';

// Botões que o próprio membro pode ligar/desligar: um por jogo, as mesas de RPG e as atividades do bot.
const OPCOES = [
  ...JOGOS.map((j) => ({ id: j.id, cargo: nomeCargoJogo(j), rotulo: j.nome, emoji: j.emoji })),
  { id: 'rpg', cargo: CARGOS.aventureiro.nome, rotulo: 'D&D 3.5', emoji: '⚔️' },
  { id: 'daggerheart', cargo: CARGOS.daggerheart.nome, rotulo: 'Daggerheart', emoji: '🌗' },
  ...ATIVIDADES.map((a) => ({ id: `atv-${a.id}`, cargo: nomeCargoAtividade(a), rotulo: a.nome, emoji: a.emoji })),
];

const botoesEmLinhas = (botoes: ButtonBuilder[]) => {
  const linhas: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < botoes.length; i += 5) linhas.push(new ActionRowBuilder<ButtonBuilder>().addComponents(botoes.slice(i, i + 5)));
  return linhas;
};

export function painelDeCargos() {
  const embed = new EmbedBuilder()
    .setColor(0xf5c542)
    .setTitle('🎮 Escolha seus jogos')
    .setDescription(
      'Clique nos jogos que você joga para liberar o canal de cada um e receber os chamados do `/lfg`.\n' +
        'Clique de novo para tirar. **D&D 3.5** e **Daggerheart** liberam a categoria de cada mesa de RPG.',
    );

  const botoes = OPCOES.filter((o) => !o.id.startsWith('atv-')).map((o) =>
    new ButtonBuilder().setCustomId(`cargo:${o.id}`).setLabel(o.rotulo).setEmoji(o.emoji).setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: botoesEmLinhas(botoes) };
}

export function painelDeAtividades() {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('🎉 Desbloqueie as atividades')
    .setDescription(
      'Cada atividade do bot tem um canal próprio, que só aparece para quem desbloquear. Clique para liberar; clique de novo para esconder.\n\n' +
        ATIVIDADES.map((a) => `${a.emoji} **${a.nome}**: ${a.topico}`).join('\n'),
    );
  const botoes = ATIVIDADES.map((a) =>
    new ButtonBuilder().setCustomId(`cargo:atv-${a.id}`).setLabel(a.nome).setEmoji(a.emoji).setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: botoesEmLinhas(botoes) };
}

export const botaoCargo: HandlerBotao = {
  prefixo: 'cargo',
  async executar(i, id) {
    const opcao = OPCOES.find((o) => o.id === id);
    const cargo = opcao && i.guild ? cargoPorNome(i.guild, opcao.cargo) : undefined;
    if (!opcao || !cargo) {
      return i.reply({ content: 'Esse cargo não existe mais. Peça a um admin para rodar `/setup`.', flags: MessageFlags.Ephemeral });
    }

    const membro = i.member as GuildMember;
    if (membro.roles.cache.has(cargo.id)) {
      await membro.roles.remove(cargo);
      return i.reply({ content: `Tirei **${opcao.rotulo}** de você.`, flags: MessageFlags.Ephemeral });
    }
    await membro.roles.add(cargo);
    return i.reply({ content: `${opcao.emoji} Agora você tem **${opcao.rotulo}**.`, flags: MessageFlags.Ephemeral });
  },
};
