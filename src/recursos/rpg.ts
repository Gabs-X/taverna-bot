import {
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import { db } from '../db.ts';
import { comSinal, formatar, rolar } from '../lib/dados.ts';
import {
  abreviar,
  acharPericia,
  ATRIBUTOS,
  desserializarGraduacoes,
  estadoVida,
  lerGraduacoes,
  modificador,
  normalizar,
  PERICIAS,
  periciaPorId,
  RESISTENCIAS,
  serializarGraduacoes,
  type Atributo,
  type Resistencia,
} from '../lib/dnd35.ts';
import type { Comando } from '../tipos.ts';
import { emoji } from '../lib/servidor.ts';

// ---------- Fichas de D&D 3.5 ----------

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
  bba: number;
  fort: number;
  ref: number;
  von: number;
  ini_extra: number;
  pericias: string;
} & Record<Atributo, number>;

const lerFicha = (guildId: string, userId: string) =>
  db.prepare('SELECT * FROM fichas WHERE guild_id = ? AND user_id = ?').get(guildId, userId) as Ficha | undefined;

const SEM_FICHA = 'Você ainda não tem ficha de D&D 3.5. Crie com `/ficha criar`.';
const LISTA_ATRIBUTOS = Object.keys(ATRIBUTOS) as Atributo[];

const totalResistencia = (f: Ficha, r: Resistencia) => f[r] + modificador(f[RESISTENCIAS[r].atributo]);
const totalPericia = (f: Ficha, id: string, graduacao: number) => graduacao + modificador(f[periciaPorId(id)!.atributo]);
const iniciativaDe = (f: Ficha) => modificador(f.destreza) + f.ini_extra;

function embedFicha(f: Ficha) {
  const atributos = LISTA_ATRIBUTOS.map((a) => `**${abreviar(a)}** ${f[a]} (${comSinal(modificador(f[a]))})`).join('  ·  ');
  const graduacoes = desserializarGraduacoes(f.pericias);
  const pericias = graduacoes.size
    ? [...graduacoes].map(([id, g]) => `${periciaPorId(id)!.nome} ${g} (${comSinal(totalPericia(f, id, g))})`).join(', ')
    : '_nenhuma (use /ficha pericias)_';
  const vida = Math.max(0, f.pv_atual) / f.pv_max;
  const barra = '🟥'.repeat(Math.round(vida * 10)).padEnd(20, '⬛').slice(0, 20);
  const resistencias = (Object.keys(RESISTENCIAS) as Resistencia[])
    .map((r) => `${RESISTENCIAS[r].nome} ${comSinal(totalResistencia(f, r))}`)
    .join(' · ');

  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle(`📖 ${f.nome}`)
    .setDescription(`${[f.raca, f.classe].filter(Boolean).join(' · ')} · nível ${f.nivel} · <@${f.user_id}> · D&D 3.5`)
    .addFields(
      { name: '❤️ Vida', value: `${f.pv_atual}/${f.pv_max} ${barra}\n${estadoVida(f.pv_atual)}`.trim(), inline: false },
      { name: '🛡️ CA', value: `${f.ca}`, inline: true },
      { name: '⚔️ BBA', value: `${comSinal(f.bba)} · CaC ${comSinal(f.bba + modificador(f.forca))} · Dist ${comSinal(f.bba + modificador(f.destreza))}`, inline: true },
      { name: '🏃 Iniciativa', value: comSinal(iniciativaDe(f)), inline: true },
      { name: '🎯 Resistências', value: resistencias },
      { name: 'Atributos', value: atributos },
      { name: 'Perícias (graduação e total)', value: pericias.slice(0, 1024) },
    );
}

const opcaoAtributo = (s: SlashCommandSubcommandBuilder, nome: Atributo) =>
  s.addIntegerOption((o) => o.setName(nome).setDescription(ATRIBUTOS[nome]).setRequired(true).setMinValue(1).setMaxValue(50));

const CAMPOS_NUMERICOS: Record<string, string> = {
  nivel: 'Nível',
  pv_max: 'PV máximo',
  ca: 'CA',
  bba: 'Bônus base de ataque',
  fort: 'Fortitude (base)',
  ref: 'Reflexos (base)',
  von: 'Vontade (base)',
  ini_extra: 'Iniciativa (bônus extra)',
};

