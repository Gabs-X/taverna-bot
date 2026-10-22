import { EmbedBuilder, InteractionContextType, SlashCommandBuilder, type Guild } from 'discord.js';
import { CANAIS } from '../config.ts';
import { db } from '../db.ts';
import { CONQUISTAS, novasConquistas, progresso, type Estatisticas } from '../lib/conquistas.ts';
import { canalTexto, emoji } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';

const PREMIO = 100;

/** Soma num contador (duelos vencidos, jackpots, palavras...). */
export function contar(g: string, u: string, chave: string, n = 1) {
  db.prepare('INSERT INTO estatisticas (guild_id, user_id, chave, valor) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET valor = valor + excluded.valor').run(g, u, chave, n);
}

function estatisticas(g: string, u: string): Estatisticas {
  const c = (db.prepare('SELECT * FROM carteira WHERE guild_id = ? AND user_id = ?').get(g, u) ?? {}) as Partial<Record<string, number>>;
  const contador = (chave: string) => (db.prepare('SELECT valor FROM estatisticas WHERE guild_id = ? AND user_id = ? AND chave = ?').get(g, u, chave) as { valor: number } | undefined)?.valor ?? 0;
  const um = (sql: string) => Number((db.prepare(sql).get(g, u) as { n: number | null } | undefined)?.n ?? 0);
  return {
    mensagens: c.mensagens ?? 0,
    minutos_call: c.minutos_call ?? 0,
    nivel: c.nivel ?? 0,
    sequencia: c.sequencia ?? 0,
    moedas: c.moedas ?? 0,
    duelos_vencidos: contador('duelos_vencidos'),
    jackpots: contador('jackpots'),
    palavras: contador('palavras'),
    quiz: um('SELECT acertos AS n FROM quiz_pontos WHERE guild_id = ? AND user_id = ?'),
    apanhou: um('SELECT SUM(vezes) AS n FROM vitimas WHERE guild_id = ? AND user_id = ?'),
    gotica_nivel: um('SELECT nivel AS n FROM goticas WHERE guild_id = ? AND user_id = ?'),
  };
}

const jaTem = (g: string, u: string) =>
  new Set((db.prepare('SELECT conquista FROM conquistas WHERE guild_id = ? AND user_id = ?').all(g, u) as { conquista: string }[]).map((r) => r.conquista));

/** Confere se a pessoa ganhou conquistas novas; dá moedas e avisa no #level-up (ou #comandos-do-bot). */
export async function verificarConquistas(guild: Guild, userId: string) {
  const novas = novasConquistas(estatisticas(guild.id, userId), jaTem(guild.id, userId));
  if (!novas.length) return;
  for (const c of novas) {
    db.prepare('INSERT OR IGNORE INTO conquistas (guild_id, user_id, conquista, em) VALUES (?, ?, ?, ?)').run(guild.id, userId, c.id, Date.now());
  }
  db.prepare('INSERT OR IGNORE INTO carteira (guild_id, user_id) VALUES (?, ?)').run(guild.id, userId);
  db.prepare('UPDATE carteira SET moedas = moedas + ? WHERE guild_id = ? AND user_id = ?').run(PREMIO * novas.length, guild.id, userId);
  const canal = canalTexto(guild, CANAIS.levelUp) ?? canalTexto(guild, CANAIS.comandos);
  const lista = novas.map((c) => `${c.emoji} **${c.nome}**: ${c.descricao}`).join('\n');
  await canal?.send({
    content: `🏅 <@${userId}> desbloqueou ${novas.length > 1 ? 'conquistas' : 'uma conquista'}! (+${emoji(guild, 'moeda_taverna', '🪙')} ${PREMIO * novas.length})\n${lista}`,
    allowedMentions: { users: [userId] },
  }).catch(() => {});
}

export const conquistas: Comando = {
  data: new SlashCommandBuilder()
    .setName('conquistas')
    .setDescription('Medalhas desbloqueadas (suas ou de alguém) e o que falta')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('De quem (padrão: você)')),
  async executar(i) {
    const u = i.options.getUser('membro') ?? i.user;
    await verificarConquistas(i.guild!, u.id);
    const tem = jaTem(i.guildId!, u.id);
    const e = estatisticas(i.guildId!, u.id);
    const ganhas = CONQUISTAS.filter((c) => tem.has(c.id));
    const faltam = CONQUISTAS.filter((c) => !tem.has(c.id));
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setAuthor({ name: u.displayName, iconURL: u.displayAvatarURL() })
      .setTitle(`🏅 Conquistas: ${ganhas.length}/${CONQUISTAS.length}`)
      .addFields(
        { name: 'Desbloqueadas', value: ganhas.map((c) => `${c.emoji} **${c.nome}**`).join(' · ') || '_nenhuma ainda_' },
        { name: 'Faltam', value: faltam.map((c) => `🔒 ${c.nome}: ${c.descricao} (${progresso(c, e)})`).join('\n').slice(0, 1024) || '_todas! 👑_' },
      )
      .setFooter({ text: `Cada conquista vale ${PREMIO} moedas.` });
    return i.reply({ embeds: [embed] });
  },
};
