import { EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { db } from '../db.ts';
import { avaliar, diaDe, normalizar, palavraDoDia, premioPalavra, quadrados, TAMANHO, TENTATIVAS } from '../lib/palavra.ts';
import type { Comando } from '../tipos.ts';
import { contar, verificarConquistas } from './conquistas.ts';
import { darMoedas, moedas } from './economia.ts';

// Palavra do dia (estilo Wordle): a mesma para todo mundo, 6 tentativas. Os chutes são só seus (respostas efêmeras);
// quem acerta aparece no canal só com os quadradinhos, sem entregar a palavra.

type Jogo = { chutes: string; acertou: number };
const jogoDe = (g: string, u: string, dia: string) =>
  (db.prepare('SELECT chutes, acertou FROM palavra_jogos WHERE guild_id = ? AND user_id = ? AND dia = ?').get(g, u, dia) as Jogo | undefined) ?? { chutes: '[]', acertou: 0 };

const tabuleiro = (chutes: string[], alvo: string) =>
  chutes.map((c) => `${quadrados(avaliar(c, alvo))}  \`${c.toUpperCase().split('').join(' ')}\``).join('\n') || '_nenhum chute ainda_';

export const palavra: Comando = {
  data: new SlashCommandBuilder()
    .setName('palavra')
    .setDescription('Palavra do dia: descubra a palavra de 5 letras em 6 tentativas')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s.setName('chutar').setDescription('Tenta uma palavra de 5 letras')
        .addStringOption((o) => o.setName('palavra').setDescription('5 letras (acentos não importam)').setRequired(true).setMinLength(5).setMaxLength(10)),
    )
    .addSubcommand((s) => s.setName('ver').setDescription('Mostra os seus chutes de hoje'))
    .addSubcommand((s) => s.setName('ranking').setDescription('Quem mais acertou a palavra do dia')),

  async executar(i) {
    const g = i.guildId!;
    const u = i.user.id;
    const dia = diaDe(Date.now());
    const alvo = palavraDoDia(dia);
    const sub = i.options.getSubcommand();

    if (sub === 'ranking') {
      const top = db.prepare("SELECT user_id, valor FROM estatisticas WHERE guild_id = ? AND chave = 'palavras' ORDER BY valor DESC LIMIT 10").all(g) as { user_id: string; valor: number }[];
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('🔤 Ranking da palavra do dia')
        .setDescription(top.length ? top.map((t, k) => `${['🥇', '🥈', '🥉'][k] ?? `**${k + 1}.**`} <@${t.user_id}> · ${t.valor} acerto(s)`).join('\n') : 'Ninguém acertou ainda. Tenta com `/palavra chutar`!');
      return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    const jogo = jogoDe(g, u, dia);
    const chutes = JSON.parse(jogo.chutes) as string[];

    if (sub === 'ver') {
      const situacao = jogo.acertou ? '✅ Você já acertou hoje!' : chutes.length >= TENTATIVAS ? `❌ Acabaram as tentativas. Era **${alvo.toUpperCase()}**.` : `${TENTATIVAS - chutes.length} tentativa(s) restante(s).`;
      return i.reply({ content: `🔤 **Palavra do dia** (${dia})\n${tabuleiro(chutes, alvo)}\n\n${situacao}`, flags: MessageFlags.Ephemeral });
    }

    // chutar
    if (jogo.acertou) return i.reply({ content: '✅ Você já acertou a palavra de hoje! Volta amanhã para a próxima.', flags: MessageFlags.Ephemeral });
    if (chutes.length >= TENTATIVAS) return i.reply({ content: `❌ Suas ${TENTATIVAS} tentativas de hoje acabaram. Era **${alvo.toUpperCase()}**. Amanhã tem outra!`, flags: MessageFlags.Ephemeral });
    const chute = normalizar(i.options.getString('palavra', true));
    if (chute.length !== TAMANHO) return i.reply({ content: `A palavra precisa ter ${TAMANHO} letras (sem contar acentos).`, flags: MessageFlags.Ephemeral });
    if (chutes.includes(chute)) return i.reply({ content: 'Você já chutou essa. Tenta outra!', flags: MessageFlags.Ephemeral });

    chutes.push(chute);
    const acertou = chute === alvo;
    db.prepare('INSERT INTO palavra_jogos (guild_id, user_id, dia, chutes, acertou) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET chutes = excluded.chutes, acertou = excluded.acertou')
      .run(g, u, dia, JSON.stringify(chutes), acertou ? 1 : 0);

    if (!acertou) {
      const fim = chutes.length >= TENTATIVAS ? `\n\n❌ Acabaram as tentativas. Era **${alvo.toUpperCase()}**.` : `\n\n${TENTATIVAS - chutes.length} tentativa(s) restante(s).`;
      return i.reply({ content: `🔤 **Palavra do dia**\n${tabuleiro(chutes, alvo)}${fim}\n🟩 letra certa no lugar certo · 🟨 existe em outro lugar · ⬛ não tem`, flags: MessageFlags.Ephemeral });
    }

    const ganho = premioPalavra(chutes.length);
    darMoedas(g, u, ganho);
    contar(g, u, 'palavras');
    await i.reply({ content: `🎉 Acertou: **${alvo.toUpperCase()}** em ${chutes.length}/${TENTATIVAS}! +${moedas(i.guild, ganho)}\n${tabuleiro(chutes, alvo)}`, flags: MessageFlags.Ephemeral });
    // No canal, só os quadradinhos (sem entregar a palavra).
    const grade = chutes.map((c) => quadrados(avaliar(c, alvo))).join('\n');
    await i.followUp({ content: `🔤 ${i.user} acertou a palavra do dia em **${chutes.length}/${TENTATIVAS}**!\n${grade}`, allowedMentions: { parse: [] } });
    await verificarConquistas(i.guild!, u);
  },
};