export const ficha: Comando = {
  data: new SlashCommandBuilder()
    .setName('ficha')
    .setDescription('Ficha de personagem de D&D 3.5')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => {
      s.setName('criar')
        .setDescription('Cria (ou recria) sua ficha de D&D 3.5')
        .addStringOption((o) => o.setName('nome').setDescription('Nome do personagem').setRequired(true).setMaxLength(60))
        .addStringOption((o) => o.setName('classe').setDescription('Ex.: Guerreiro 3 / Ladino 2').setRequired(true).setMaxLength(40))
        .addIntegerOption((o) => o.setName('nivel').setDescription('Nível de personagem').setRequired(true).setMinValue(1).setMaxValue(40));
      for (const a of LISTA_ATRIBUTOS) opcaoAtributo(s, a);
      return s
        .addIntegerOption((o) => o.setName('pv').setDescription('Pontos de vida máximos').setRequired(true).setMinValue(1).setMaxValue(999))
        .addIntegerOption((o) => o.setName('ca').setDescription('Classe de armadura').setRequired(true).setMinValue(1).setMaxValue(80))
        .addIntegerOption((o) => o.setName('bba').setDescription('Bônus base de ataque').setRequired(true).setMinValue(0).setMaxValue(40))
        .addIntegerOption((o) => o.setName('fort').setDescription('Fortitude base (sem Con)').setRequired(true).setMinValue(0).setMaxValue(30))
        .addIntegerOption((o) => o.setName('ref').setDescription('Reflexos base (sem Des)').setRequired(true).setMinValue(0).setMaxValue(30))
        .addIntegerOption((o) => o.setName('von').setDescription('Vontade base (sem Sab)').setRequired(true).setMinValue(0).setMaxValue(30))
        .addStringOption((o) => o.setName('raca').setDescription('Ex.: Elfo, Anão').setMaxLength(40))
        .addIntegerOption((o) => o.setName('iniciativa').setDescription('Bônus extra de iniciativa (Iniciativa Aprimorada = 4)').setMinValue(-10).setMaxValue(30));
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
              ...Object.entries(CAMPOS_NUMERICOS).map(([value, name]) => ({ name, value })),
              { name: 'Nome', value: 'nome' },
              { name: 'Classe', value: 'classe' },
              { name: 'Raça', value: 'raca' },
              ...LISTA_ATRIBUTOS.map((a) => ({ name: ATRIBUTOS[a], value: a })),
            ),
        )
        .addStringOption((o) => o.setName('valor').setDescription('Novo valor').setRequired(true).setMaxLength(60)),
    )
    .addSubcommand((s) =>
      s
        .setName('pericias')
        .setDescription('Define graduações. Junta com as que já existem; 0 tira')
        .addStringOption((o) =>
          o.setName('lista').setDescription('Ex.: esconder-se 5, ouvir 4, conhecimento (arcano) 6').setRequired(true).setMaxLength(1000),
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
          (guild_id, user_id, nome, classe, raca, nivel, forca, destreza, constituicao, inteligencia, sabedoria, carisma,
           pv_max, pv_atual, ca, bba, fort, ref, von, ini_extra, pericias)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        g,
        i.user.id,
        i.options.getString('nome', true),
        i.options.getString('classe', true),
        i.options.getString('raca') ?? '',
        i.options.getInteger('nivel', true),
        ...LISTA_ATRIBUTOS.map((a) => i.options.getInteger(a, true)),
        pv,
        pv,
        i.options.getInteger('ca', true),
        i.options.getInteger('bba', true),
        i.options.getInteger('fort', true),
        i.options.getInteger('ref', true),
        i.options.getInteger('von', true),
        i.options.getInteger('iniciativa') ?? 0,
        anterior?.pericias ?? '',
      );
      return i.reply({ content: '✅ Ficha salva! Coloque as graduações com `/ficha pericias`.', embeds: [embedFicha(lerFicha(g, i.user.id)!)] });
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
      const novo = Math.max(-10, Math.min(f.pv_max, f.pv_atual + valor));
      db.prepare('UPDATE fichas SET pv_atual = ? WHERE guild_id = ? AND user_id = ?').run(novo, g, i.user.id);
      const estado = estadoVida(novo);
      return i.reply(`${valor < 0 ? '🩸' : '💚'} **${f.nome}**: ${f.pv_atual} → **${novo}**/${f.pv_max} PV.${estado ? ` ${estado}` : ''}`);
    }

    if (sub === 'editar') {
      const campo = i.options.getString('campo', true);
      const valor = i.options.getString('valor', true);
      const numerico = !['nome', 'classe', 'raca'].includes(campo);
      if (numerico && !/^-?\d+$/.test(valor)) return i.reply({ content: 'Esse campo precisa de um número.', flags: MessageFlags.Ephemeral });
      // `campo` vem de uma lista fixa de choices, então pode ir direto na SQL.
      db.prepare(`UPDATE fichas SET ${campo} = ? WHERE guild_id = ? AND user_id = ?`).run(numerico ? Number(valor) : valor, g, i.user.id);
      if (campo === 'pv_max') db.prepare('UPDATE fichas SET pv_atual = MIN(pv_atual, pv_max) WHERE guild_id = ? AND user_id = ?').run(g, i.user.id);
      return i.reply({ embeds: [embedFicha(lerFicha(g, i.user.id)!)] });
    }

    if (sub === 'pericias') {
      try {
        const graduacoes = desserializarGraduacoes(f.pericias);
        for (const [id, n] of lerGraduacoes(i.options.getString('lista', true))) graduacoes.set(id, n);
        db.prepare('UPDATE fichas SET pericias = ? WHERE guild_id = ? AND user_id = ?').run(serializarGraduacoes(graduacoes), g, i.user.id);
        return i.reply({ embeds: [embedFicha(lerFicha(g, i.user.id)!)] });
      } catch (e) {
        return i.reply({
          content: `${(e as Error).message}\nPerícias: ${PERICIAS.map((p) => p.nome).join(', ')}.`.slice(0, 1900),
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (sub === 'apagar') {
      db.prepare('DELETE FROM fichas WHERE guild_id = ? AND user_id = ?').run(g, i.user.id);
      return i.reply({ content: `🗑️ Ficha de **${f.nome}** apagada.`, flags: MessageFlags.Ephemeral });
    }
  },
};

// ---------- Rolagens ----------

const autor = (i: ChatInputCommandInteraction) => ({
  name: i.member && 'displayName' in i.member ? i.member.displayName : i.user.username,
  iconURL: i.user.displayAvatarURL(),
});

// `natural`: destaca 20 e 1 naturais (ataques e resistências no 3.5; perícias não têm crítico).
async function responderRolagem(i: ChatInputCommandInteraction, titulo: string, expressao: string, natural = true, extra = '') {
  let r;
  try {
    r = rolar(expressao);
  } catch (e) {
    return i.reply({ content: `🎲 ${(e as Error).message}`, flags: MessageFlags.Ephemeral });
  }
  const nat = natural ? r.d20 : undefined;
  const destaque = nat === 20 ? `\n${emoji(i.guild, 'd20_critico', '✨')} **20 natural!**` : nat === 1 ? `\n${emoji(i.guild, 'd20_falha', '💀')} **1 natural!**` : '';
  const embed = new EmbedBuilder()
    .setColor(nat === 20 ? 0xf1c40f : nat === 1 ? 0x992d22 : 0x8e44ad)
    .setAuthor(autor(i))
    .setTitle(`${emoji(i.guild, 'd20', '🎲')} ${titulo}: ${r.total}`)
    .setDescription(`\`${r.expressao}\`\n${formatar(r)} = **${r.total}**${destaque}${extra}`.slice(0, 4000));
  return i.reply({ embeds: [embed] });
}

export const rolarComando: Comando = {
  data: new SlashCommandBuilder()
    .setName('rolar')
    .setDescription('Rola dados: 1d20+5, 2d6, 4d6kh3, 8d6...')
    .addStringOption((o) => o.setName('dados').setDescription('Ex.: 1d20+5, 2d8+3, 4d6kh3').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('motivo').setDescription('Ex.: ataque com espada').setMaxLength(80)),

  async executar(i) {
    const motivo = i.options.getString('motivo');
    return responderRolagem(i, motivo ? `🎲 ${motivo}` : '🎲 Rolagem', i.options.getString('dados', true));
  },
};

const escolhasAtributo = LISTA_ATRIBUTOS.map((a) => ({ name: ATRIBUTOS[a], value: a }));
const opcaoBonus = (s: SlashCommandSubcommandBuilder) =>
  s.addIntegerOption((o) => o.setName('bonus').setDescription('Bônus ou penalidade extra (ex.: 2, -4)').setMinValue(-50).setMaxValue(50));
const d20com = (bonus: number) => `1d20${bonus ? comSinal(bonus) : ''}`;

export const teste: Comando = {
  data: new SlashCommandBuilder()
    .setName('teste')
    .setDescription('Testes de D&D 3.5 usando a sua ficha')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      opcaoBonus(
        s
          .setName('pericia')
          .setDescription('d20 + graduação + atributo')
          .addStringOption((o) => o.setName('pericia').setDescription('Qual perícia (comece a digitar)').setRequired(true).setAutocomplete(true)),
      ),
    )
    .addSubcommand((s) =>
      opcaoBonus(
        s
          .setName('atributo')
          .setDescription('Teste puro de atributo')
          .addStringOption((o) => o.setName('atributo').setDescription('Qual atributo').setRequired(true).addChoices(...escolhasAtributo)),
      ),
    )
    .addSubcommand((s) =>
      opcaoBonus(
        s
          .setName('resistencia')
          .setDescription('Fortitude, Reflexos ou Vontade')
          .addStringOption((o) =>
            o
              .setName('tipo')
              .setDescription('Qual resistência')
              .setRequired(true)
              .addChoices(...(Object.keys(RESISTENCIAS) as Resistencia[]).map((r) => ({ name: RESISTENCIAS[r].nome, value: r }))),
          ),
      ),
    )
    .addSubcommand((s) =>
      opcaoBonus(
        s
          .setName('ataque')
          .setDescription('d20 + BBA + For (corpo a corpo) ou Des (distância); confirma crítico sozinho')
          .addStringOption((o) =>
            o
              .setName('tipo')
              .setDescription('Corpo a corpo ou à distância')
              .setRequired(true)
              .addChoices({ name: 'Corpo a corpo', value: 'cac' }, { name: 'À distância', value: 'dist' }),
          )
          .addIntegerOption((o) => o.setName('margem').setDescription('Margem de ameaça: 20 (padrão), 19 para 19-20, 18 para 18-20...').setMinValue(10).setMaxValue(20)),
      ).addStringOption((o) => o.setName('arma').setDescription('Ex.: espada longa').setMaxLength(60)),
    )
    .addSubcommand((s) => s.setName('estabilizar').setDescription('Morrendo: 10% de chance de estabilizar nesta rodada')),

  async autocompletar(i) {
    const digitado = normalizar(i.options.getFocused());
    const f = lerFicha(i.guildId!, i.user.id);
    const graduacoes = f ? desserializarGraduacoes(f.pericias) : new Map<string, number>();
    const opcoes = PERICIAS.filter((p) => normalizar(p.nome).includes(digitado))
      // As que a pessoa tem graduação aparecem primeiro.
      .sort((a, b) => (graduacoes.get(b.id) ?? 0) - (graduacoes.get(a.id) ?? 0))
      .slice(0, 25)
      .map((p) => {
        const g = graduacoes.get(p.id);
        const total = f ? ` · ${comSinal(totalPericia(f, p.id, g ?? 0))}` : '';
        return { name: `${p.nome} (${abreviar(p.atributo)})${g ? ` · grad ${g}` : ''}${total}`, value: p.id };
      });
    return i.respond(opcoes);
  },

  async executar(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'estabilizar') {
      const r = rolar('1d100');
      const texto = r.total <= 10 ? '\n💚 **Estabilizou!** Para de perder PV.' : '\n🩸 Não estabilizou: perde 1 PV.';
      return responderRolagem(i, '💀 Estabilizar (d% ≤ 10)', '1d100', false, texto);
    }

    const f = lerFicha(i.guildId!, i.user.id);
    if (!f) return i.reply({ content: SEM_FICHA, flags: MessageFlags.Ephemeral });
    const extra = i.options.getInteger('bonus') ?? 0;

    if (sub === 'pericia') {
      const valor = i.options.getString('pericia', true);
      const p = periciaPorId(valor) ?? acharPericia(valor);
      if (!p) return i.reply({ content: 'Escolha uma perícia da lista.', flags: MessageFlags.Ephemeral });
      const g = desserializarGraduacoes(f.pericias).get(p.id) ?? 0;
      if (p.treinada && !g) {
        return i.reply({ content: `**${p.nome}** só pode ser usada com graduação, e ${f.nome} não tem nenhuma.`, flags: MessageFlags.Ephemeral });
      }
      const bonus = totalPericia(f, p.id, g) + extra;
      const detalhe = `\ngraduação ${g} · ${abreviar(p.atributo)} ${comSinal(modificador(f[p.atributo]))}`;
      return responderRolagem(i, `${f.nome} · ${p.nome}`, d20com(bonus), false, detalhe);
    }

    if (sub === 'atributo') {
      const a = i.options.getString('atributo', true) as Atributo;
      return responderRolagem(i, `${f.nome} · ${ATRIBUTOS[a]}`, d20com(modificador(f[a]) + extra), false);
    }

    if (sub === 'resistencia') {
      const r = i.options.getString('tipo', true) as Resistencia;
      return responderRolagem(i, `${f.nome} · ${RESISTENCIAS[r].nome}`, d20com(totalResistencia(f, r) + extra));
    }

    // Ataque: 20 natural sempre acerta, 1 natural sempre erra; ameaça pede rolagem de confirmação.
    const distancia = i.options.getString('tipo', true) === 'dist';
    const bonus = f.bba + modificador(distancia ? f.destreza : f.forca) + extra;
    const margem = i.options.getInteger('margem') ?? 20;
    const arma = i.options.getString('arma');
    const ataque = rolar(d20com(bonus));
    const natural = ataque.d20!;
    let nota = natural === 20 ? `\n${emoji(i.guild, 'd20_critico', '✅')} Acerto automático.` : natural === 1 ? `\n${emoji(i.guild, 'd20_falha', '❌')} Erro automático.` : '';
    if (natural >= margem) {
      const confirmacao = rolar(d20com(bonus));
      nota += `\n⚠️ **Ameaça de crítico!** Confirmação: ${formatar(confirmacao)} = **${confirmacao.total}**. Se acertar a CA, é crítico.`;
    }
    const embed = new EmbedBuilder()
      .setColor(natural >= margem ? 0xf1c40f : natural === 1 ? 0x992d22 : 0xc0392b)
      .setAuthor(autor(i))
      .setTitle(`⚔️ ${f.nome} · ${arma ?? (distancia ? 'ataque à distância' : 'ataque corpo a corpo')}: ${ataque.total}`)
      .setDescription(`\`${ataque.expressao}\`${margem < 20 ? ` · ameaça ${margem}-20` : ''}\n${formatar(ataque)} = **${ataque.total}**${nota}`);
    return i.reply({ embeds: [embed] });
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
  // Empate: maior bônus de iniciativa vai primeiro.
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
    .setDescription('Ordem de combate da mesa de D&D (por canal)')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('entrar')
        .setDescription('Rola a sua iniciativa (Destreza + bônus da ficha)')
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
        const bonus = i.options.getInteger('bonus') ?? (f ? iniciativaDe(f) : 0);
        const r = rolar(d20com(bonus));
        adicionar(canal, { nome: f?.nome ?? i.user.displayName, total: r.total, bonus, userId: i.user.id });
        return i.reply({ content: `🎲 ${f?.nome ?? i.user} rolou **${r.total}** (${formatar(r)}).`, embeds: [embedIniciativa(canal)] });
      }
      case 'npc': {
        const nome = i.options.getString('nome', true);
        const bonus = i.options.getInteger('bonus') ?? 0;
        const qtd = i.options.getInteger('quantidade') ?? 1;
        for (let n = 1; n <= qtd; n++) {
          const r = rolar(d20com(bonus));
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
