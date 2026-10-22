import { EmbedBuilder, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { gerarLoot, gerarNome, gerarNpc, gerarTaverna, RACAS } from '../lib/gerador.ts';
import type { Comando } from '../tipos.ts';
import { AMBIENTES, executarAmbiente, type Ambiente } from './musica.ts';

// Ferramentas do Mestre para as mesas de RPG: gerador de NPC, taverna, tesouro e nome, e trilha sonora na call.

export const gerar: Comando = {
  data: new SlashCommandBuilder()
    .setName('gerar')
    .setDescription('Gera NPC, taverna, tesouro ou nome na hora (para o Mestre)')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('npc').setDescription('Um NPC com jeito, aparência e um segredo'))
    .addSubcommand((s) => s.setName('taverna').setDescription('Uma taverna com dono, cardápio e um rumor'))
    .addSubcommand((s) =>
      s.setName('loot').setDescription('Tesouro para o grupo')
        .addIntegerOption((o) => o.setName('nivel').setDescription('Nível do grupo (1 a 20)').setRequired(true).setMinValue(1).setMaxValue(20)),
    )
    .addSubcommand((s) =>
      s.setName('nome').setDescription('Nomes de personagem')
        .addStringOption((o) => o.setName('raca').setDescription('Raça (padrão: sorteada)').addChoices(...RACAS.map((r) => ({ name: r, value: r })))),
    ),

  async executar(i) {
    const sub = i.options.getSubcommand();
    const embed = new EmbedBuilder().setColor(0x8e44ad);

    if (sub === 'npc') {
      const n = gerarNpc();
      embed
        .setTitle(`🧑 ${n.nome}`)
        .setDescription(`${n.raca} · ${n.profissao}\n**Jeito:** ${n.jeito}\n**Marca:** ${n.aparencia}`)
        .addFields({ name: '🤫 Segredo (só o Mestre lê)', value: `||${n.segredo}||` });
    } else if (sub === 'taverna') {
      const t = gerarTaverna();
      embed
        .setTitle(`🍺 ${t.nome}`)
        .setDescription(`**Dono:** ${t.dono.nome}, ${t.dono.raca.toLowerCase()} ${t.dono.jeito}\n**Prato da casa:** ${t.prato}\n**Bebida:** ${t.bebida}\n**Preços:** ${t.preco}`)
        .addFields({ name: '👂 Rumor que se ouve no balcão', value: t.rumor });
    } else if (sub === 'loot') {
      const l = gerarLoot(i.options.getInteger('nivel', true));
      embed
        .setTitle(`💰 Tesouro (grupo nível ${l.nivel})`)
        .addFields(
          { name: 'Moedas', value: l.moedas },
          { name: 'Gemas', value: l.gemas.join('\n') || '—', inline: true },
          { name: 'Objetos de arte', value: l.objetos.join('\n') || '—', inline: true },
          { name: '✨ Itens mágicos', value: l.magicos.join('\n') || '—' },
        );
    } else {
      const raca = i.options.getString('raca') ?? RACAS[Math.floor(Math.random() * RACAS.length)];
      const nomes = Array.from({ length: 6 }, () => gerarNome(raca));
      embed.setTitle(`📜 Nomes · ${raca}`).setDescription(nomes.map((n) => `• ${n}`).join('\n'));
    }
    return i.reply({ embeds: [embed] });
  },
};

export const ambiente: Comando = {
  data: new SlashCommandBuilder()
    .setName('ambiente')
    .setDescription('Trilha sonora da mesa: toca em loop na sua call, com volume baixo')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o.setName('tipo').setDescription('Clima da cena').setRequired(true).addChoices(
        ...Object.entries(AMBIENTES).map(([value, a]) => ({ name: a.nome, value })),
        { name: '🔇 Parar', value: 'parar' },
      ),
    ),
  executar: (i) => executarAmbiente(i, i.options.getString('tipo', true) as Ambiente | 'parar'),
};
