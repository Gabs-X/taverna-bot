// Mantém o bot rodando em segundo plano no Windows (ou em qualquer sistema):
// - reinicia sozinho quando um arquivo de src/, assets/, .env ou package.json muda;
// - religa se o bot cair (esperando mais a cada queda seguida, até 1 minuto);
// - grava a saída do bot em dados/bot.log (gira em 5 MB, guarda o anterior em bot.log.1);
// - não deixa abrir duas cópias (trava em dados/supervisor.pid);
// - não (re)liga o bot enquanto a atualização da nuvem instala as dependências (dados/atualizando).
// Uso: node scripts/supervisor.mjs [--entrada arquivo]   (padrão: src/index.ts)
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, watch, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
const DADOS = join(RAIZ, 'dados');
const LOG = join(DADOS, 'bot.log');
const TRAVA = join(DADOS, 'supervisor.pid');
const MAX_LOG = 5 * 1024 * 1024;
const ESPERA_ALTERACAO = 1500;
const ESTADO = join(DADOS, 'estado.json');
const ESPERA_MAXIMA_OCUPADO = 30 * 60_000; // depois disso reinicia mesmo ocupado
const ATUALIZANDO = join(DADOS, 'atualizando'); // criado pelo scripts/nuvem/atualizar.sh do merge até o fim do npm ci
const ATUALIZACAO_TRAVADA = 15 * 60_000; // marca mais velha que isso é resto de atualização que morreu: ignora
const ESPERA_ATUALIZACAO = 5000;

const arg = process.argv.indexOf('--entrada');
const ENTRADA = arg > 0 ? process.argv[arg + 1] : 'src/index.ts';

mkdirSync(DADOS, { recursive: true });

function log(texto) {
  const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const linhas = String(texto).replace(/\s+$/, '').split(/\r?\n/).map((l) => `[${hora}] ${l}`).join('\n');
  try {
    if (existsSync(LOG) && statSync(LOG).size > MAX_LOG) renameSync(LOG, `${LOG}.1`);
    appendFileSync(LOG, `${linhas}\n`);
  } catch {
    // log nunca derruba o supervisor
  }
}

// ---------- Uma cópia só ----------

const vivo = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
if (existsSync(TRAVA)) {
  const pid = Number(readFileSync(TRAVA, 'utf8'));
  if (pid && pid !== process.pid && vivo(pid)) {
    log(`⚠️ Já existe um supervisor rodando (PID ${pid}). Saindo.`);
    process.exit(0);
  }
}
writeFileSync(TRAVA, String(process.pid));

// ---------- Bot ----------

let bot = null;
let reiniciandoDeProposito = false;
let quedasSeguidas = 0;
let iniciadoEm = 0;
let timerReinicio = null;
let esperandoAtualizacao = false;

/** A nuvem está trocando o código e as dependências: ligar agora daria "Cannot find package". */
function atualizando() {
  try {
    return Date.now() - statSync(ATUALIZANDO).mtimeMs < ATUALIZACAO_TRAVADA;
  } catch {
    return false;
  }
}

function iniciar() {
  clearTimeout(timerReinicio);
  if (atualizando()) {
    if (!esperandoAtualizacao) log('⏳ Atualização instalando as dependências: ligo o bot quando terminar.');
    esperandoAtualizacao = true;
    timerReinicio = setTimeout(iniciar, ESPERA_ATUALIZACAO);
    return;
  }
  esperandoAtualizacao = false;
  if (!existsSync(join(RAIZ, '.env'))) {
    log('❌ Falta o arquivo .env com o DISCORD_TOKEN. Esperando ele ser criado...');
    return;
  }
  iniciadoEm = Date.now();
  bot = spawn(process.execPath, ['--env-file=.env', '--disable-warning=ExperimentalWarning', ENTRADA], {
    cwd: RAIZ,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    // Avisa o bot que ele está sob o supervisor (o /reiniciar só funciona assim).
    env: { ...process.env, TAVERNA_SUPERVISOR: '1' },
  });
  log(`▶️ Bot iniciado (PID ${bot.pid}).`);
  bot.stdout.on('data', (d) => log(d));
  bot.stderr.on('data', (d) => log(d));
  bot.on('exit', (codigo, sinal) => {
    bot = null;
    if (reiniciandoDeProposito) {
      reiniciandoDeProposito = false;
      iniciar();
      return;
    }
    // 99 = /reiniciar no Discord: volta na hora, sem contar como queda.
    if (codigo === 99) {
      log('🔄 Reinício pedido pelo Discord.');
      quedasSeguidas = 0;
      iniciar();
      return;
    }
    // Rodou mais de 1 minuto antes de cair: não conta como queda em sequência.
    quedasSeguidas = Date.now() - iniciadoEm > 60_000 ? 1 : quedasSeguidas + 1;
    const espera = Math.min(60, 2 ** quedasSeguidas) * 1000;
    log(`💥 O bot parou (código ${codigo ?? sinal}). Religando em ${espera / 1000} s...`);
    timerReinicio = setTimeout(iniciar, espera);
  });
}

