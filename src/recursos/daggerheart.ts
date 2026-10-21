import {
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import { db } from '../db.ts';
import { comSinal } from '../lib/dados.ts';
import {
  barra,
  desserializarExperiencias,
  GRAVIDADE,
  lerExperiencias,
  MAX_ESPERANCA,
  MAX_MEDO,
  pvPorDano,
  rolarDualidade,
  serializarExperiencias,
  TRACOS,
  type Traco,
} from '../lib/daggerheart.ts';
import { ehMestre } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';

type FichaDH = {
  guild_id: string;
  user_id: string;
  nome: string;
  classe: string;
  ancestralidade: string;
  comunidade: string;
  nivel: number;
  evasao: number;
  proficiencia: number;
  pv_max: number;
  pv: number;
  estresse_max: number;
  estresse: number;
  esperanca: number;
  armadura_max: number;
  armadura: number;
  limiar_maior: number;
  limiar_grave: number;
  experiencias: string;
} & Record<Traco, number>;

const LISTA_TRACOS = Object.keys(TRACOS) as Traco[];
const COR = { esperanca: 0xf1c40f, medo: 0x6c3483, critico: 0x00e5ff, ficha: 0x2e86c1 } as const;
const SEM_FICHA = 'Você ainda não tem ficha de Daggerheart. Crie com `/dh ficha criar`.';

const lerFicha = (g: string, u: string) =>
  db.prepare('SELECT * FROM fichas_dh WHERE guild_id = ? AND user_id = ?').get(g, u) as FichaDH | undefined;

const atualizar = (f: FichaDH, campos: Partial<Record<'pv' | 'estresse' | 'esperanca' | 'armadura', number>>) => {
  for (const [campo, valor] of Object.entries(campos)) {
    db.prepare(`UPDATE fichas_dh SET ${campo} = ? WHERE guild_id = ? AND user_id = ?`).run(valor, f.guild_id, f.user_id);
  }
};

// ---------- Medo do Mestre (um por servidor) ----------

const lerMedo = (g: string) => (db.prepare('SELECT medo FROM dh_medo WHERE guild_id = ?').get(g) as { medo: number } | undefined)?.medo ?? 0;

function ajustarMedo(g: string, delta: number) {
  const novo = Math.max(0, Math.min(MAX_MEDO, lerMedo(g) + delta));
  db.prepare('INSERT INTO dh_medo (guild_id, medo) VALUES (?, ?) ON CONFLICT (guild_id) DO UPDATE SET medo = excluded.medo').run(g, novo);
  return novo;
}

const textoMedo = (medo: number) => `😱 Medo do Mestre: **${medo}**/${MAX_MEDO} ${barra(medo, MAX_MEDO)}`;

// ---------- Ficha ----------

function embedFicha(f: FichaDH) {
  const tracos = LISTA_TRACOS.map((t) => `**${TRACOS[t]}** ${comSinal(f[t])}`).join('  ·  ');
  const experiencias = desserializarExperiencias(f.experiencias);
  return new EmbedBuilder()
    .setColor(COR.ficha)
    .setTitle(`🌗 ${f.nome}`)
    .setDescription(
      `${[f.ancestralidade, f.comunidade, f.classe].filter(Boolean).join(' · ')} · nível ${f.nivel} · <@${f.user_id}> · Daggerheart`,
    )
    .addFields(
      { name: '❤️ PV', value: `${f.pv}/${f.pv_max} ${barra(f.pv, f.pv_max)}`, inline: true },
      { name: '😰 Estresse', value: `${f.estresse}/${f.estresse_max} ${barra(f.estresse, f.estresse_max)}`, inline: true },
      { name: '✨ Esperança', value: `${f.esperanca}/${MAX_ESPERANCA} ${barra(f.esperanca, MAX_ESPERANCA)}`, inline: true },
      { name: '🛡️ Armadura', value: `${f.armadura}/${f.armadura_max} ${barra(f.armadura, f.armadura_max)}`, inline: true },
      { name: '💨 Evasão', value: `${f.evasao}`, inline: true },
      { name: '🗡️ Proficiência', value: `${f.proficiencia}`, inline: true },
      {
        name: '🩸 Limiares de dano',
        value: `Menor 1–${f.limiar_maior - 1} (1 PV) · Maior ${f.limiar_maior}–${f.limiar_grave - 1} (2 PV) · Grave ${f.limiar_grave}+ (3 PV)`,
      },
      { name: 'Traços', value: tracos },
      {
        name: 'Experiências',
        value: experiencias.length ? experiencias.map((e) => `${e.nome} +${e.bonus}`).join(' · ') : '_nenhuma (use /dh ficha experiencias)_',
      },
    );
}

const opcaoTraco = (s: SlashCommandSubcommandBuilder, t: Traco) =>
  s.addIntegerOption((o) => o.setName(t).setDescription(`${TRACOS[t]} (ex.: +2, 0, -1)`).setRequired(true).setMinValue(-5).setMaxValue(10));

const CAMPOS: Record<string, string> = {
  nivel: 'Nível',
  evasao: 'Evasão',
  proficiencia: 'Proficiência',
  pv_max: 'PV máximo',
  estresse_max: 'Estresse máximo',
  armadura_max: 'Espaços de armadura',
  limiar_maior: 'Limiar Maior',
  limiar_grave: 'Limiar Grave',
  ...TRACOS,
};
const CAMPOS_TEXTO = { nome: 'Nome', classe: 'Classe', ancestralidade: 'Ancestralidade', comunidade: 'Comunidade' };

async function fichaSub(i: ChatInputCommandInteraction, sub: string) {
  const g = i.guildId!;

  if (sub === 'criar') {
    const maior = i.options.getInteger('limiar_maior', true);
    const grave = i.options.getInteger('limiar_grave', true);
    if (grave <= maior) return i.reply({ content: 'O limiar Grave precisa ser maior que o Maior.', flags: MessageFlags.Ephemeral });
    const anterior = lerFicha(g, i.user.id);
    db.prepare(
      `INSERT OR REPLACE INTO fichas_dh
        (guild_id, user_id, nome, classe, ancestralidade, comunidade, nivel, agilidade, forca, acuidade, instinto, presenca, conhecimento,
         evasao, proficiencia, pv_max, pv, estresse_max, estresse, esperanca, armadura_max, armadura, limiar_maior, limiar_grave, experiencias)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 2, ?, 0, ?, ?, ?)`,
    ).run(
      g,
      i.user.id,
      i.options.getString('nome', true),
      i.options.getString('classe', true),
      i.options.getString('ancestralidade') ?? '',
      i.options.getString('comunidade') ?? '',
      i.options.getInteger('nivel', true),
      ...LISTA_TRACOS.map((t) => i.options.getInteger(t, true)),
      i.options.getInteger('evasao', true),
      i.options.getInteger('proficiencia') ?? 1,
      i.options.getInteger('pv', true),
      i.options.getInteger('estresse') ?? 6,
      i.options.getInteger('armadura', true),
      maior,
      grave,
      anterior?.experiencias ?? '',
    );
    return i.reply({
      content: '✅ Ficha salva, começando com 2 de Esperança. Coloque as experiências com `/dh ficha experiencias`.',
      embeds: [embedFicha(lerFicha(g, i.user.id)!)],
    });
  }

  if (sub === 'ver') {
    const alvo = i.options.getUser('jogador') ?? i.user;
    const f = lerFicha(g, alvo.id);
    if (!f) return i.reply({ content: alvo.id === i.user.id ? SEM_FICHA : `${alvo} ainda não tem ficha de Daggerheart.`, flags: MessageFlags.Ephemeral });
    return i.reply({ embeds: [embedFicha(f)] });
  }

  const f = lerFicha(g, i.user.id);
  if (!f) return i.reply({ content: SEM_FICHA, flags: MessageFlags.Ephemeral });

  if (sub === 'editar') {
    const campo = i.options.getString('campo', true);
    const valor = i.options.getString('valor', true);
    const numerico = !(campo in CAMPOS_TEXTO);
    if (numerico && !/^[-+]?\d+$/.test(valor)) return i.reply({ content: 'Esse campo precisa de um número.', flags: MessageFlags.Ephemeral });
    // `campo` vem de uma lista fixa de choices, então pode ir direto na SQL.
    db.prepare(`UPDATE fichas_dh SET ${campo} = ? WHERE guild_id = ? AND user_id = ?`).run(numerico ? Number(valor) : valor, g, i.user.id);
    db.prepare(
      'UPDATE fichas_dh SET pv = MIN(pv, pv_max), estresse = MIN(estresse, estresse_max), armadura = MIN(armadura, armadura_max) WHERE guild_id = ? AND user_id = ?',
    ).run(g, i.user.id);
    return i.reply({ embeds: [embedFicha(lerFicha(g, i.user.id)!)] });
  }

  if (sub === 'experiencias') {
    const lista = lerExperiencias(i.options.getString('lista', true));
    db.prepare('UPDATE fichas_dh SET experiencias = ? WHERE guild_id = ? AND user_id = ?').run(serializarExperiencias(lista), g, i.user.id);
    return i.reply({ embeds: [embedFicha(lerFicha(g, i.user.id)!)] });
  }

  if (sub === 'apagar') {
    db.prepare('DELETE FROM fichas_dh WHERE guild_id = ? AND user_id = ?').run(g, i.user.id);
    return i.reply({ content: `🗑️ Ficha de **${f.nome}** apagada.`, flags: MessageFlags.Ephemeral });
  }
}

// ---------- Rolagem de dualidade ----------

async function rolarSub(i: ChatInputCommandInteraction) {
  const g = i.guildId!;
  const f = lerFicha(g, i.user.id);
  const traco = i.options.getString('traco') as Traco | null;
  const nomeExperiencia = i.options.getString('experiencia');
  const reacao = i.options.getBoolean('reacao') ?? false;
  if ((traco || nomeExperiencia) && !f) return i.reply({ content: SEM_FICHA, flags: MessageFlags.Ephemeral });

  const partes: string[] = [];
  let modificador = i.options.getInteger('modificador') ?? 0;
  if (modificador) partes.push(`bônus ${comSinal(modificador)}`);
  if (traco) {
    modificador += f![traco];
    partes.unshift(`${TRACOS[traco]} ${comSinal(f![traco])}`);
  }

  // Usar uma Experiência custa 1 de Esperança.
  let esperanca = f?.esperanca ?? 0;
  if (nomeExperiencia) {
    const exp = desserializarExperiencias(f!.experiencias).find((e) => e.nome === nomeExperiencia);
    if (!exp) return i.reply({ content: 'Escolha uma experiência da sua ficha.', flags: MessageFlags.Ephemeral });
    if (esperanca < 1) return i.reply({ content: 'Sem Esperança para usar uma Experiência.', flags: MessageFlags.Ephemeral });
    esperanca--;
    modificador += exp.bonus;
    partes.push(`${exp.nome} +${exp.bonus} (−1 Esperança)`);
  }

  const vantagem = i.options.getString('vantagem');
  const r = rolarDualidade(modificador, vantagem === 'vantagem' ? 1 : vantagem === 'desvantagem' ? -1 : 0);
  if (r.d6) partes.push(`${vantagem === 'vantagem' ? 'vantagem +' : 'desvantagem −'}[${r.d6}]`);

  // Esperança e Medo gerados (rolagens de reação não geram nenhum dos dois).
  const efeitos: string[] = [];
  let estresse = f?.estresse ?? 0;
  if (!reacao) {
    if (r.resultado === 'critico' || r.resultado === 'esperanca') {
      if (f) {
        esperanca = Math.min(MAX_ESPERANCA, esperanca + 1);
        efeitos.push(`✨ Esperança: **${esperanca}**/${MAX_ESPERANCA}`);
      } else efeitos.push('✨ Ganhe 1 de Esperança');
    }
    if (r.resultado === 'critico' && f && estresse > 0) {
      estresse--;
      efeitos.push(`😌 Limpou 1 Estresse (${estresse}/${f.estresse_max})`);
    }
    if (r.resultado === 'medo') efeitos.push(textoMedo(ajustarMedo(g, 1)));
  }
  if (f) atualizar(f, { esperanca, estresse });

  const dificuldade = i.options.getInteger('dificuldade');
  const sucesso = r.resultado === 'critico' || (dificuldade !== null && r.total >= dificuldade);
  const rotulo = { critico: '💎 SUCESSO CRÍTICO!', esperanca: 'com Esperança ✨', medo: 'com Medo 😱' }[r.resultado];
  const desfecho =
    dificuldade === null
      ? ''
      : `\n${sucesso ? '✅ **Sucesso**' : '❌ **Falha**'} contra dificuldade ${dificuldade}`;

  const motivo = i.options.getString('motivo');
  const quem = f?.nome ?? (i.member as GuildMember).displayName;
  const embed = new EmbedBuilder()
    .setColor(COR[r.resultado])
    .setAuthor({ name: (i.member as GuildMember).displayName, iconURL: i.user.displayAvatarURL() })
    .setTitle(`🌗 ${quem}${traco ? ` · ${TRACOS[traco]}` : ''}${motivo ? ` · ${motivo}` : ''}: ${r.total} ${rotulo}`)
    .setDescription(
      [
        `Esperança **[${r.esperanca}]** · Medo **[${r.medo}]**${partes.length ? ` · ${partes.join(' · ')}` : ''} = **${r.total}**${desfecho}`,
        r.resultado === 'critico' && !reacao ? 'Dados iguais: sucesso automático.' : null,
        reacao ? '_Rolagem de reação: não gera Esperança nem Medo._' : null,
        efeitos.length ? efeitos.join('\n') : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  return i.reply({ embeds: [embed] });
}

// ---------- Dano e recursos ----------

const textoMorte =
  '\n💀 **Último PV marcado!** Faça seu Movimento de Morte: **Explosão de Glória**, **Evitar a Morte** ou **Arriscar Tudo**.';

async function danoSub(i: ChatInputCommandInteraction) {
  const f = lerFicha(i.guildId!, i.user.id);
  if (!f) return i.reply({ content: SEM_FICHA, flags: MessageFlags.Ephemeral });
  const dano = i.options.getInteger('valor', true);
  const querArmadura = i.options.getBoolean('armadura') ?? false;
  const temArmadura = f.armadura < f.armadura_max;
  const usaArmadura = querArmadura && temArmadura && dano > 0;

  const semArmadura = pvPorDano(dano, f.limiar_maior, f.limiar_grave);
  const marcados = pvPorDano(dano, f.limiar_maior, f.limiar_grave, usaArmadura);
  const pv = Math.min(f.pv_max, f.pv + marcados);
  atualizar(f, { pv, armadura: f.armadura + (usaArmadura ? 1 : 0) });

  const linhas = [
    `🩸 **${f.nome}** levou **${dano}** de dano: ${GRAVIDADE[semArmadura]}.`,
    usaArmadura ? `🛡️ Marcou 1 de armadura (${f.armadura + 1}/${f.armadura_max}) e reduziu para ${GRAVIDADE[marcados]}.` : null,
    querArmadura && !temArmadura ? '🛡️ Sem espaços de armadura livres.' : null,
    `❤️ Marcou **${marcados}** PV: ${pv}/${f.pv_max} ${barra(pv, f.pv_max)}`,
  ];
  return i.reply(linhas.filter(Boolean).join('\n') + (pv >= f.pv_max && marcados ? textoMorte : ''));
}

const RECURSOS = {
  pv: 'PV',
  estresse: 'Estresse',
  esperanca: 'Esperança',
  armadura: 'Armadura',
} as const;
type Recurso = keyof typeof RECURSOS;

async function marcarSub(i: ChatInputCommandInteraction) {
  const f = lerFicha(i.guildId!, i.user.id);
  if (!f) return i.reply({ content: SEM_FICHA, flags: MessageFlags.Ephemeral });
  const recurso = i.options.getString('recurso', true) as Recurso;
  const valor = i.options.getInteger('valor', true);
  const max = { pv: f.pv_max, estresse: f.estresse_max, esperanca: MAX_ESPERANCA, armadura: f.armadura_max }[recurso];

  const bruto = f[recurso] + valor;
  const novo = Math.max(0, Math.min(max, bruto));
  const campos: Partial<Record<Recurso, number>> = { [recurso]: novo };
  const avisos: string[] = [];

  // Sem Estresse livre para marcar, marca PV no lugar.
  if (recurso === 'estresse' && bruto > max) {
    const pv = Math.min(f.pv_max, f.pv + (bruto - max));
    campos.pv = pv;
    avisos.push(`❤️ Estresse cheio: marcou ${bruto - max} PV no lugar (${pv}/${f.pv_max}).${pv >= f.pv_max ? textoMorte : ''}`);
  }
  if (recurso === 'estresse' && novo === max) avisos.push('⚠️ Todo o Estresse marcado: você está **Vulnerável**.');
  if (recurso === 'pv' && novo >= max && valor > 0) avisos.push(textoMorte.trim());
  atualizar(f, campos);

  const verbo = valor >= 0 ? 'marcou' : 'limpou';
  const texto = recurso === 'esperanca' ? (valor >= 0 ? 'ganhou' : 'gastou') : verbo;
  return i.reply(
    [`**${f.nome}** ${texto} ${Math.abs(valor)} de ${RECURSOS[recurso]}: **${novo}**/${max} ${barra(novo, max)}`, ...avisos].join('\n'),
  );
}

async function medoSub(i: ChatInputCommandInteraction) {
  const g = i.guildId!;
  const ajuste = i.options.getInteger('ajuste');
  if (ajuste === null) return i.reply(textoMedo(lerMedo(g)));
  if (!ehMestre(i.member as GuildMember)) {
    return i.reply({ content: 'Só o Mestre mexe no Medo. Você pode ver com `/dh medo`.', flags: MessageFlags.Ephemeral });
  }
  return i.reply(`${ajuste >= 0 ? 'O Mestre ganhou' : 'O Mestre gastou'} ${Math.abs(ajuste)} de Medo.\n${textoMedo(ajustarMedo(g, ajuste))}`);
}

// ---------- Comando ----------

export const dh: Comando = {
  data: new SlashCommandBuilder()
    .setName('dh')
    .setDescription('Daggerheart: dados de dualidade, ficha, dano, Esperança e Medo')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('rolar')
        .setDescription('Dados de dualidade (2d12): Esperança e Medo')
        .addStringOption((o) =>
          o
            .setName('traco')
            .setDescription('Traço da sua ficha')
            .addChoices(...LISTA_TRACOS.map((t) => ({ name: TRACOS[t], value: t }))),
        )
        .addStringOption((o) => o.setName('experiencia').setDescription('Usar uma Experiência (custa 1 de Esperança)').setAutocomplete(true))
        .addStringOption((o) =>
          o
            .setName('vantagem')
            .setDescription('Vantagem soma 1d6, desvantagem subtrai')
            .addChoices({ name: 'Vantagem', value: 'vantagem' }, { name: 'Desvantagem', value: 'desvantagem' }),
        )
        .addIntegerOption((o) => o.setName('modificador').setDescription('Bônus ou penalidade extra').setMinValue(-20).setMaxValue(20))
        .addIntegerOption((o) => o.setName('dificuldade').setDescription('Dificuldade, para dizer se passou').setMinValue(1).setMaxValue(50))
        .addBooleanOption((o) => o.setName('reacao').setDescription('Rolagem de reação (não gera Esperança nem Medo)'))
        .addStringOption((o) => o.setName('motivo').setDescription('Ex.: escalar a muralha').setMaxLength(60)),
    )
    .addSubcommand((s) =>
      s
        .setName('dano')
        .setDescription('Recebe dano: marca PV pelos seus limiares')
        .addIntegerOption((o) => o.setName('valor').setDescription('Dano recebido').setRequired(true).setMinValue(0).setMaxValue(999))
        .addBooleanOption((o) => o.setName('armadura').setDescription('Marcar 1 espaço de armadura para reduzir')),
    )
    .addSubcommand((s) =>
      s
        .setName('marcar')
        .setDescription('Marca ou limpa PV, Estresse, Esperança ou Armadura')
        .addStringOption((o) =>
          o
            .setName('recurso')
            .setDescription('O quê')
            .setRequired(true)
            .addChoices(...(Object.keys(RECURSOS) as Recurso[]).map((r) => ({ name: RECURSOS[r], value: r }))),
        )
        .addIntegerOption((o) => o.setName('valor').setDescription('+2 marca/ganha 2, -1 limpa/gasta 1').setRequired(true).setMinValue(-12).setMaxValue(12)),
    )
    .addSubcommand((s) =>
      s
        .setName('medo')
        .setDescription('Mostra o Medo do Mestre; o Mestre pode somar ou gastar')
        .addIntegerOption((o) => o.setName('ajuste').setDescription('Ex.: 2 ou -1 (só o Mestre)').setMinValue(-12).setMaxValue(12)),
    )
    .addSubcommandGroup((grupo) =>
      grupo
        .setName('ficha')
        .setDescription('Ficha de Daggerheart')
        .addSubcommand((s) => {
          s.setName('criar')
            .setDescription('Cria (ou recria) sua ficha de Daggerheart')
            .addStringOption((o) => o.setName('nome').setDescription('Nome do personagem').setRequired(true).setMaxLength(60))
            .addStringOption((o) => o.setName('classe').setDescription('Ex.: Patrulheiro (Andarilho)').setRequired(true).setMaxLength(50))
            .addIntegerOption((o) => o.setName('nivel').setDescription('1 a 10').setRequired(true).setMinValue(1).setMaxValue(10));
          for (const t of LISTA_TRACOS) opcaoTraco(s, t);
          return s
            .addIntegerOption((o) => o.setName('evasao').setDescription('Evasão').setRequired(true).setMinValue(1).setMaxValue(40))
            .addIntegerOption((o) => o.setName('pv').setDescription('Espaços de PV').setRequired(true).setMinValue(1).setMaxValue(12))
            .addIntegerOption((o) => o.setName('armadura').setDescription('Espaços de armadura').setRequired(true).setMinValue(0).setMaxValue(12))
            .addIntegerOption((o) => o.setName('limiar_maior').setDescription('Limiar de dano Maior').setRequired(true).setMinValue(1).setMaxValue(99))
            .addIntegerOption((o) => o.setName('limiar_grave').setDescription('Limiar de dano Grave').setRequired(true).setMinValue(2).setMaxValue(199))
            .addIntegerOption((o) => o.setName('estresse').setDescription('Espaços de Estresse (padrão: 6)').setMinValue(1).setMaxValue(12))
            .addIntegerOption((o) => o.setName('proficiencia').setDescription('Proficiência (padrão: 1)').setMinValue(1).setMaxValue(6))
            .addStringOption((o) => o.setName('ancestralidade').setDescription('Ex.: Fungril, Humano').setMaxLength(40))
            .addStringOption((o) => o.setName('comunidade').setDescription('Ex.: Nascido nas Montanhas').setMaxLength(40));
        })
        .addSubcommand((s) =>
          s
            .setName('ver')
            .setDescription('Mostra uma ficha')
            .addUserOption((o) => o.setName('jogador').setDescription('De quem (padrão: você)')),
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
                .addChoices(...Object.entries({ ...CAMPOS, ...CAMPOS_TEXTO }).map(([value, name]) => ({ name, value }))),
            )
            .addStringOption((o) => o.setName('valor').setDescription('Novo valor').setRequired(true).setMaxLength(60)),
        )
        .addSubcommand((s) =>
          s
            .setName('experiencias')
            .setDescription('Define suas Experiências (substitui a lista)')
            .addStringOption((o) =>
              o.setName('lista').setDescription('Ex.: Ladrão de Cofres +2, Criado nas Ruas +2').setRequired(true).setMaxLength(500),
            ),
        )
        .addSubcommand((s) => s.setName('apagar').setDescription('Apaga a sua ficha de Daggerheart')),
    ),

  async autocompletar(i) {
    const f = lerFicha(i.guildId!, i.user.id);
    const digitado = i.options.getFocused().toLowerCase();
    const opcoes = desserializarExperiencias(f?.experiencias ?? '')
      .filter((e) => e.nome.toLowerCase().includes(digitado))
      .slice(0, 25)
      .map((e) => ({ name: `${e.nome} +${e.bonus}`, value: e.nome }));
    return i.respond(opcoes);
  },

  async executar(i) {
    if (i.options.getSubcommandGroup() === 'ficha') return fichaSub(i, i.options.getSubcommand());
    switch (i.options.getSubcommand()) {
      case 'rolar':
        return rolarSub(i);
      case 'dano':
        return danoSub(i);
      case 'marcar':
        return marcarSub(i);
      case 'medo':
        return medoSub(i);
    }
  },
};
