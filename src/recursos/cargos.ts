import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, type GuildMember } from 'discord.js';
import { CARGOS, JOGOS, nomeCargoJogo } from '../config.ts';
import { cargoPorNome } from '../lib/servidor.ts';
import type { HandlerBotao } from '../tipos.ts';

// Botões que o próprio membro pode ligar/desligar: um por jogo + a mesa de RPG.
const OPCOES = [
  ...JOGOS.map((j) => ({ id: j.id, cargo: nomeCargoJogo(j), rotulo: j.nome, emoji: j.emoji })),
  { id: 'rpg', cargo: CARGOS.aventureiro.nome, rotulo: 'Mesa de RPG', emoji: '⚔️' },
];

export function painelDeCargos() {
  const embed = new EmbedBuilder()
    .setColor(0xf5c542)
    .setTitle('🎮 Escolha seus jogos')
    .setDescription(
      'Clique nos jogos que você joga para liberar o canal de cada um e receber os chamados do `/lfg`.\n' +
        'Clique de novo para tirar. **Mesa de RPG** libera a categoria do D&D.',
    );

  const botoes = OPCOES.map((o) =>
    new ButtonBuilder().setCustomId(`cargo:${o.id}`).setLabel(o.rotulo).setEmoji(o.emoji).setStyle(ButtonStyle.Secondary),
  );
  const linhas: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < botoes.length; i += 5) linhas.push(new ActionRowBuilder<ButtonBuilder>().addComponents(botoes.slice(i, i + 5)));

  return { embeds: [embed], components: linhas };
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
