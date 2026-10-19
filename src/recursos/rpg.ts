import {
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandStringOption,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import { db } from '../db.ts';
import { aplicarModo, bonusProficiencia, comSinal, formatar, modificador, rolar } from '../lib/dados.ts';
import type { Comando } from '../tipos.ts';

// ---------- Regras do D&D 5e ----------

const ATRIBUTOS = {
  forca: 'Força',
  destreza: 'Destreza',
  constituicao: 'Constituição',
  inteligencia: 'Inteligência',
  sabedoria: 'Sabedoria',
  carisma: 'Carisma',
} as const;
type Atributo = keyof typeof ATRIBUTOS;

const PERICIAS: Record<string, { nome: string; atributo: Atributo }> = {
  acrobacia: { nome: 'Acrobacia', atributo: 'destreza' },
  adestrar: { nome: 'Adestrar Animais', atributo: 'sabedoria' },
  arcanismo: { nome: 'Arcanismo', atributo: 'inteligencia' },
  atletismo: { nome: 'Atletismo', atributo: 'forca' },
  atuacao: { nome: 'Atuação', atributo: 'carisma' },
  enganacao: { nome: 'Enganação', atributo: 'carisma' },
  furtividade: { nome: 'Furtividade', atributo: 'destreza' },
  historia: { nome: 'História', atributo: 'inteligencia' },
  intimidacao: { nome: 'Intimidação', atributo: 'carisma' },
  intuicao: { nome: 'Intuição', atributo: 'sabedoria' },
  investigacao: { nome: 'Investigação', atributo: 'inteligencia' },
  medicina: { nome: 'Medicina', atributo: 'sabedoria' },
  natureza: { nome: 'Natureza', atributo: 'inteligencia' },
  percepcao: { nome: 'Percepção', atributo: 'sabedoria' },
  persuasao: { nome: 'Persuasão', atributo: 'carisma' },
  prestidigitacao: { nome: 'Prestidigitação', atributo: 'destreza' },
  religiao: { nome: 'Religião', atributo: 'inteligencia' },
  sobrevivencia: { nome: 'Sobrevivência', atributo: 'sabedoria' },
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Aceita "furtividade, Percepção, adestrar animais".
export function lerPericias(texto: string): string[] {
  const ids = new Set<string>();
  for (const parte of texto.split(',').map(semAcento).filter(Boolean)) {
    const id = Object.keys(PERICIAS).find((k) => k === parte || semAcento(PERICIAS[k].nome) === parte);
    if (!id) throw new Error(`Não conheço a perícia "${parte}".`);
    ids.add(id);
  }
  return [...ids];
}

// ---------- Fichas ----------

type Ficha = {
  guild_id: string;
  user_id: string;
  nome: string;
  classe: string;
  raca: string;
  nivel: number;
  pv_max: number;
  pv_atual: number;
  ca: number;
  pericias: string;
} & Record<Atributo, number>;

const lerFicha = (guildId: string, userId: string) =>
  db.prepare('SELECT * FROM fichas WHERE guild_id = ? AND user_id = ?').get(guildId, userId) as Ficha | undefined;

const SEM_FICHA = 'Você ainda não tem ficha. Crie com `/ficha criar`.';

function embedFicha(f: Ficha) {
  const prof = bonusProficiencia(f.nivel);
  const atributos = (Object.keys(ATRIBUTOS) as Atributo[])
    .map((a) => `**${ATRIBUTOS[a].slice(0, 3).toUpperCase()}** ${f[a]} (${comSinal(modificador(f[a]))})`)
    .join('  ·  ');
  const pericias = f.pericias
    ? f.pericias
        .split(',')
        .map((id) => {
          const p = PERICIAS[id];
          return `${p.nome} ${comSinal(modificador(f[p.atributo]) + prof)}`;
        })
        .join(', ')
    : '_nenhuma (use /ficha pericias)_';
  const vida = Math.max(0, f.pv_atual) / f.pv_max;
  const barra = '🟥'.repeat(Math.round(vida * 10)).padEnd(20, '⬛').slice(0, 20);

  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle(`📖 ${f.nome}`)
    .setDescription(`${[f.raca, f.classe].filter(Boolean).join(' · ')} · nível ${f.nivel} · <@${f.user_id}>`)
    .addFields(
      { name: '❤️ Vida', value: `${f.pv_atual}/${f.pv_max} ${barra}`, inline: false },
      { name: '🛡️ CA', value: `${f.ca}`, inline: true },
      { name: '⭐ Proficiência', value: comSinal(prof), inline: true },
      { name: '🏃 Iniciativa', value: comSinal(modificador(f.destreza)), inline: true },
      { name: 'Atributos', value: atributos },
      { name: 'Perícias proficientes', value: pericias },
    );
}

const opcaoAtributo = (s: SlashCommandSubcommandBuilder, nome: Atributo) =>
  s.addIntegerOption((o) => o.setName(nome).setDescription(ATRIBUTOS[nome]).setRequired(true).setMinValue(1).setMaxValue(30));

export const ficha: Comando = {
  data: new SlashCommandBuilder()
    .setName('ficha')
    .setDescription('Ficha de personagem de D&D 5e')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => {
      s.setName('criar')
        .setDescription('Cria (ou recria) sua ficha')
        .addStringOption((o) => o.setName('nome').setDescription('Nome do personagem').setRequired(true).setMaxLength(60))
        .addStringOption((o) => o.setName('classe').setDescription('Ex.: Guerreiro, Mago').setRequired(true).setMaxLength(40))
        .addIntegerOption((o) => o.setName('nivel').setDescription('1 a 20').setRequired(true).setMinValue(1).setMaxValue(20));
      for (const a of Object.keys(ATRIBUTOS) as Atributo[]) opcaoAtributo(s, a);
      return s
        .addIntegerOption((o) => o.setName('pv').setDescription('Pontos de vida máximos').setRequired(true).setMinValue(1).setMaxValue(999))
        .addIntegerOption((o) => o.setName('ca').setDescription('Classe de armadura').setRequired(true).setMinValue(1).setMaxValue(40))
        .addStringOption((o) => o.setName('raca').setDescription('Ex.: Elfo, Anão').setMaxLength(40));
    })
    .addSubcommand((s) =>
      s
        .setName('ver')
        .setDescription('Mostra uma ficha')
        .addUserOption((o) => o.setName('jogador').setDescription('De quem (padrão: você)')),
    )
    .addSubcommand((s) =>
      s
        .setName('pv')
        .setDescription('Dano ou cura: -7 tira 7 PV, +5 cura 5')
        .addIntegerOption((o) => o.setName('valor').setDescription('Ex.: -7 ou 5').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('editar')
        .setDescription('Muda um campo da ficha')
        .addStringOption((o) =>
          o
            .setName('campo')
            .setDescription('O que mudar')
            .setRequired(true)
            .addChoices(
              { name: 'Nível', value: 'nivel' },
              { name: 'PV máximo', value: 'pv_max' },
              { name: 'CA', value: 'ca' },
              { name: 'Nome', value: 'nome' },
              { name: 'Classe', value: 'classe' },
              { name: 'Raça', value: 'raca' },
              ...(Object.keys(ATRIBUTOS) as Atributo[]).map((a) => ({ name: ATRIBUTOS[a], value: a })),
            ),
        )
        .addStringOption((o) => o.setName('valor').setDescription('Novo valor').setRequired(true).setMaxLength(60)),
    )
    .addSubcommand((s) =>
      s
        .setName('pericias')
        .setDescription('Define as perícias em que você é proficiente')
        .addStringOption((o) =>
          o.setName('lista').setDescription('Separadas por vírgula. Ex.: furtividade, percepção, acrobacia').setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName('apagar').setDescription('Apaga a sua ficha')),

  async executar(i) {
    const g = i.guildId!;
    const sub = i.options.getSubcommand();

    if (sub === 'criar') {
      const pv = i.options.getInteger('pv', true);
      const anterior = lerFicha(g, i.user.id);
      db.prepare(
        `INSERT OR REPLACE INTO fichas
          (guild_id, user_id, nome, classe, raca, nivel, forca, destreza, constituicao, inteligencia, sabedoria, carisma, pv_max, pv_atual, ca, pericias)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        g,
        i.user.id,
        i.options.getString('nome', true),
        i.options.getString('classe', true),
        i.options.getString('raca') ?? '',
        i.options.getInteger('nivel', true),
        ...(Object.keys(ATRIBUTOS) as Atributo[]).map((a) => i.options.getInteger(a, true)),
        pv,
        pv,
        i.options.getInteger('ca', true),
        anterior?.pericias ?? '',
      );
      return i.reply({ content: '✅ Ficha salva! Defina as perícias com `/ficha pericias`.', embeds: [embedFicha(lerFicha(g, i.user.id)!)] });
    }

    if (sub === 'ver') {
      const alvo = i.options.getUser('jogador') ?? i.user;
      const f = lerFicha(g, alvo.id);
      if (!f) return i.reply({ content: alvo.id === i.user.id ? SEM_FICHA : `${alvo} ainda não tem ficha.`, flags: MessageFlags.Ephemeral });
      return i.reply({ embeds: [embedFicha(f)] });
    }

    const f = lerFicha(g, i.user.id);
    if (!f) return i.reply({ content: SEM_FICHA, flags: MessageFlags.Ephemeral });

    if (sub === 'pv') {
      const valor = i.options.getInteger('valor', true);
      const novo = Math.min(f.pv_max, f.pv_atual + valor);
      db.prepare('UPDATE fichas SET pv_atual = ? WHERE guild_id = ? AND user_id = ?').run(novo, g, i.user.id);
      const estado = novo <= 0 ? ' 💀 **Caído!** Hora dos testes contra a morte.' : '';
      return i.reply(`${valor < 0 ? '🩸' : '💚'} **${f.nome}**: ${f.pv_atual} → **${novo}**/${f.pv_max} PV.${estado}`);
    }

    if (sub === 'editar') {
      const campo = i.options.getString('campo', true);
      const valor = i.options.getString('valor', true);
      const numerico = !['nome', 'classe', 'raca'].includes(campo);
      if (numerico && !/^\d+$/.test(valor)) return i.reply({ content: 'Esse campo precisa de um número.', flags: MessageFlags.Ephemeral });
      // `campo` vem de uma lista fixa de choices, então pode ir direto na SQL.
      db.prepare(`UPDATE fichas SET ${campo} = ? WHERE guild_id = ? AND user_id = ?`).run(numerico ? Number(valor) : valor, g, i.user.id);
      if (campo === 'pv_max') db.prepare('UPDATE fichas SET pv_atual = MIN(pv_atual, pv_max) WHERE guild_id = ? AND user_id = ?').run(g, i.user.id);
      return i.reply({ embeds: [embedFicha(lerFicha(g, i.user.id)!)] });
    }

    if (sub === 'pericias') {
      try {
        const ids = lerPericias(i.options.getString('lista', true));
        db.prepare('UPDATE fichas SET pericias = ? WHERE guild_id = ? AND user_id = ?').run(ids.join(','), g, i.user.id);
        return i.reply({ embeds: [embedFicha(lerFicha(g, i.user.id)!)] });
      } catch (e) {
        return i.reply({ content: `${(e as Error).message} Perícias: ${Object.values(PERICIAS).map((p) => p.nome).join(', ')}.`, flags: MessageFlags.Ephemeral });
      }
    }

    if (sub === 'apagar') {
      db.prepare('DELETE FROM fichas WHERE guild_id = ? AND user_id = ?').run(g, i.user.id);
      return i.reply({ content: `🗑️ Ficha de **${f.nome}** apagada.`, flags: MessageFlags.Ephemeral });
    }
  },
};

// ---------- Rolagens ----------

type Modo = 'normal' | 'vantagem' | 'desvantagem';

const opcaoModo = (o: SlashCommandStringOption) =>
  o
    .setName('modo')
    .setDescription('Vantagem ou desvantagem')
    .addChoices({ name: 'Normal', value: 'normal' }, { name: 'Vantagem', value: 'vantagem' }, { name: 'Desvantagem', value: 'desvantagem' });

async function responderRolagem(i: ChatInputCommandInteraction, titulo: string, expressao: string, modo: Modo) {
  let r;
  try {
    r = rolar(aplicarModo(expressao, modo));
  } catch (e) {
    return i.reply({ content: `🎲 ${(e as Error).message}`, flags: MessageFlags.Ephemeral });
  }
  const critico = r.d20 === 20 ? '\n✨ **CRÍTICO!**' : r.d20 === 1 ? '\n💀 **Falha crítica!**' : '';
  const embed = new EmbedBuilder()
    .setColor(r.d20 === 20 ? 0xf1c40f : r.d20 === 1 ? 0x992d22 : 0x8e44ad)
    .setAuthor({ name: i.member && 'displayName' in i.member ? i.member.displayName : i.user.username, iconURL: i.user.displayAvatarURL() })
    .setTitle(`${titulo}: ${r.total}`)
    .setDescription(`\`${r.expressao}\`${modo !== 'normal' ? ` (${modo})` : ''}\n${formatar(r)} = **${r.total}**${critico}`.slice(0, 4000));
  return i.reply({ embeds: [embed] });
}

export const rolarComando: Comando = {
  data: new SlashCommandBuilder()
    .setName('rolar')
    .setDescription('Rola dados: 1d20+5, 2d6, 4d6kh3, 8d6...')
    .addStringOption((o) => o.setName('dados').setDescription('Ex.: 1d20+5, 2d8+3, 4d6kh3').setRequired(true).setMaxLength(100))
    .addStringOption(opcaoModo)
    .addStringOption((o) => o.setName('motivo').setDescription('Ex.: ataque com espada').setMaxLength(80)),

  async executar(i) {
    const motivo = i.options.getString('motivo');
    return responderRolagem(i, motivo ? `🎲 ${motivo}` : '🎲 Rolagem', i.options.getString('dados', true), (i.options.getString('modo') ?? 'normal') as Modo);
  },
};

const escolhasAtributo = (Object.keys(ATRIBUTOS) as Atributo[]).map((a) => ({ name: ATRIBUTOS[a], value: a }));

export const teste: Comando = {
  data: new SlashCommandBuilder()
    .setName('teste')
    .setDescription('Teste usando a sua ficha (d20 + modificadores)')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('pericia')
        .setDescription('Teste de perícia (aplica proficiência se estiver na ficha)')
        .addStringOption((o) =>
          o
            .setName('pericia')
            .setDescription('Qual perícia')
            .setRequired(true)
            .addChoices(...Object.entries(PERICIAS).map(([id, p]) => ({ name: p.nome, value: id }))),
        )
        .addStringOption(opcaoModo)
        .addIntegerOption((o) => o.setName('bonus').setDescription('Bônus fixo extra (ex.: 2)')),
    )
    .addSubcommand((s) =>
      s
        .setName('atributo')
        .setDescription('Teste puro de atributo')
        .addStringOption((o) => o.setName('atributo').setDescription('Qual atributo').setRequired(true).addChoices(...escolhasAtributo))
        .addStringOption(opcaoModo)
        .addIntegerOption((o) => o.setName('bonus').setDescription('Bônus fixo extra (ex.: 2)')),
    )
    .addSubcommand((s) =>
      s
        .setName('salvaguarda')
        .setDescription('Teste de resistência')
        .addStringOption((o) => o.setName('atributo').setDescription('Qual atributo').setRequired(true).addChoices(...escolhasAtributo))
        .addBooleanOption((o) => o.setName('proficiente').setDescription('Sua classe é proficiente nesta salvaguarda?'))
        .addStringOption(opcaoModo)
        .addIntegerOption((o) => o.setName('bonus').setDescription('Bônus fixo extra (ex.: 2)')),
    )
    .addSubcommand((s) => s.setName('morte').setDescription('Teste contra a morte (CD 10)').addStringOption(opcaoModo)),

  async executar(i) {
    const f = lerFicha(i.guildId!, i.user.id);
    const sub = i.options.getSubcommand();
    const modo = (i.options.getString('modo') ?? 'normal') as Modo;
    const extra = i.options.getInteger('bonus') ?? 0;

    if (sub === 'morte') return responderRolagem(i, '💀 Teste contra a morte (CD 10)', '1d20', modo);
    if (!f) return i.reply({ content: SEM_FICHA, flags: MessageFlags.Ephemeral });

    const prof = bonusProficiencia(f.nivel);
    let titulo: string;
    let bonus: number;
    if (sub === 'pericia') {
      const id = i.options.getString('pericia', true);
      const p = PERICIAS[id];
      const proficiente = f.pericias.split(',').includes(id);
      bonus = modificador(f[p.atributo]) + (proficiente ? prof : 0);
      titulo = `${p.nome}${proficiente ? ' ⭐' : ''}`;
    } else {
      const a = i.options.getString('atributo', true) as Atributo;
      const proficiente = sub === 'salvaguarda' && (i.options.getBoolean('proficiente') ?? false);
      bonus = modificador(f[a]) + (proficiente ? prof : 0);
      titulo = `${sub === 'salvaguarda' ? 'Salvaguarda de ' : ''}${ATRIBUTOS[a]}${proficiente ? ' ⭐' : ''}`;
    }
    bonus += extra;
    return responderRolagem(i, `${f.nome} · ${titulo}`, `1d20${bonus ? comSinal(bonus) : ''}`, modo);
  },
};

// ---------- Iniciativa (em memória, por canal) ----------

type Combatente = { nome: string; total: number; bonus: number; userId?: string };
const combates = new Map<string, { lista: Combatente[]; vez: number; rodada: number }>();

function combateDo(canalId: string) {
  let c = combates.get(canalId);
  if (!c) combates.set(canalId, (c = { lista: [], vez: 0, rodada: 1 }));
  return c;
}

function adicionar(canalId: string, novo: Combatente) {
  const c = combateDo(canalId);
  c.lista = c.lista.filter((x) => (novo.userId ? x.userId !== novo.userId : x.nome !== novo.nome));
  c.lista.push(novo);
  // Empate: maior bônus de Destreza vai primeiro.
  c.lista.sort((a, b) => b.total - a.total || b.bonus - a.bonus);
}

function embedIniciativa(canalId: string) {
  const c = combateDo(canalId);
  return new EmbedBuilder()
    .setColor(0xc0392b)
    .setTitle(`⚔️ Iniciativa · rodada ${c.rodada}`)
    .setDescription(
      c.lista.length
        ? c.lista.map((x, n) => `${n === c.vez ? '▶️' : '▫️'} **${x.total}** · ${x.nome}`).join('\n')
        : '_Ninguém no combate. Use `/iniciativa entrar`._',
    );
}

export const iniciativa: Comando = {
  data: new SlashCommandBuilder()
    .setName('iniciativa')
    .setDescription('Ordem de combate da mesa (por canal)')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('entrar')
        .setDescription('Rola a sua iniciativa (usa a Destreza da ficha)')
        .addIntegerOption((o) => o.setName('bonus').setDescription('Bônus manual, se não tiver ficha')),
    )
    .addSubcommand((s) =>
      s
        .setName('npc')
        .setDescription('Adiciona um NPC ou monstro (para o Mestre)')
        .addStringOption((o) => o.setName('nome').setDescription('Ex.: Goblin').setRequired(true).setMaxLength(40))
        .addIntegerOption((o) => o.setName('bonus').setDescription('Bônus de iniciativa'))
        .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantos (Goblin 1, Goblin 2...)').setMinValue(1).setMaxValue(10)),
    )
    .addSubcommand((s) => s.setName('ver').setDescription('Mostra a ordem'))
    .addSubcommand((s) => s.setName('proximo').setDescription('Passa a vez'))
    .addSubcommand((s) => s.setName('limpar').setDescription('Encerra o combate')),

  async executar(i) {
    const canal = i.channelId;
    switch (i.options.getSubcommand()) {
      case 'entrar': {
        const f = lerFicha(i.guildId!, i.user.id);
        const bonus = i.options.getInteger('bonus') ?? (f ? modificador(f.destreza) : 0);
        const r = rolar(`1d20${bonus ? comSinal(bonus) : ''}`);
        adicionar(canal, { nome: f?.nome ?? i.user.displayName, total: r.total, bonus, userId: i.user.id });
        return i.reply({ content: `🎲 ${f?.nome ?? i.user} rolou **${r.total}** (${formatar(r)}).`, embeds: [embedIniciativa(canal)] });
      }
      case 'npc': {
        const nome = i.options.getString('nome', true);
        const bonus = i.options.getInteger('bonus') ?? 0;
        const qtd = i.options.getInteger('quantidade') ?? 1;
        for (let n = 1; n <= qtd; n++) {
          const r = rolar(`1d20${bonus ? comSinal(bonus) : ''}`);
          adicionar(canal, { nome: qtd > 1 ? `${nome} ${n}` : nome, total: r.total, bonus });
        }
        return i.reply({ embeds: [embedIniciativa(canal)] });
      }
      case 'ver':
        return i.reply({ embeds: [embedIniciativa(canal)] });
      case 'proximo': {
        const c = combateDo(canal);
        if (!c.lista.length) return i.reply({ content: 'Não tem combate rolando.', flags: MessageFlags.Ephemeral });
        c.vez = (c.vez + 1) % c.lista.length;
        if (c.vez === 0) c.rodada++;
        const atual = c.lista[c.vez];
        return i.reply({ content: `▶️ Vez de **${atual.nome}**${atual.userId ? ` <@${atual.userId}>` : ''}`, embeds: [embedIniciativa(canal)] });
      }
      case 'limpar':
        combates.delete(canal);
        return i.reply('🏳️ Combate encerrado.');
    }
  },
};
