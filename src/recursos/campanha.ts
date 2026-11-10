import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from 'discord.js';
import { db } from '../db.ts';
import { ehMestre } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';
import { apagarMapa, avisarMapa, linkDoMapa, mapaPublico } from './mapa.ts';

// Campanhas: um mestre cria a mesa, escolhe o sistema e adiciona os jogadores. Cada personagem é a ficha
// que o jogador já criou (/dh ficha criar ou /ficha criar), no sistema da campanha.
// O /campanha mapa leva cada um para o mapa da mesa (servidor em mapa.ts), com link pessoal: é ele que diz ao site
// quem é cada jogador. No mapa fica o chat da mesa com as rolagens de todos (e as escondidas do mestre).

export type Sistema = 'dh' | 'dnd';
export const SISTEMAS: Record<Sistema, { nome: string; tabela: string }> = {
  dh: { nome: 'Daggerheart', tabela: 'fichas_dh' },
  dnd: { nome: 'D&D 3.5', tabela: 'fichas' },
};
const COR = 0x8e44ad;

export type Campanha = {
  id: number;
  guild_id: string;
  nome: string;
  sistema: Sistema;
  mestre_id: string;
  criada_em: number;
};
type FichaResumo = { nome: string; classe: string; nivel: number };

export const porNome = (g: string, nome: string) =>
  db.prepare('SELECT * FROM campanhas WHERE guild_id = ? AND nome = ? COLLATE NOCASE').get(g, nome) as Campanha | undefined;
export const porId = (id: number) => db.prepare('SELECT * FROM campanhas WHERE id = ?').get(id) as Campanha | undefined;
export const personagens = (campanhaId: number) =>
  (db.prepare('SELECT user_id FROM campanha_personagens WHERE campanha_id = ? ORDER BY rowid').all(campanhaId) as { user_id: string }[]).map((r) => r.user_id);
export const fichaDe = (sistema: Sistema, g: string, u: string) =>
  db.prepare(`SELECT nome, classe, nivel FROM ${SISTEMAS[sistema].tabela} WHERE guild_id = ? AND user_id = ?`).get(g, u) as FichaResumo | undefined;

// Só o mestre da campanha (quem criou) ou um mestre/admin do servidor mexe nela.
const podeMexer = (i: ChatInputCommandInteraction, c: Campanha) => c.mestre_id === i.user.id || ehMestre(i.member as GuildMember);

const SEM_CAMPANHA = (nome: string) => `Não achei a campanha **${nome}**. Veja as campanhas com \`/campanha ver\`.`;
const SEM_PERMISSAO = { content: 'Só o mestre da campanha (ou um mestre do servidor) mexe nela.', flags: MessageFlags.Ephemeral as const };

function embedCampanha(c: Campanha, g: string) {
  const linhas = personagens(c.id).map((u) => {
    const f = fichaDe(c.sistema, g, u);
    return f ? `**${f.nome}** · ${f.classe} nível ${f.nivel} · <@${u}>` : `_ficha apagada_ · <@${u}>`;
  });
  return new EmbedBuilder()
    .setColor(COR)
    .setTitle(`🐉 ${c.nome}`)
    .setDescription(`Sistema: **${SISTEMAS[c.sistema].nome}** · Mestre: <@${c.mestre_id}>`)
    .addFields({ name: `Personagens (${linhas.length})`, value: linhas.length ? linhas.join('\n') : '_nenhum ainda: use `/campanha adicionar`_' });
}

