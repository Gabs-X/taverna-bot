import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { ehAdmin } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';
import { duelosEmAndamento } from './goticaSocial.ts';
import { quizzesEmAndamento } from './quiz.ts';

// Código de saída que o supervisor entende como "reinício pedido" (volta na hora, sem contar como queda).
export const CODIGO_REINICIO = 99;

export const reiniciar: Comando = {
  data: new SlashCommandBuilder()
    .setName('reiniciar')
    .setDescription('(Dono e admin) Reinicia o bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .addBooleanOption((o) => o.setName('agora').setDescription('Reinicia mesmo com duelo ou quiz em andamento')),

  async executar(i) {
    if (!ehAdmin(i.guild!, i.user.id)) return i.reply({ content: 'Só o Dono e os admins reiniciam o bot.', flags: MessageFlags.Ephemeral });
    // Sem o supervisor (ex.: npm start no terminal), o bot sairia e não voltaria sozinho.
    if (!process.env.TAVERNA_SUPERVISOR) {
      return i.reply({ content: 'Não estou rodando pelo supervisor (`npm run servico:iniciar`), então se eu desligar não volto sozinho. Reinicie pelo terminal.', flags: MessageFlags.Ephemeral });
    }
    const ocupado = [
      duelosEmAndamento() && `${duelosEmAndamento()} duelo(s)`,
      quizzesEmAndamento() && `${quizzesEmAndamento()} quiz(zes)`,
    ].filter(Boolean);
    if (ocupado.length && !i.options.getBoolean('agora')) {
      return i.reply({ content: `⏸️ Tem coisa rolando: ${ocupado.join(', ')}. Isso para se eu reiniciar. Use \`/reiniciar agora:true\` para reiniciar mesmo assim.`, flags: MessageFlags.Ephemeral });
    }
    await i.reply({ content: '🔄 Reiniciando... volto em uns 10 segundos.', flags: MessageFlags.Ephemeral });
    console.log(`🔄 Reinício pedido no Discord por ${i.user.tag}.`);
    // Espera o log da interação chegar ao #logs antes de sair.
    setTimeout(() => process.exit(CODIGO_REINICIO), 5_000);
  },
};
