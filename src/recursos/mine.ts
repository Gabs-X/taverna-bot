import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import { nomeTextoGrupo } from '../lib/grupos.ts';
import {
  comNick,
  deveDesligar,
  donoDoNick,
  GRUPO_MINE,
  lerChunky,
  lerLista,
  lerPacotesRcon,
  lerTps,
  nomeDoZip,
  pacoteRcon,
  problemaNoNick,
  RCON_COMANDO,
  RCON_LOGIN,
  semCores,
  semNick,
  vazioDesdeAgora,
  versaoDosExtras,
  type EntradaWhitelist,
} from '../lib/mine.ts';
import { canalTexto, ehStaff } from '../lib/servidor.ts';
import type { Comando, HandlerBotao } from '../tipos.ts';
import { destino, opcoesSsh, rodar } from './vigiaNuvem.ts';

// Mundo de Minecraft da galera (FTB Evolution 2), controlado pelo Discord. Roda no PC de casa junto com os bardos
// (src/bardos.ts), porque o servidor do Minecraft também roda aqui: fala com ele pelo RCON local (127.0.0.1, nada
// aberto para a internet), liga pelo run.bat e desliga pelo "stop". Quem joga é quem está no subgrupo do Minecraft.
// - /mine status · ligar · desligar · entrar (cadastra o nick na whitelist) · sair · lista · modpack; staff: remover, painel.
// - Painel fixo no canal do subgrupo, atualizado a cada minuto, com botões de ligar/desligar/modpack.
// - Desliga sozinho depois de 15 min sem ninguém (menos durante a pré-geração do mapa pelo Chunky).
// - Quem sai do subgrupo sai da whitelist (conferido a cada 10 min).
// - Mods extras (pasta mods-extras do servidor): o zip vai para a Oracle e o link sai pelo endereço do mapa.
// Configuração no .env de casa: MINE_PASTA (pasta do servidor), MINE_ENDERECO (endereço do playit) e, opcional,
// MINE_GRUPO (nome do subgrupo, padrão "Minecraft"). A senha do RCON é lida do server.properties.

const PASTA = process.env.MINE_PASTA?.trim();
const ENDERECO = process.env.MINE_ENDERECO?.trim() || '(endereço não configurado)';
const ARQUIVO_DADOS = 'dados/mine.json';
const PASTA_ZIP = 'dados/mine';
const REMOTO = 'taverna-bot/dados/mine';
const LIGANDO_NO_MAXIMO = 10 * 60_000;

type Dados = { guildId?: string; canalId?: string; painelId?: string; cadastros: Record<string, string> };
type Situacao =
  | { ligado: false }
  | { ligado: true; online: number; max: number; nomes: string[]; tps?: number; pregerando?: number };

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Dados locais (dados/mine.json: cadastros e onde está o painel) ----------

function lerDados(): Dados {
  try {
    return { cadastros: {}, ...JSON.parse(readFileSync(ARQUIVO_DADOS, 'utf8')) };
  } catch {
    return { cadastros: {} };
  }
}
function gravarDados(d: Dados) {
  mkdirSync('dados', { recursive: true });
  writeFileSync(ARQUIVO_DADOS, JSON.stringify(d, null, 2));
}

// ---------- Servidor: propriedades, RCON, ligar e desligar ----------

