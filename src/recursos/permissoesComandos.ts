import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import {
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type Client,
  type Guild,
} from 'discord.js';
import { ATIVIDADES, CARGOS, JOGOS, nomeCargoAtividade, nomeCargoJogo } from '../config.ts';
import { db } from '../db.ts';
import { cargoPorNome } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';
import { CAMPEOES } from './campeoes.ts';

// Cada comando aparece só para quem tem o cargo dele (ex.: /quiz só para 🧠 Quiz).
// O Discord só deixa mudar isso com a autorização de um admin (OAuth2, escopo applications.commands.permissions.update):
// /permissoes autorizar gera o link, o admin clica uma vez e o bot guarda o token (e o renova sozinho).


const API = 'https://discord.com/api/v10';
const PORTA = 53134;
export const ENDERECO_RETORNO = `http://localhost:${PORTA}/autorizar`;

const atividade = (id: string) => nomeCargoAtividade(ATIVIDADES.find((a) => a.id === id)!);

/** Comando → cargos que veem. Fora daqui, todo mundo vê. Dono, Taverneiro e Staff sempre veem tudo. */
function mapa(): Record<string, string[]> {
  const economia = atividade('economia');
  return {
    gotica: [atividade('goticas')],
    drg: [nomeCargoJogo(JOGOS.find((j) => j.id === 'drg')!)],
    loja: [atividade('goticas'), economia],
    quiz: [atividade('quiz')],
    palavra: [atividade('quiz')],
    quemdisse: [atividade('quiz')],
    cassino: [economia],
    desafiar: [economia],
    assaltar: [economia],
    ...Object.fromEntries([...CAMPEOES.map((c) => c.comando), 'vitimas'].map((c) => [c, [atividade('campeoes')]])),
    ...Object.fromEntries(['daily', 'trabalhar', 'carteira', 'pix', 'rank', 'top'].map((c) => [c, [economia]])),
    rolar: [CARGOS.aventureiro.nome, CARGOS.daggerheart.nome],
    ficha: [CARGOS.aventureiro.nome],
    teste: [CARGOS.aventureiro.nome],
    iniciativa: [CARGOS.aventureiro.nome],
    dh: [CARGOS.daggerheart.nome],
    sessao: [CARGOS.mestre.nome],
    gerar: [CARGOS.aventureiro.nome, CARGOS.daggerheart.nome, CARGOS.mestre.nome],
  };
}

// ---------- Token ----------

type Token = { access_token: string; refresh_token: string; expira_em: number };
const lerToken = () => db.prepare('SELECT * FROM oauth_comandos WHERE id = 1').get() as Token | undefined;

async function pedirToken(corpo: Record<string, string>) {
  const r = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clienteId!, client_secret: process.env.CLIENT_SECRET ?? '', ...corpo }),
  });
  const dados = (await r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !dados.access_token) throw new Error(dados.error_description ?? dados.error ?? `HTTP ${r.status}`);
  db.prepare('INSERT INTO oauth_comandos (id, access_token, refresh_token, expira_em) VALUES (1, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET access_token = excluded.access_token, refresh_token = excluded.refresh_token, expira_em = excluded.expira_em')
    .run(dados.access_token, dados.refresh_token!, Date.now() + (dados.expires_in ?? 604_800) * 1000);
  return dados.access_token;
}