export const campanha: Comando = {
  data: new SlashCommandBuilder()
    .setName('campanha')
    .setDescription('Campanhas de RPG: crie a mesa e adicione os personagens')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('criar')
        .setDescription('Cria uma campanha (só Mestre)')
        .addStringOption((o) => o.setName('nome').setDescription('Nome da campanha').setRequired(true).setMaxLength(50))
        .addStringOption((o) =>
          o.setName('sistema').setDescription('Sistema de jogo').setRequired(true).addChoices({ name: 'Daggerheart', value: 'dh' }, { name: 'D&D 3.5', value: 'dnd' }),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('adicionar')
        .setDescription('Adiciona um jogador e o personagem dele (a ficha no sistema da campanha)')
        .addStringOption((o) => o.setName('campanha').setDescription('Campanha').setRequired(true).setAutocomplete(true))
        .addUserOption((o) => o.setName('jogador').setDescription('Quem joga o personagem').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('remover')
        .setDescription('Tira um personagem da campanha (a ficha continua salva)')
        .addStringOption((o) => o.setName('campanha').setDescription('Campanha').setRequired(true).setAutocomplete(true))
        .addUserOption((o) => o.setName('jogador').setDescription('Quem joga o personagem').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('ver')
        .setDescription('Lista as campanhas, ou mostra os personagens de uma')
        .addStringOption((o) => o.setName('campanha').setDescription('Campanha').setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('mapa')
        .setDescription('Abre o mapa da campanha: cada um move o seu personagem e rola no chat da mesa')
        .addStringOption((o) => o.setName('campanha').setDescription('Campanha').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('mestre')
        .setDescription('Define quem é o mestre da campanha (passa o comando adiante)')
        .addStringOption((o) => o.setName('campanha').setDescription('Campanha').setRequired(true).setAutocomplete(true))
        .addUserOption((o) => o.setName('novo_mestre').setDescription('Quem vai mestrar').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('apagar')
        .setDescription('Apaga a campanha e a lista de personagens (as fichas continuam salvas)')
        .addStringOption((o) => o.setName('campanha').setDescription('Campanha').setRequired(true).setAutocomplete(true))
        .addBooleanOption((o) => o.setName('confirmar').setDescription('Marque para confirmar').setRequired(true)),
    ),

  async autocompletar(i) {
    const digitado = i.options.getFocused().toLowerCase();
    const opcoes = (db.prepare('SELECT nome FROM campanhas WHERE guild_id = ? ORDER BY nome LIMIT 100').all(i.guildId!) as { nome: string }[])
      .filter((c) => c.nome.toLowerCase().includes(digitado))
      .slice(0, 25)
      .map((c) => ({ name: c.nome, value: c.nome }));
    return i.respond(opcoes);
  },

  async executar(i) {
    const g = i.guildId!;
    const sub = i.options.getSubcommand();

    if (sub === 'criar') {
      if (!ehMestre(i.member as GuildMember)) return i.reply({ content: 'Só o Mestre cria campanha.', flags: MessageFlags.Ephemeral });
      const nome = i.options.getString('nome', true).trim();
      const sistema = i.options.getString('sistema', true) as Sistema;
      if (porNome(g, nome)) return i.reply({ content: `Já existe uma campanha chamada **${nome}** neste servidor.`, flags: MessageFlags.Ephemeral });
      db.prepare('INSERT INTO campanhas (guild_id, nome, sistema, mestre_id, criada_em) VALUES (?, ?, ?, ?, ?)').run(g, nome, sistema, i.user.id, Date.now());
      const nova = porNome(g, nome)!;
      return i.reply({ content: `🐉 Campanha criada! Agora adicione os personagens com \`/campanha adicionar\`.`, embeds: [embedCampanha(nova, g)] });
    }

    if (sub === 'ver') {
      const nome = i.options.getString('campanha');
      if (!nome) {
        const todas = db
          .prepare(
            'SELECT c.nome, c.sistema, c.mestre_id, COUNT(p.user_id) AS total FROM campanhas c LEFT JOIN campanha_personagens p ON p.campanha_id = c.id WHERE c.guild_id = ? GROUP BY c.id ORDER BY c.nome',
          )
          .all(g) as { nome: string; sistema: Sistema; mestre_id: string; total: number }[];
        if (!todas.length) return i.reply({ content: 'Nenhuma campanha ainda. O Mestre pode usar `/campanha criar`.', flags: MessageFlags.Ephemeral });
        const embed = new EmbedBuilder()
          .setColor(COR)
          .setTitle('🐉 Campanhas do servidor')
          .setDescription(todas.map((c) => `**${c.nome}** · ${SISTEMAS[c.sistema].nome} · mestre <@${c.mestre_id}> · ${c.total} personagem(ns)`).join('\n'));
        return i.reply({ embeds: [embed] });
      }
      const c = porNome(g, nome);
      if (!c) return i.reply({ content: SEM_CAMPANHA(nome), flags: MessageFlags.Ephemeral });
      return i.reply({ embeds: [embedCampanha(c, g)] });
    }

    // Os comandos abaixo mexem numa campanha existente.
    const nome = i.options.getString('campanha', true);
    const c = porNome(g, nome);
    if (!c) return i.reply({ content: SEM_CAMPANHA(nome), flags: MessageFlags.Ephemeral });

    // O mapa é de todos da mesa: o mestre importa a imagem, cada jogador movimenta o seu personagem.
    if (sub === 'mapa') {
      const mestre = c.mestre_id === i.user.id;
      if (!mestre && !personagens(c.id).includes(i.user.id)) {
        return i.reply({ content: `Você não está em **${c.nome}**. Peça ao mestre para te adicionar com \`/campanha adicionar\`.`, flags: MessageFlags.Ephemeral });
      }
      const botao = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir o mapa').setEmoji('🗺️').setURL(linkDoMapa(c.id, i.user.id));
      return i.reply({
        content:
          `🗺️ **Mapa de ${c.nome}** · o link é só seu e vale por 1 hora (depois o navegador lembra de você por 7 dias). Não compartilhe.\n` +
          (mestre
            ? 'Você é o mestre: importe a imagem do mapa, mova qualquer peça e role escondido no chat (`/gr 1d20`), revelando depois se quiser.'
            : 'Arraste o seu personagem pelo mapa e role no chat da mesa (`/r 1d20+3`); todo mundo vê na hora.') +
          (mapaPublico() ? '' : '\n⚠️ O mapa está no endereço local deste PC. Para a mesa abrir de fora, defina `MAPA_URL` no `.env` (veja o README).'),
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(botao)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!podeMexer(i, c)) return i.reply(SEM_PERMISSAO);

    if (sub === 'adicionar' || sub === 'remover') {
      const jogador = i.options.getUser('jogador', true);
      const ja = personagens(c.id).includes(jogador.id);

      if (sub === 'adicionar') {
        if (ja) return i.reply({ content: `${jogador} já está em **${c.nome}**.`, flags: MessageFlags.Ephemeral });
        if (!fichaDe(c.sistema, g, jogador.id)) {
          return i.reply({
            content: `${jogador} ainda não tem ficha de ${SISTEMAS[c.sistema].nome}. Peça para criar com \`/${c.sistema === 'dh' ? 'dh ficha criar' : 'ficha criar'}\`.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        db.prepare('INSERT INTO campanha_personagens (campanha_id, user_id) VALUES (?, ?)').run(c.id, jogador.id);
        avisarMapa(c.id);
        return i.reply({ content: `⚔️ ${jogador} entrou em **${c.nome}**.`, embeds: [embedCampanha(c, g)] });
      }

      if (!ja) return i.reply({ content: `${jogador} não está em **${c.nome}**.`, flags: MessageFlags.Ephemeral });
      db.prepare('DELETE FROM campanha_personagens WHERE campanha_id = ? AND user_id = ?').run(c.id, jogador.id);
      avisarMapa(c.id);
      return i.reply({ content: `🚪 ${jogador} saiu de **${c.nome}**.`, embeds: [embedCampanha(c, g)] });
    }

    if (sub === 'mestre') {
      const novo = i.options.getUser('novo_mestre', true);
      if (novo.bot) return i.reply({ content: 'Bot não mestra campanha.', flags: MessageFlags.Ephemeral });
      if (novo.id === c.mestre_id) return i.reply({ content: `${novo} já é o mestre de **${c.nome}**.`, flags: MessageFlags.Ephemeral });
      const membro = await i.guild!.members.fetch(novo.id).catch(() => null);
      if (!membro) return i.reply({ content: `${novo} não está neste servidor.`, flags: MessageFlags.Ephemeral });
      if (!ehMestre(membro)) {
        return i.reply({ content: `${novo} não tem o cargo 🐉 Mestre. Peça para um admin dar o cargo antes.`, flags: MessageFlags.Ephemeral });
      }
      db.prepare('UPDATE campanhas SET mestre_id = ? WHERE id = ?').run(novo.id, c.id);
      avisarMapa(c.id);
      return i.reply({ content: `🐉 ${novo} é o novo mestre de **${c.nome}**.`, embeds: [embedCampanha({ ...c, mestre_id: novo.id }, g)] });
    }

    if (sub === 'apagar') {
      if (!i.options.getBoolean('confirmar', true)) {
        return i.reply({ content: 'Apagar a campanha é definitivo. Rode de novo com `confirmar: Sim` se tiver certeza.', flags: MessageFlags.Ephemeral });
      }
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM campanha_personagens WHERE campanha_id = ?').run(c.id);
        db.prepare('DELETE FROM campanhas WHERE id = ?').run(c.id);
        db.exec('COMMIT');
      } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
      }
      avisarMapa(c.id);
      apagarMapa(c.id);
      return i.reply({ content: `🗑️ Campanha **${c.nome}** apagada. As fichas dos jogadores continuam salvas.`, flags: MessageFlags.Ephemeral });
    }
  },
};
