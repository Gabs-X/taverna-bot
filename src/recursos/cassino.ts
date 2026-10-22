import { InteractionContextType, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { db } from '../db.ts';
import {
  APOSTA_MINIMA,
  girarRoleta,
  girarSlots,
  jogarMoeda,
  PAGA_MOEDA,
  premio,
  SIMBOLOS,
  type ApostaRoleta,
  type Lado,
} from '../lib/cassino.ts';
import { diaDe } from '../lib/palavra.ts';
import { emoji } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';
import { contar, verificarConquistas } from './conquistas.ts';
import { carteira, darMoedas, gastarMoedas, moedas } from './economia.ts';
import { apostaAcimaDoLimite, limitesApostas } from './limitesApostas.ts';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const apostadoHoje = (g: string, u: string) =>
  (db.prepare('SELECT apostado FROM cassino_dia WHERE guild_id = ? AND user_id = ? AND dia = ?').get(g, u, diaDe(Date.now())) as { apostado: number } | undefined)?.apostado ?? 0;

/** Confere limite e saldo e desconta a aposta. Devolve o motivo se não der. */
function cobrar(i: ChatInputCommandInteraction, aposta: number): string | undefined {
  const g = i.guildId!;
  const u = i.user.id;
  const hoje = apostadoHoje(g, u);
  const acima = apostaAcimaDoLimite(i.guild, aposta);
  if (acima) return acima;
  const limite = limitesApostas(g).cassinoDia;
  if (hoje + aposta > limite) return `🛑 Limite do dia: você já apostou ${moedas(i.guild, hoje)} de ${moedas(i.guild, limite)}. Volta amanhã!`;
  if (!gastarMoedas(g, u, aposta)) return `Saldo insuficiente: você tem ${moedas(i.guild, carteira(g, u).moedas)}.`;
  db.prepare('INSERT INTO cassino_dia (guild_id, user_id, dia, apostado) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET apostado = apostado + excluded.apostado').run(g, u, diaDe(Date.now()), aposta);
  return undefined;
}

const resultado = (i: ChatInputCommandInteraction, aposta: number, ganho: number) =>
  ganho > 0
    ? `🎉 Ganhou **${moedas(i.guild, ganho)}** (apostou ${moedas(i.guild, aposta)}).`
    : `💸 Perdeu ${moedas(i.guild, aposta)}. A casa agradece.`;

export const cassino: Comando = {
  data: new SlashCommandBuilder()
    .setName('cassino')
    .setDescription('Aposta moedas da Taverna (com limite por dia)')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s.setName('moeda').setDescription(`Cara ou coroa: acertou, leva ${PAGA_MOEDA}x`)
        .addStringOption((o) => o.setName('lado').setDescription('Cara ou coroa').setRequired(true).addChoices({ name: 'Cara', value: 'cara' }, { name: 'Coroa', value: 'coroa' }))
        .addIntegerOption((o) => o.setName('aposta').setDescription('Quantas moedas').setRequired(true).setMinValue(APOSTA_MINIMA)),
    )
    .addSubcommand((s) =>
      s.setName('slots').setDescription('Caça-níquel: três iguais pagam até 100x (três moedas = jackpot)')
        .addIntegerOption((o) => o.setName('aposta').setDescription('Quantas moedas').setRequired(true).setMinValue(APOSTA_MINIMA)),
    )
    .addSubcommand((s) =>
      s.setName('roleta').setDescription('Roleta: cor paga 2x, verde 14x, número exato 36x')
        .addStringOption((o) =>
          o.setName('em').setDescription('Onde apostar').setRequired(true).addChoices(
            { name: '🔴 Vermelho (2x)', value: 'vermelho' },
            { name: '⚫ Preto (2x)', value: 'preto' },
            { name: '🟢 Verde, o zero (14x)', value: 'verde' },
            { name: '🔢 Um número (36x)', value: 'numero' },
          ),
        )
        .addIntegerOption((o) => o.setName('aposta').setDescription('Quantas moedas').setRequired(true).setMinValue(APOSTA_MINIMA))
        .addIntegerOption((o) => o.setName('numero').setDescription('Se apostou em número: de 0 a 36').setMinValue(0).setMaxValue(36)),
    )
    .addSubcommand((s) => s.setName('limite').setDescription('Quanto você ainda pode apostar hoje')),

  async executar(i) {
    const g = i.guildId!;
    const u = i.user.id;
    const sub = i.options.getSubcommand();

    if (sub === 'limite') {
      const hoje = apostadoHoje(g, u);
      return i.reply({ content: `🎰 Hoje você apostou ${moedas(i.guild, hoje)}. Ainda pode ${moedas(i.guild, Math.max(0, limitesApostas(i.guildId!).cassinoDia - hoje))}.`, flags: MessageFlags.Ephemeral });
    }

    const aposta = i.options.getInteger('aposta', true);
    if (sub === 'roleta' && i.options.getString('em', true) === 'numero' && i.options.getInteger('numero') === null) {
      return i.reply({ content: 'Apostando em número? Escolha qual na opção `numero` (0 a 36).', flags: MessageFlags.Ephemeral });
    }
    const erro = cobrar(i, aposta);
    if (erro) return i.reply({ content: erro, flags: MessageFlags.Ephemeral });

    if (sub === 'moeda') {
      const r = jogarMoeda(i.options.getString('lado', true) as Lado);
      const ganho = premio(aposta, r.multiplicador);
      if (ganho) darMoedas(g, u, ganho);
      return i.reply(`🪙 ${i.user} jogou a moeda... deu **${r.saiu}**! ${resultado(i, aposta, ganho)}`);
    }

    if (sub === 'roleta') {
      const em = i.options.getString('em', true) as ApostaRoleta;
      const numero = i.options.getInteger('numero');
      const r = girarRoleta(em, numero);
      const ganho = premio(aposta, r.multiplicador);
      if (ganho) darMoedas(g, u, ganho);
      const bola = { vermelho: '🔴', preto: '⚫', verde: '🟢' }[r.cor];
      await i.reply(`🎡 ${i.user} apostou em **${em === 'numero' ? `número ${numero}` : em}**. A roleta gira...`);
      await esperar(2000);
      return i.editReply(`🎡 ${i.user} apostou em **${em === 'numero' ? `número ${numero}` : em}**. Caiu no ${bola} **${r.saiu}**! ${resultado(i, aposta, ganho)}`);
    }

    // slots, com os rolos parando um de cada vez
    const r = girarSlots();
    const ganho = premio(aposta, r.multiplicador);
    if (ganho) darMoedas(g, u, ganho);
    const icone = (k: number) => emoji(i.guild, r.rolos[k].emoji, r.rolos[k].reserva);
    const girando = emoji(i.guild, SIMBOLOS[1].emoji, '🎲');
    const tela = (parados: number) => `🎰 ${i.user} puxou a alavanca!\n# ${[0, 1, 2].map((k) => (k < parados ? icone(k) : girando)).join(' ')}`;
    await i.reply(tela(0));
    for (const n of [1, 2]) {
      await esperar(900);
      await i.editReply(tela(n));
    }
    await esperar(900);
    const final = r.jackpot ? `\n💥 **JACKPOT!!!** ${resultado(i, aposta, ganho)}` : `\n${resultado(i, aposta, ganho)}`;
    await i.editReply(tela(3) + final);
    if (r.jackpot) {
      contar(g, u, 'jackpots');
      await verificarConquistas(i.guild!, u);
    }
  },
};

