import { existsSync, readFileSync } from 'node:fs';
import { EmbedBuilder, InteractionContextType, SlashCommandBuilder, type Client } from 'discord.js';
import { CANAIS } from '../config.ts';
import { db } from '../db.ts';
import { canalTexto, emoji } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';

// Versão do bot: vem do package.json; as novidades, do CHANGELOG.md (escrito pelo "npm run lancar").
// Ao ligar com uma versão que ainda não foi anunciada, avisa no #novidades.

const RAIZ = new URL('../../', import.meta.url);
export const VERSAO: string = JSON.parse(readFileSync(new URL('package.json', RAIZ), 'utf8')).version;
const REPOSITORIO = 'https://github.com/Gabs-X/taverna-bot';

/** Itens da versão no CHANGELOG ("- Cassino..." → ["Cassino..."]). */
export function novidadesDa(versao: string): string[] {
  const arquivo = new URL('CHANGELOG.md', RAIZ);
  if (!existsSync(arquivo)) return [];
  const texto = readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n');
  const inicio = texto.indexOf(`## v${versao} `);
  if (inicio < 0) return [];
  const fim = texto.indexOf('\n## v', inicio + 1);
  return texto
    .slice(inicio, fim < 0 ? undefined : fim)
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

const lerEstado = (chave: string) => (db.prepare('SELECT valor FROM bot_estado WHERE chave = ?').get(chave) as { valor: string } | undefined)?.valor;
const salvarEstado = (chave: string, valor: string) =>
  db.prepare('INSERT INTO bot_estado (chave, valor) VALUES (?, ?) ON CONFLICT DO UPDATE SET valor = excluded.valor').run(chave, valor);

export async function anunciarVersao(client: Client) {
  const itens = novidadesDa(VERSAO);
  if (lerEstado('discord_anunciada') !== VERSAO) {
    let anunciou = false;
    for (const guild of client.guilds.cache.values()) {
      const canal = canalTexto(guild, CANAIS.novidades);
      if (!canal) continue;
      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle(`${emoji(guild, 'level_up', '🆕')} Taverneiro v${VERSAO}`)
        .setDescription((itens.map((i) => `• ${i}`).join('\n') || 'Melhorias por baixo dos panos.').slice(0, 4000))
        .setURL(`${REPOSITORIO}/releases/tag/v${VERSAO}`)
        .setFooter({ text: 'Todas as versões: /versao' });
      anunciou = (await canal.send({ embeds: [embed] }).catch((e) => console.error('[novidades]', e))) ? true : anunciou;
    }
    // Sem o canal (antes do /setup), fica para a próxima vez que o bot ligar.
    if (anunciou) salvarEstado('discord_anunciada', VERSAO);
  }
}

export const versao: Comando = {
  data: new SlashCommandBuilder().setName('versao').setDescription('Versão do Taverneiro e o que mudou').setContexts(InteractionContextType.Guild),
  async executar(i) {
    const itens = novidadesDa(VERSAO);
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`🍺 Taverneiro v${VERSAO}`)
      .setDescription((itens.length ? `**Novidades desta versão:**\n${itens.map((x) => `• ${x}`).join('\n')}` : 'Sem notas para esta versão.').slice(0, 3900))
      .addFields({ name: 'Histórico', value: `[Todas as versões](${REPOSITORIO}/blob/main/CHANGELOG.md)` });
    return i.reply({ embeds: [embed] });
  },
};
