import {
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type Client,
  type Guild,
  type Interaction,
} from 'discord.js';
import { CANAIS } from '../config.ts';
import { db } from '../db.ts';
import { agruparLinhas, descreverBotao, descreverComando, type OpcaoBruta } from '../lib/registro.ts';
import { canalTexto } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';

// Log de tudo o que o bot faz para cada pessoa: vai para o banco (consulta com /logs),
// para o terminal e para o #logs (agrupado a cada poucos segundos para não estourar o limite do Discord).


const DIAS_GUARDADOS = 30;
const INTERVALO_ENVIO = 4_000;

export type Tipo = 'comando' | 'botao' | 'formulario' | 'auto' | 'servidor';
const ICONE: Record<Tipo, string> = { comando: '⌨️', botao: '🖱️', formulario: '📝', auto: '🤖', servidor: '🏠' };

type Registro = {
  guild: Guild;
  userId?: string;
  tipo: Tipo;
  acao: string;
  canalId?: string | null;
  ok?: boolean;
  detalhe?: string;
};

const filas = new Map<string, { linhas: string[]; timer?: NodeJS.Timeout }>();

const hora = (d = new Date()) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function nomeDe(guild: Guild, userId?: string) {
  if (!userId) return 'sistema';
  const m = guild.members.cache.get(userId);
  return m ? `${m.displayName} (@${m.user.username})` : userId;
}

export function registrar(r: Registro) {
  const ok = r.ok ?? true;
  db.prepare('INSERT INTO logs (guild_id, user_id, tipo, acao, canal_id, ok, detalhe, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    r.guild.id, r.userId ?? null, r.tipo, r.acao, r.canalId ?? null, ok ? 1 : 0, r.detalhe ?? null, Date.now(),
  );

  const quem = r.userId ? `**${nomeDe(r.guild, r.userId)}** <@${r.userId}>` : '**sistema**';
  const onde = r.canalId ? ` · em <#${r.canalId}>` : '';
  const status = ok ? '' : ' · ❌ **erro**';
  const extra = r.detalhe ? ` · ${r.detalhe}` : '';
  const linha = `\`${hora()}\` ${ICONE[r.tipo]} ${quem} · ${r.acao}${onde}${status}${extra}`;
  console.log(`[log] ${r.guild.name} · ${nomeDe(r.guild, r.userId)} [${r.userId ?? '-'}] · ${r.tipo} · ${r.acao}${ok ? '' : ' · ERRO'}${extra}`);

  const fila = filas.get(r.guild.id) ?? { linhas: [] };
  fila.linhas.push(linha);
  filas.set(r.guild.id, fila);
  fila.timer ??= setTimeout(() => enviar(r.guild), INTERVALO_ENVIO);
}

async function enviar(guild: Guild) {
  const fila = filas.get(guild.id);
  if (!fila) return;
  filas.delete(guild.id);
  const canal = canalTexto(guild, CANAIS.logs);
  if (!canal) return;
  for (const bloco of agruparLinhas(fila.linhas)) {
    await canal.send({ content: bloco, allowedMentions: { parse: [] } }).catch((e) => console.error('[log] não consegui enviar ao #logs', e));
  }
}

/** Interação (comando, botão, formulário) com o resultado. Chamado pelo index para toda interação. */
export function registrarInteracao(i: Interaction, erro?: unknown) {
  if (!i.inGuild() || !i.guild || i.isAutocomplete()) return;
  let tipo: Tipo;
  let acao: string;
  if (i.isChatInputCommand()) {
    tipo = 'comando';
    acao = descreverComando(i.commandName, i.options.data as readonly OpcaoBruta[]);
  } else if (i.isButton()) {
    tipo = 'botao';
    acao = descreverBotao(i.customId);
  } else if (i.isModalSubmit()) {
    tipo = 'formulario';
    let valor: string | undefined;
    try {
      valor = i.fields.getTextInputValue('valor');
    } catch {
      // formulário sem o campo padrão
    }
    acao = descreverBotao(i.customId, valor);
  } else if (i.isMessageComponent()) {
    tipo = 'botao';
    acao = `Menu ${i.customId}`;
  } else return;
  const motivo = erro instanceof Error ? erro.message : erro ? String(erro) : undefined;
  registrar({ guild: i.guild, userId: i.user.id, tipo, acao, canalId: i.channelId, ok: !erro, detalhe: motivo?.slice(0, 200) });
}

/** Apaga logs com mais de 30 dias (na partida e uma vez por dia). */
export function iniciarRegistro(_client: Client) {
  const limpar = () => db.prepare('DELETE FROM logs WHERE criado_em < ?').run(Date.now() - DIAS_GUARDADOS * 86_400_000);
  limpar();
  setInterval(limpar, 86_400_000);
}

// ---------- /logs ----------

type Linha = { user_id: string | null; tipo: Tipo; acao: string; canal_id: string | null; ok: number; detalhe: string | null; criado_em: number };

export const logs: Comando = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('(Staff) O que o bot fez para alguém, ou as últimas ações no servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('De quem (padrão: todo mundo)'))
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantas ações (padrão: 20)').setMinValue(5).setMaxValue(50))
    .addBooleanOption((o) => o.setName('so_erros').setDescription('Mostrar só o que deu erro')),
  async executar(i) {
    const membro = i.options.getUser('membro');
    const n = i.options.getInteger('quantidade') ?? 20;
    const soErros = i.options.getBoolean('so_erros') ?? false;
    const filtros = ['guild_id = ?'];
    const args: (string | number)[] = [i.guildId!];
    if (membro) {
      filtros.push('user_id = ?');
      args.push(membro.id);
    }
    if (soErros) filtros.push('ok = 0');
    const linhas = db.prepare(`SELECT * FROM logs WHERE ${filtros.join(' AND ')} ORDER BY criado_em DESC LIMIT ?`).all(...args, n) as Linha[];
    if (!linhas.length) return i.reply({ content: 'Nenhuma ação registrada com esse filtro (os logs guardam 30 dias).', flags: MessageFlags.Ephemeral });

    const texto = linhas
      .map((l) => {
        const quem = membro ? '' : l.user_id ? `<@${l.user_id}> · ` : 'sistema · ';
        return `<t:${Math.floor(l.criado_em / 1000)}:f> ${ICONE[l.tipo]} ${quem}${l.acao}${l.canal_id ? ` · <#${l.canal_id}>` : ''}${l.ok ? '' : ` · ❌ ${l.detalhe ?? 'erro'}`}`;
      })
      .join('\n');
    const embed = new EmbedBuilder()
      .setColor(soErros ? 0xc0392b : 0x5865f2)
      .setTitle(`📋 ${membro ? `Ações de ${membro.displayName}` : 'Últimas ações no servidor'}${soErros ? ' (só erros)' : ''}`)
      .setDescription(texto.slice(0, 4000))
      .setFooter({ text: `${linhas.length} mais recentes · ⌨️ comando · 🖱️ botão · 📝 formulário · 🤖 automático · 🏠 servidor` });
    return i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