/** Token válido (renova sozinho quando falta menos de 1 dia para vencer). */
async function tokenValido(): Promise<string | undefined> {
  const t = lerToken();
  if (!t) return undefined;
  if (t.expira_em - Date.now() > 86_400_000) return t.access_token;
  return pedirToken({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
}

// ---------- Aplicar ----------

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Faz a requisição respeitando o limite do Discord: no 429, espera o tempo pedido e tenta de novo (até 6 vezes). */
async function comLimite(fazer: () => Promise<Response>): Promise<Response> {
  for (let tentativa = 1; ; tentativa++) {
    const r = await fazer();
    if (r.status !== 429 || tentativa >= 6) return r;
    const corpo = (await r.json().catch(() => ({}))) as { retry_after?: number };
    const segundos = corpo.retry_after ?? Number(r.headers.get('retry-after') ?? 2);
    await esperar(Math.ceil(segundos * 1000) + 250);
  }
}

let clienteId: string | undefined;

/** Aplica o mapa nos comandos do servidor. Devolve um resumo (ou o motivo de não ter aplicado). */
export async function aplicarPermissoesComandos(guild: Guild): Promise<string> {
  let token: string | undefined;
  try {
    token = await tokenValido();
  } catch (e) {
    return `⚠️ A autorização das permissões venceu (${(e as Error).message}). Rode \`/permissoes autorizar\` de novo.`;
  }
  if (!token) return 'ℹ️ Comandos por cargo ainda não autorizados: rode `/permissoes autorizar` uma vez.';

  const comandos = await guild.commands.fetch();
  // Permissões que já estão no Discord: só regrava o que mudou (cada gravação é lenta, o limite do Discord é apertado).
  const atuais = await guild.commands.permissions.fetch({}).catch(() => undefined);
  const assinatura = (lista: readonly { id: string; type: number; permission: boolean }[]) =>
    lista.map((p) => `${p.id}:${p.type}:${p.permission}`).sort().join(',');
  const sempre = [CARGOS.dono.nome, CARGOS.admin.nome, CARGOS.staff.nome];
  let ok = 0;
  let iguais = 0;
  const falhas: string[] = [];
  for (const [nome, cargos] of Object.entries(mapa())) {
    const cmd = comandos.find((c) => c.name === nome);
    if (!cmd) continue;
    const ids = [...new Set([...cargos, ...sempre].map((n) => cargoPorNome(guild, n)?.id).filter((x): x is string => !!x))];
    // type 1 = cargo; o id do servidor = @everyone (negado, para só os cargos acima verem).
    const permissions = [...ids.map((id) => ({ id, type: 1, permission: true })), { id: guild.id, type: 1, permission: false }];
    if (atuais?.get(cmd.id) && assinatura(atuais.get(cmd.id)!) === assinatura(permissions)) {
      iguais++;
      continue;
    }
    const r = await comLimite(() =>
      fetch(`${API}/applications/${guild.client.application.id}/guilds/${guild.id}/commands/${cmd.id}/permissions`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      }),
    );
    if (r.ok) ok++;
    else falhas.push(`/${nome} (${r.status})`);
    await esperar(300);
  }
  if (falhas.length) return `⚠️ Permissões por cargo: ${ok} comando(s) ok, falharam ${falhas.join(', ')}.`;
  return ok
    ? `🔒 ${ok + iguais} comando(s) aparecem só para quem tem o cargo deles (${ok} atualizado(s)).`
    : `🔒 Permissões por cargo já estavam em dia (${iguais} comandos).`;
}

// ---------- Autorização (servidorzinho local que recebe o retorno do Discord) ----------

let servidor: Server | undefined;
let estadoEsperado: string | undefined;

function esperarRetorno(client: Client, aoTerminar: (texto: string) => void) {
  servidor?.close();
  servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', ENDERECO_RETORNO);
    if (url.pathname !== '/autorizar') {
      res.writeHead(404).end();
      return;
    }
    const pagina = (titulo: string, texto: string) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>${titulo}</title><body style="font-family:system-ui;background:#1d1029;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>${titulo}</h1><p>${texto}</p></div>`);
    };
    if (url.searchParams.get('state') !== estadoEsperado || !url.searchParams.get('code')) {
      pagina('Link inválido', 'Rode <code>/permissoes autorizar</code> de novo no Discord.');
      return;
    }
    try {
      await pedirToken({ grant_type: 'authorization_code', code: url.searchParams.get('code')!, redirect_uri: ENDERECO_RETORNO });
      const resumos = await Promise.all([...client.guilds.cache.values()].map((g) => aplicarPermissoesComandos(g)));
      pagina('Pronto! 🍺', 'Pode fechar esta aba e voltar ao Discord.');
      aoTerminar(`✅ Autorizado! ${resumos.join(' ')}`);
    } catch (e) {
      pagina('Não deu certo', (e as Error).message);
      aoTerminar(`❌ Não consegui autorizar: ${(e as Error).message}`);
    } finally {
      estadoEsperado = undefined;
      servidor?.close();
      servidor = undefined;
    }
  });
  servidor.listen(PORTA, '127.0.0.1');
  // O link vale 10 minutos.
  setTimeout(() => {
    servidor?.close();
    servidor = undefined;
  }, 10 * 60_000).unref();
}

export const permissoes: Comando = {
  data: new SlashCommandBuilder()
    .setName('permissoes')
    .setDescription('(Admin) Faz cada comando aparecer só para quem tem o cargo dele')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('autorizar').setDescription('Gera o link de autorização (uma vez só)'))
    .addSubcommand((s) => s.setName('aplicar').setDescription('Reaplica as permissões agora'))
    .addSubcommand((s) => s.setName('status').setDescription('Mostra quais comandos dependem de qual cargo')),

  async executar(i) {
    clienteId = i.client.application.id;
    const sub = i.options.getSubcommand();

    if (sub === 'status') {
      const t = lerToken();
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🔒 Comandos por cargo')
        .setDescription(
          `Autorização: ${t ? `✅ ativa (renova sozinha; vence <t:${Math.floor(t.expira_em / 1000)}:R>)` : '❌ ainda não autorizado: `/permissoes autorizar`'}\n\n` +
            Object.entries(mapa()).map(([c, cargos]) => `\`/${c}\` → ${cargos.join(', ')}`).join('\n') +
            '\n\nDono, Taverneiro e Staff veem todos. Os outros comandos aparecem para todo mundo.',
        );
      return i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'aplicar') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      return i.editReply(await aplicarPermissoesComandos(i.guild!));
    }

    // autorizar
    if (!process.env.CLIENT_SECRET) {
      return i.reply({ content: 'Falta o `CLIENT_SECRET` no arquivo `.env` (Developer Portal → OAuth2 → Client Secret).', flags: MessageFlags.Ephemeral });
    }
    estadoEsperado = randomBytes(16).toString('hex');
    const link = `https://discord.com/oauth2/authorize?${new URLSearchParams({
      client_id: clienteId,
      response_type: 'code',
      redirect_uri: ENDERECO_RETORNO,
      scope: 'applications.commands.permissions.update',
      state: estadoEsperado,
      prompt: 'consent',
    })}`;
    esperarRetorno(i.client, (texto) => void i.followUp({ content: texto, flags: MessageFlags.Ephemeral }).catch(() => {}));
    return i.reply({
      content:
        '🔐 **Antes de clicar**, confira no Developer Portal → **OAuth2** → **Redirects** se existe este endereço (adicione e salve se não):\n' +
        `\`${ENDERECO_RETORNO}\`\n\n` +
        `Depois abra **[este link](${link})** neste computador (onde o bot está rodando) e clique em **Autorizar**. Ele vale 10 minutos.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

/** Guarda o id do aplicativo (para renovar o token fora de um comando). */
export const iniciarPermissoes = (client: Client) => {
  clienteId = client.application?.id;
  // Já autorizado: reaplica ao ligar (os comandos são registrados de novo a cada partida).
  if (!lerToken()) return;
  for (const guild of client.guilds.cache.values()) {
    aplicarPermissoesComandos(guild).then((r) => console.log(`[permissões] ${guild.name}: ${r}`)).catch((e) => console.error('[permissões]', e));
  }
};