function reiniciar(motivo) {
  log(`🔄 ${motivo}: reiniciando o bot.`);
  quedasSeguidas = 0;
  if (bot) {
    reiniciandoDeProposito = true;
    bot.kill();
  } else {
    iniciar();
  }
}

// ---------- Alterações nos arquivos ----------

/** O que o bot disse que está em andamento (música, duelo, quiz). Estado velho (bot travado) não conta. */
function ocupado() {
  try {
    const e = JSON.parse(readFileSync(ESTADO, 'utf8'));
    return Date.now() - e.em < 20_000 ? e.ocupado : [];
  } catch {
    return [];
  }
}

let adiadoDesde = 0;
let timerAdiado = null;
/** Reinício por arquivo alterado: espera a música, o duelo ou o quiz acabar (até 30 min). */
function reiniciarQuandoLivre(motivo) {
  clearTimeout(timerAdiado);
  const agora = ocupado();
  if (agora.length && (!adiadoDesde || Date.now() - adiadoDesde < ESPERA_MAXIMA_OCUPADO)) {
    if (!adiadoDesde) {
      adiadoDesde = Date.now();
      log(`⏸️ ${motivo}, mas o bot está ocupado (${agora.join(', ')}). Reinicio quando terminar.`);
    }
    timerAdiado = setTimeout(() => reiniciarQuandoLivre(motivo), 10_000);
    return;
  }
  if (adiadoDesde && agora.length) log('⏰ Esperei 30 min e o bot continua ocupado: reiniciando assim mesmo.');
  adiadoDesde = 0;
  reiniciar(motivo);
}

/** Confere os tipos do código novo (tsc). Devolve as primeiras linhas de erro, ou '' se estiver tudo certo. */
function conferirTipos() {
  const tsc = join(RAIZ, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!existsSync(tsc)) return Promise.resolve('');
  return new Promise((ok) => {
    const p = spawn(process.execPath, [tsc, '--noEmit', '-p', RAIZ], { cwd: RAIZ, windowsHide: true });
    let saida = '';
    p.stdout.on('data', (d) => (saida += d));
    p.stderr.on('data', (d) => (saida += d));
    p.on('error', () => ok(''));
    p.on('exit', (codigo) => ok(codigo === 0 ? '' : saida.trim().split(/\r?\n/).slice(0, 8).join('\n') || `tsc saiu com código ${codigo}`));
  });
}

let timerAlteracao = null;
const alterados = new Set();
function aoAlterar(arquivo) {
  // Ignora pastas de fora e arquivos temporários de editor (ex.: index.ts.tmp.1234.abcd, ~, .swp).
  if (!arquivo || /(^|[\\/])(\.git|node_modules|dados)([\\/]|$)|~$|\.tmp(\.|$)|\.swp$/.test(arquivo)) return;
  alterados.add(arquivo.replace(/\\/g, '/'));
  clearTimeout(timerAlteracao);
  // Espera parar de salvar (vários arquivos de uma vez, git pull) antes de reiniciar.
  timerAlteracao = setTimeout(processarAlteracoes, ESPERA_ALTERACAO);
}

async function processarAlteracoes() {
  // Código novo chegou mas as dependências ainda estão instalando: o bot segue na versão atual até acabar.
  if (atualizando()) {
    timerAlteracao = setTimeout(processarAlteracoes, ESPERA_ATUALIZACAO);
    return;
  }
  const lista = [...alterados].slice(0, 5).join(', ') + (alterados.size > 5 ? ` e mais ${alterados.size - 5}` : '');
  alterados.clear();
  // Código quebrado (no meio de uma edição, por exemplo): continua na versão que está rodando em vez de derrubar o bot.
  const erros = await conferirTipos();
  if (erros) {
    log(`⚠️ Arquivo alterado (${lista}), mas o código novo tem erro. O bot continua na versão que está rodando; corrija e salve de novo.\n${erros}`);
    return;
  }
  reiniciarQuandoLivre(`Arquivo alterado (${lista})`);
}

for (const pasta of ['src', 'assets']) {
  if (existsSync(join(RAIZ, pasta))) watch(join(RAIZ, pasta), { recursive: true }, (_e, f) => f && aoAlterar(`${pasta}/${f}`));
}
watch(RAIZ, (_e, f) => {
  if (f === '.env' || f === 'package.json') aoAlterar(f);
});

// ---------- Saída ----------

function encerrar() {
  log('⏹️ Supervisor encerrado.');
  try {
    if (Number(readFileSync(TRAVA, 'utf8')) === process.pid) unlinkSync(TRAVA);
  } catch {
    // sem trava para apagar
  }
  bot?.kill();
  process.exit(0);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
process.on('exit', () => bot?.kill());

log(`🍺 Supervisor da Taverna iniciado (PID ${process.pid}), vigiando src/, assets/, .env e package.json.`);
iniciar();
