import { EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { acharArma, sugerirArmas, textoMods, type Classe } from '../lib/drg.ts';
import type { Comando } from '../tipos.ts';

// /drg build: opções de build de cada arma de Deep Rock Galactic (dados em lib/drg.ts). Rock and Stone!

const COR: Record<Classe, number> = { Driller: 0xf5b800, Engineer: 0xc0392b, Gunner: 0x2e86c1, Scout: 0x27ae60 };
const EMOJI: Record<Classe, string> = { Driller: '🔥', Engineer: '🔧', Gunner: '💥', Scout: '🔦' };

export const drg: Comando = {
  data: new SlashCommandBuilder()
    .setName('drg')
    .setDescription('Deep Rock Galactic: opções de build das armas')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('build')
        .setDescription('Opções de build (overclock e mods) de uma arma')
        .addStringOption((o) => o.setName('arma').setDescription('Nome da arma (o Discord sugere enquanto você digita)').setRequired(true).setAutocomplete(true)),
    ),

  async autocompletar(i) {
    const texto = String(i.options.getFocused());
    return i.respond(sugerirArmas(texto).map((a) => ({ name: `${EMOJI[a.classe]} ${a.nome} · ${a.classe} (${a.tipo})`.slice(0, 100), value: a.nome })));
  },

  async executar(i) {
    const arma = acharArma(i.options.getString('arma', true));
    if (!arma) return i.reply({ content: 'Não achei essa arma. Comece a digitar e escolha uma da lista. ⛏️', flags: MessageFlags.Ephemeral });

    const embed = new EmbedBuilder()
      .setColor(COR[arma.classe])
      .setTitle(`${EMOJI[arma.classe]} ${arma.nome}`)
      .setDescription(`**${arma.classe}** · arma ${arma.tipo} · ${arma.builds.length} ${arma.builds.length === 1 ? 'opção' : 'opções'} de build`)
      .addFields(
        arma.builds.map((b, k) => ({
          name: `${k + 1}. ⚙️ ${b.overclock}`,
          value: `${b.mods ? `Mods: \`${textoMods(b.mods)}\`` : 'Mods: livres (o guia não fecha a combinação)'}\n${b.quando}`,
        })),
      )
      .setFooter({ text: 'Letras: A = 1ª opção da linha do nível, da esquerda. Fonte: guias da comunidade (Season 5/6). Rock and Stone!' });
    return i.reply({ embeds: [embed] });
  },
};