function propriedades(): Record<string, string> {
  const texto = readFileSync(join(PASTA!, 'server.properties'), 'utf8');
  return Object.fromEntries(
    texto
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

/** Manda os comandos pelo RCON local, um depois do outro, e devolve as respostas (sem cores). */
function rcon(...comandos: string[]): Promise<string[]> {
  const p = propriedades();
  if (p['enable-rcon'] !== 'true') return Promise.reject(new Error('RCON desligado no server.properties'));
  return new Promise((ok, falha) => {
    const s = connect(Number(p['rcon.port']) || 25575, '127.0.0.1');
    const respostas: string[] = [];
    let buf: Buffer = Buffer.alloc(0);
    let logado = false;
    const fim = (erro?: Error) => {
      clearTimeout(tempo);
      s.destroy();
      erro ? falha(erro) : ok(respostas);
    };
    const tempo = setTimeout(() => fim(new Error('o RCON não respondeu')), 10_000);
    const proximo = () => (respostas.length >= comandos.length ? fim() : s.write(pacoteRcon(10 + respostas.length, RCON_COMANDO, comandos[respostas.length])));
    s.on('connect', () => s.write(pacoteRcon(1, RCON_LOGIN, p['rcon.password'] ?? '')));
    s.on('data', (d: Buffer) => {
      const lido = lerPacotesRcon(Buffer.concat([buf, d]));
      buf = lido.resto;
      for (const pk of lido.pacotes) {
        if (!logado) {
          if (pk.id === -1) return fim(new Error('senha do RCON recusada'));
          logado = true;
          proximo();
        } else {
          respostas.push(semCores(pk.corpo));
          proximo();
        }
      }
    });
    s.on('error', (e) => fim(e));
    s.on('close', () => fim(respostas.length >= comandos.length ? undefined : new Error('o servidor fechou a conexão')));
  });
}

let ligandoDesde: number | null = null;
let desligandoDesde: number | null = null;
let vazioDesde: number | null = null;

export async function situacao(): Promise<Situacao> {
  try {
    const [lista, tps, chunky] = await rcon('list', 'neoforge tps', 'chunky progress');
    const l = lerLista(lista) ?? { online: 0, max: 0, nomes: [] };
    const c = lerChunky(chunky);
    return { ligado: true, ...l, tps: lerTps(tps), pregerando: c.rodando ? (c.porcento ?? 0) : undefined };
  } catch {
    return { ligado: false };
  }
}

const ligando = () => ligandoDesde !== null && Date.now() - ligandoDesde < LIGANDO_NO_MAXIMO;

/** Sobe o servidor pelo run.bat do pack, solto do bot: reiniciar os bardos não derruba o mundo. */
function ligar() {
  mkdirSync(join(PASTA!, 'logs'), { recursive: true });
  const log = openSync(join(PASTA!, 'logs', 'console-bot.log'), 'w');
  const p = spawn('cmd.exe', ['/c', 'run.bat'], { cwd: PASTA, detached: true, stdio: ['ignore', log, log], windowsHide: true });
  p.unref();
  ligandoDesde = Date.now();
  desligandoDesde = null;
  vazioDesde = null;
}

async function desligar() {
  desligandoDesde = Date.now();
  ligandoDesde = null;
  await rcon('stop').catch(() => {}); // o servidor costuma fechar a conexão antes de responder
}

// ---------- Whitelist ----------

const arquivoWhitelist = () => join(PASTA!, 'whitelist.json');
function lerWhitelist(): EntradaWhitelist[] {
  try {
    return JSON.parse(readFileSync(arquivoWhitelist(), 'utf8'));
  } catch {
    return [];
  }
}
async function gravarWhitelist(lista: EntradaWhitelist[]) {
  writeFileSync(arquivoWhitelist(), JSON.stringify(lista, null, 2));
  await rcon('whitelist reload').catch(() => {}); // desligado: vale na próxima vez que ligar
}

async function tirarNick(nick: string) {
  await gravarWhitelist(semNick(lerWhitelist(), nick));
  await rcon(`kick ${nick} Você saiu do grupo do Minecraft.`).catch(() => {});
}

// ---------- Quem pode ----------

const ehDoGrupo = (m: GuildMember) => m.roles.cache.some((r) => r.name === GRUPO_MINE || r.name.endsWith(` ${GRUPO_MINE}`));
const podeJogar = (m: GuildMember) => ehDoGrupo(m) || ehStaff(m.guild, m.id);
const nomeDoCanal = () => nomeTextoGrupo(GRUPO_MINE);

// ---------- Mods extras e o link na Oracle ----------

function extras() {
  const dir = join(PASTA!, 'mods-extras');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith('.jar'))
    .map((nome) => ({ nome, tamanho: statSync(join(dir, nome)).size }));
}

function versaoDoPack(): string {
  try {
    const m = JSON.parse(readFileSync(join(PASTA!, '.manifest.json'), 'utf8')) as { name?: string; versionName?: string };
    return `${m.name ?? 'FTB Evolution 2'} ${m.versionName ?? ''}`.trim();
  } catch {
    return 'FTB Evolution 2';
  }
}

const demorado = (programa: string, args: string[]) =>
  new Promise<string>((ok, falha) =>
    execFile(programa, args, { timeout: 15 * 60_000, windowsHide: true }, (e, saida) => (e ? falha(e) : ok(String(saida)))),
  );
const TAR = existsSync('C:\\Windows\\System32\\tar.exe') ? 'C:\\Windows\\System32\\tar.exe' : 'tar';
let zipNaNuvem: string | null = null;

/** Monta o zip dos mods extras (se mudou), manda para a Oracle e devolve o link pelo endereço do mapa. */
async function linkDosExtras(): Promise<string | undefined> {
  const jars = extras();
  if (!jars.length) return undefined;
  if (!destino) throw new Error('sem NUVEM_SSH no .env');
  const zip = nomeDoZip(versaoDosExtras(jars));
  const local = join(PASTA_ZIP, zip);
  if (!existsSync(local)) {
    mkdirSync(PASTA_ZIP, { recursive: true });
    await demorado(TAR, ['-a', '-c', '-f', local, '-C', join(PASTA!, 'mods-extras'), ...jars.map((j) => j.nome)]);
  }
  if (zipNaNuvem !== zip) {
    const tem = await rodar('ssh', [...opcoesSsh, destino, `mkdir -p ${REMOTO} && (test -f ${REMOTO}/${zip} && echo tem || echo falta)`]);
    if (tem.trim() !== 'tem') {
      await demorado('scp', [...opcoesSsh, local, `${destino}:${REMOTO}/${zip}.parcial`]);
      await rodar('ssh', [...opcoesSsh, destino, `mv ${REMOTO}/${zip}.parcial ${REMOTO}/${zip} && find ${REMOTO} -name 'mods-extras-*.zip' ! -name '${zip}' -delete`]);
    }
    zipNaNuvem = zip;
  }
  const url = (await rodar('ssh', [...opcoesSsh, destino, "grep -oP '^MAPA_URL=\\K.*' taverna-bot/.env"])).trim().replace(/\/+$/, '');
  if (!url.startsWith('https://')) throw new Error('o Taverneiro ainda não tem endereço público (MAPA_URL)');
  return `${url}/mine/${zip}`;
}

// ---------- Painel e mensagens ----------

function linhaDoEstado(s: Situacao) {
  if (s.ligado) return desligandoDesde ? '🟠 **Desligando…**' : '🟢 **Ligado**';
  return ligando() ? '🟡 **Ligando…** (uns 2 minutos)' : '🔴 **Desligado**';
}

function embedDoMundo(s: Situacao) {
  const jars = extras();
  const linhas = [
    linhaDoEstado(s),
    `🌐 Endereço: \`${ENDERECO}\``,
    `📦 Modpack: **${versaoDoPack()}**${jars.length ? ` + mods extras \`${versaoDosExtras(jars)}\`` : ''}`,
  ];
  if (s.ligado) {
    linhas.push(`👥 Jogando: **${s.online}/${s.max}**${s.nomes.length ? ` · ${s.nomes.join(', ')}` : ''}`);
    if (s.tps !== undefined) linhas.push(`⏱️ TPS: **${s.tps.toFixed(1)}**/20${s.tps < 15 ? ' (com lag)' : ''}`);
    if (s.pregerando !== undefined) linhas.push(`🗺️ Pré-gerando o mapa: **${s.pregerando.toFixed(1)}%**`);
    else if (s.online === 0 && vazioDesde) linhas.push(`💤 Vazio: desliga sozinho <t:${Math.round((vazioDesde + 15 * 60_000) / 1000)}:R>`);
  }
  return new EmbedBuilder()
    .setColor(s.ligado ? 0x3ba55d : ligando() ? 0xfaa61a : 0x747f8d)
    .setTitle('⛏️ Mundo do Minecraft')
    .setDescription(linhas.join('\n'))
    .setFooter({ text: 'Atualiza a cada minuto · /mine entrar para cadastrar seu nick' })
    .setTimestamp(new Date());
}

const botoes = () =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('mine:ligar').setLabel('Ligar').setEmoji('🟢').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('mine:desligar').setLabel('Desligar').setEmoji('🔴').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mine:modpack').setLabel('Modpack').setEmoji('📦').setStyle(ButtonStyle.Primary),
  );

function textoDoModpack(link: string | undefined, erro?: string) {
  const extrasLinha = link
    ? `4. Baixe os **mods extras** e jogue os arquivos de dentro do zip na pasta \`mods\` da instância: ${link}`
    : erro
      ? `4. ⚠️ Não consegui gerar o link dos mods extras agora (${erro}). Avisa o admin.`
      : '4. Por enquanto não tem mods extras.';
  return [
    `📦 **${versaoDoPack()}**`,
    '1. Instale o **Prism Launcher** (prismlauncher.org) e adicione uma conta **offline** com o seu nick.',
    `2. **Adicionar instância → FTB → FTB Evolution 2**, na versão **${versaoDoPack().split(' ').at(-1)}** (tem que ser a mesma do servidor).`,
    '3. Dê pelo menos **8 GB** de RAM para a instância (Editar → Configurações → Java).',
    extrasLinha,
    `5. Cadastre o nick com \`/mine entrar\` e entre em \`${ENDERECO}\`.`,
  ].join('\n');
}

// ---------- Ações (comando e botões usam as mesmas) ----------

type Resposta = { content?: string; embeds?: EmbedBuilder[] };

async function acaoLigar(m: GuildMember): Promise<Resposta> {
  if (!podeJogar(m)) return { content: `Só quem está no grupo **${GRUPO_MINE}** liga o mundo.` };
  const s = await situacao();
  if (s.ligado) return { content: '🟢 O mundo já está ligado!' };
  if (ligando()) return { content: '🟡 Já está ligando, espera uns minutinhos.' };
  ligar();
  await avisarNoCanal(m.guild, `🟡 ${m} mandou ligar o mundo. Em uns 2 minutos dá para entrar.`);
  return { content: '🟡 Ligando! Te aviso no canal quando der para entrar.' };
}

async function acaoDesligar(m: GuildMember): Promise<Resposta> {
  if (!podeJogar(m)) return { content: `Só quem está no grupo **${GRUPO_MINE}** desliga o mundo.` };
  const s = await situacao();
  if (!s.ligado) return { content: '🔴 O mundo já está desligado.' };
  if (s.pregerando !== undefined && !ehStaff(m.guild, m.id)) return { content: '🗺️ O mapa está sendo pré-gerado; só a staff desliga agora.' };
  if (s.online > 0 && !ehStaff(m.guild, m.id)) return { content: `👥 Tem gente jogando (${s.nomes.join(', ')}). Ele desliga sozinho 15 min depois que todo mundo sair.` };
  await desligar();
  await avisarNoCanal(m.guild, `🔴 ${m} desligou o mundo.`);
  return { content: '🔴 Desligando (o mundo é salvo antes).' };
}

async function acaoModpack(): Promise<Resposta> {
  try {
    return { content: textoDoModpack(await linkDosExtras()) };
  } catch (e) {
    console.error('[mine] link dos mods extras:', e);
    return { content: textoDoModpack(undefined, (e as Error).message) };
  }
}

// ---------- Comando ----------

export const mine: Comando = {
  data: new SlashCommandBuilder()
    .setName('mine')
    .setDescription('Mundo de Minecraft da galera (FTB Evolution 2)')
    .addSubcommand((s) => s.setName('status').setDescription('Se o mundo está ligado, quem está jogando e o lag'))
    .addSubcommand((s) => s.setName('ligar').setDescription('Liga o mundo'))
    .addSubcommand((s) => s.setName('desligar').setDescription('Desliga o mundo (só se não tiver ninguém jogando)'))
    .addSubcommand((s) =>
      s
        .setName('entrar')
        .setDescription('Cadastra seu nick na whitelist')
        .addStringOption((o) => o.setName('nick').setDescription('Seu nick no Minecraft (o mesmo do launcher)').setRequired(true).setMaxLength(16)),
    )
    .addSubcommand((s) => s.setName('sair').setDescription('Tira seu nick da whitelist'))
    .addSubcommand((s) => s.setName('lista').setDescription('Quem está cadastrado'))
    .addSubcommand((s) => s.setName('modpack').setDescription('Como instalar o modpack e os mods extras'))
    .addSubcommand((s) =>
      s
        .setName('remover')
        .setDescription('(Staff) Tira alguém da whitelist')
        .addUserOption((o) => o.setName('membro').setDescription('Quem sai').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('painel').setDescription('(Staff) Põe o painel do mundo neste canal')),

  async executar(i: ChatInputCommandInteraction) {
    if (!PASTA) return i.reply({ content: 'O mundo do Minecraft não está configurado neste PC (falta `MINE_PASTA`).', flags: MessageFlags.Ephemeral });
    if (!i.inCachedGuild()) return i.reply({ content: 'Use dentro do servidor.', flags: MessageFlags.Ephemeral });
    const m = i.member;
    const sub = i.options.getSubcommand();
    const dados = lerDados();
    if (dados.guildId !== i.guildId) gravarDados({ ...dados, guildId: i.guildId });

    switch (sub) {
      case 'status': {
        await i.deferReply();
        return i.editReply({ embeds: [embedDoMundo(await situacao())] });
      }
      case 'ligar':
      case 'desligar': {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        return i.editReply(sub === 'ligar' ? await acaoLigar(m) : await acaoDesligar(m));
      }
      case 'modpack': {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        return i.editReply(await acaoModpack());
      }
      case 'entrar': {
        if (!podeJogar(m)) return i.reply({ content: `Primeiro entre no grupo **${GRUPO_MINE}** (\`/grupo\`).`, flags: MessageFlags.Ephemeral });
        const nick = i.options.getString('nick', true).trim();
        const problema = problemaNoNick(nick);
        if (problema) return i.reply({ content: problema, flags: MessageFlags.Ephemeral });
        const dono = donoDoNick(dados.cadastros, nick);
        if (dono && dono !== m.id) return i.reply({ content: `O nick **${nick}** já é de <@${dono}>.`, flags: MessageFlags.Ephemeral });
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const antigo = dados.cadastros[m.id];
        let lista = lerWhitelist();
        if (antigo && antigo.toLowerCase() !== nick.toLowerCase()) lista = semNick(lista, antigo);
        await gravarWhitelist(comNick(lista, nick));
        gravarDados({ ...lerDados(), guildId: i.guildId, cadastros: { ...lerDados().cadastros, [m.id]: nick } });
        return i.editReply(
          `✅ **${nick}** está na whitelist${antigo && antigo !== nick ? ` (no lugar de ${antigo})` : ''}. Entre em \`${ENDERECO}\` — veja \`/mine modpack\` se ainda não instalou.`,
        );
      }
      case 'sair': {
        const nick = dados.cadastros[m.id];
        if (!nick) return i.reply({ content: 'Você não tem nick cadastrado.', flags: MessageFlags.Ephemeral });
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        await tirarNick(nick);
        const { [m.id]: _, ...resto } = lerDados().cadastros;
        gravarDados({ ...lerDados(), cadastros: resto });
        return i.editReply(`👋 **${nick}** saiu da whitelist.`);
      }
      case 'lista': {
        const linhas = Object.entries(dados.cadastros).map(([id, nick]) => `• **${nick}** — <@${id}>`);
        return i.reply({ content: linhas.length ? `📋 Cadastrados (${linhas.length}):\n${linhas.join('\n')}` : 'Ninguém cadastrado ainda.', allowedMentions: { parse: [] } });
      }
      case 'remover': {
        if (!ehStaff(i.guild, m.id)) return i.reply({ content: 'Só a staff remove outras pessoas.', flags: MessageFlags.Ephemeral });
        const alvo = i.options.getUser('membro', true);
        const nick = dados.cadastros[alvo.id];
        if (!nick) return i.reply({ content: `${alvo} não tem nick cadastrado.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        await tirarNick(nick);
        const { [alvo.id]: _, ...resto } = lerDados().cadastros;
        gravarDados({ ...lerDados(), cadastros: resto });
        return i.editReply(`🚫 **${nick}** (${alvo}) saiu da whitelist.`);
      }
      case 'painel': {
        if (!ehStaff(i.guild, m.id)) return i.reply({ content: 'Só a staff põe o painel.', flags: MessageFlags.Ephemeral });
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const canal = i.channel as TextChannel;
        const msg = await canal.send({ embeds: [embedDoMundo(await situacao())], components: [botoes()] });
        gravarDados({ ...lerDados(), guildId: i.guildId, canalId: canal.id, painelId: msg.id });
        return i.editReply('📌 Painel posto aqui. Ele se atualiza sozinho a cada minuto.');
      }
    }
  },
};

export const botaoMine: HandlerBotao = {
  prefixo: 'mine',
  async executar(i: ButtonInteraction, acao: string) {
    if (!PASTA || !i.inCachedGuild()) return;
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const r = acao === 'ligar' ? await acaoLigar(i.member) : acao === 'desligar' ? await acaoDesligar(i.member) : await acaoModpack();
    await i.editReply(r);
    if (acao !== 'modpack') void atualizarPainel(i.client);
  },
};

// ---------- Rotinas: painel, desligar sozinho, quem saiu do grupo ----------

function canalDoMine(client: Client): TextChannel | undefined {
  const d = lerDados();
  const porId = d.canalId ? client.channels.cache.get(d.canalId) : undefined;
  if (porId?.isTextBased()) return porId as TextChannel;
  for (const guild of client.guilds.cache.values()) {
    const c = canalTexto(guild, nomeDoCanal());
    if (c) return c;
  }
  return undefined;
}

async function avisarNoCanal(guild: Guild | undefined, texto: string) {
  const c = guild ? canalTexto(guild, nomeDoCanal()) : undefined;
  await c?.send({ content: texto, allowedMentions: { parse: [] } }).catch(() => {});
}

let ultimaSituacao: Situacao | undefined;

async function atualizarPainel(client: Client, s?: Situacao) {
  const canal = canalDoMine(client);
  if (!canal) return;
  const d = lerDados();
  const conteudo = { embeds: [embedDoMundo(s ?? (await situacao()))], components: [botoes()] };
  const msg = d.painelId ? await canal.messages.fetch(d.painelId).catch(() => null) : null;
  if (msg) return void (await msg.edit(conteudo).catch(() => {}));
  // Sem painel ainda (ou apagado): o canal do subgrupo ganha um sozinho.
  const novo = await canal.send(conteudo).catch(() => null);
  if (novo) gravarDados({ ...d, guildId: canal.guildId, canalId: canal.id, painelId: novo.id });
}

async function aCadaMinuto(client: Client) {
  const s = await situacao();
  const canal = canalDoMine(client);
  if (s.ligado) {
    if (ligandoDesde || (ultimaSituacao && !ultimaSituacao.ligado)) await canal?.send(`🟢 O mundo está **ligado**! Entre em \`${ENDERECO}\`.`).catch(() => {});
    ligandoDesde = null;
    vazioDesde = vazioDesdeAgora({ vazioDesde, online: s.online, pregerando: s.pregerando !== undefined, agora: Date.now() });
    if (!desligandoDesde && deveDesligar({ vazioDesde, agora: Date.now(), pregerando: s.pregerando !== undefined })) {
      await desligar();
      await canal?.send('💤 O mundo ficou 15 minutos vazio e **desligou sozinho**. Para voltar: `/mine ligar` ou o botão do painel.').catch(() => {});
    }
  } else {
    if (ultimaSituacao?.ligado && !desligandoDesde) await canal?.send('⚠️ O mundo **caiu** (desligou sem ninguém mandar). Tente `/mine ligar`; se cair de novo, avise o admin.').catch(() => {});
    desligandoDesde = null;
    vazioDesde = null;
    if (ligandoDesde && !ligando()) {
      ligandoDesde = null;
      await canal?.send('⚠️ O mundo não conseguiu ligar. Avise o admin (log em `logs/console-bot.log`).').catch(() => {});
    }
  }
  ultimaSituacao = s;
  await atualizarPainel(client, s);
}

/** Quem saiu do subgrupo (ou do servidor) perde o lugar na whitelist. */
async function conferirMembros(client: Client) {
  const d = lerDados();
  const guild = d.guildId ? client.guilds.cache.get(d.guildId) : undefined;
  if (!guild) return;
  for (const [id, nick] of Object.entries(d.cadastros)) {
    const m = await guild.members.fetch(id).catch(() => null);
    if (m && podeJogar(m)) continue;
    if (m === null) {
      // Pode ser só falha de rede: confere se a pessoa saiu mesmo antes de tirar.
      const saiu = await guild.members.fetch({ user: id, force: true }).then(() => false, (e: { code?: number }) => e?.code === 10007);
      if (!saiu) continue;
    }
    await tirarNick(nick);
    const { [id]: _, ...resto } = lerDados().cadastros;
    gravarDados({ ...lerDados(), cadastros: resto });
    await avisarNoCanal(guild, `👋 **${nick}** saiu da whitelist (não está mais no grupo ${GRUPO_MINE}).`);
  }
}

export function iniciarMine(client: Client) {
  if (!PASTA) return;
  if (!existsSync(join(PASTA, 'server.properties'))) return console.error(`[mine] MINE_PASTA não tem server.properties: ${PASTA}`);
  const rodarSeguro = (nome: string, f: () => Promise<unknown>) => () => f().catch((e) => console.error(`[mine] ${nome}:`, e));
  void espera(5_000).then(rodarSeguro('primeira volta', () => aCadaMinuto(client)));
  setInterval(rodarSeguro('minuto', () => aCadaMinuto(client)), 60_000).unref();
  setInterval(rodarSeguro('membros', () => conferirMembros(client)), 10 * 60_000).unref();
  console.log(`⛏️ Mundo do Minecraft ligado ao bot (${PASTA}).`);
}
