import { EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { db } from '../db.ts';
import {
  APOSTA_MINIMA,
  chancesSlots,
  girarRoleta,
  girarSlots,
  jogarMoeda,
  PAGA_MOEDA,
  premio,
  retornoMedioSlots,
  simboloAleatorio,
  SIMBOLOS,
  type Simbolo,
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
      s.setName('slots').setDescription('Caça-níquel: cada símbolo paga diferente com 2 ou 3 iguais (3 moedas = jackpot 100x)')
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
    .addSubcommand((s) => s.setName('premios').setDescription('Tabela do caça-níquel: quanto cada símbolo paga e a chance'))
    .addSubcommand((s) => s.setName('limite').setDescription('Quanto você ainda pode apostar hoje')),

  async executar(i) {
    const g = i.guildId!;
    const u = i.user.id;
    const sub = i.options.getSubcommand();

    if (sub === 'premios') return i.reply({ embeds: [tabelaPremios(i)], flags: MessageFlags.Ephemeral });
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

    // slots: os rolos giram trocando de símbolo e param um de cada vez (com suspense se os dois primeiros baterem)
    const r = girarSlots();
    const ganho = premio(aposta, r.multiplicador);
    if (ganho) darMoedas(g, u, ganho);
    const desenho = (s: Simbolo) => emoji(i.guild, s.emoji, s.reserva);
    const linha = (parados: number) => [0, 1, 2].map((k) => desenho(k < parados ? r.rolos[k] : simboloAleatorio())).join(' ┃ ');
    const topo = `🎰 **${i.user.displayName}** puxou a alavanca · aposta ${moedas(i.guild, aposta)}`;
    const tela = (parados: number, status: string) => `${topo}\n# ${linha(parados)}\n${status}`;
    const quaseLa = r.rolos[0].id === r.rolos[1].id;
    const quadros: [number, string, number][] = [
      [0, '🌀 Girando...', 650],
      [0, '🌀 Girando...', 650],
      [1, '⏹️ O primeiro rolo parou...', 650],
      [1, '🌀 Girando...', 650],
      [2, quaseLa ? `👀 Dois ${r.rolos[0].nome.toLowerCase()}... será?` : '⏹️ O segundo rolo parou...', quaseLa ? 900 : 650],
      ...(quaseLa ? ([[2, '🥁 ...', 1100]] as [number, string, number][]) : []),
    ];
    await i.reply(tela(0, '🌀 Girando...'));
    for (const [parados, status, espera] of quadros) {
      await esperar(espera);
      await i.editReply(tela(parados, status));
    }
    await esperar(700);
    await i.editReply({ content: `${topo}\n# ${linha(3)}`, embeds: [cartaoSlots(i, r, aposta, ganho)] });
    if (r.jackpot) {
      contar(g, u, 'jackpots');
      await verificarConquistas(i.guild!, u);
    }
  },
};

// ---------- Caça-níquel: resultado e tabela de prêmios ----------

const vezes = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}x`;
const porcento = (n: number) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: n < 0.01 ? 2 : 1 })}%`;

/** Cartão do resultado: qual combinação saiu, quanto pagou e o saldo da jogada. */
function cartaoSlots(i: ChatInputCommandInteraction, r: ReturnType<typeof girarSlots>, aposta: number, ganho: number) {
  const s = r.simbolo;
  const nome = s ? `${emoji(i.guild, s.emoji, s.reserva)} ${s.nome}` : '';
  const titulo =
    r.jackpot ? '💥 JACKPOT!!! Três moedas da Taverna!'
    : r.combinacao === 'tres' && s?.id === 'caveira' ? '💀 Três caveiras: maldição!'
    : r.combinacao === 'tres' ? `🎉 Três iguais: ${nome}!`
    : r.combinacao === 'dois' && s?.id === 'caveira' ? '💀 Duas caveiras...'
    : r.combinacao === 'dois' ? `✨ Dois iguais: ${nome}`
    : '💸 Nada dessa vez';
  const saldo = ganho - aposta;
  const conta = r.multiplicador
    ? `Pagou **${vezes(r.multiplicador)}** da aposta: você colocou ${moedas(i.guild, aposta)} e levou **${moedas(i.guild, ganho)}**.`
    : `Você perdeu ${moedas(i.guild, aposta)}. A casa agradece.`;
  return new EmbedBuilder()
    .setColor(r.jackpot ? 0xf1c40f : saldo > 0 ? 0x3ba55d : saldo === 0 ? 0x95a5a6 : 0xe74c3c)
    .setTitle(titulo)
    .setDescription(`${conta}\n${saldo > 0 ? `📈 Lucro de **${moedas(i.guild, saldo)}**` : saldo < 0 && r.multiplicador ? `📉 Voltou só parte: prejuízo de ${moedas(i.guild, -saldo)}` : saldo === 0 ? '↔️ Empatou' : ''}`.trim())
    .setFooter({ text: '/cassino premios mostra o que cada símbolo paga' });
}

/** Tabela completa: quanto cada símbolo paga com dois e três iguais, e a chance de cada combinação. */
function tabelaPremios(i: ChatInputCommandInteraction) {
  const linhas = SIMBOLOS.map((s) => {
    const c = chancesSlots(s);
    const dois = s.id === 'caveira' ? `devolve só **${vezes(s.paga2)}** (um quarto)` : `**${vezes(s.paga2)}**`;
    const tres = s.paga3 ? `**${vezes(s.paga3)}**${s.id === 'moeda' ? ' 💥 JACKPOT' : ''}` : '**perde tudo** 💀';
    return `${emoji(i.guild, s.emoji, s.reserva)} **${s.nome}**\n> 2 iguais: ${dois} · chance ${porcento(c.dois)}\n> 3 iguais: ${tres} · chance ${porcento(c.tres)}`;
  });
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🎰 Caça-níquel: o que cada símbolo paga')
    .setDescription(
      'O número é quanto da aposta volta para você. Apostando 100: **1,1x** devolve 110 (lucro de 10), **4x** devolve 400.\n' +
        'Vale o par em qualquer posição (1º e 2º, 2º e 3º ou 1º e 3º rolo).\n\n' +
        linhas.join('\n\n'),
    )
    .setFooter({ text: `Em média a casa fica com ${porcento(1 - retornoMedioSlots())} das apostas. Jogue com moderação!` });
}

