// Mantém o bot rodando em segundo plano no Windows (ou em qualquer sistema):
// - reinicia sozinho quando um arquivo de src/, assets/, .env ou package.json muda;
// - religa se o bot cair (esperando mais a cada queda seguida, até 1 minuto);
// - grava a saída do bot em dados/bot.log (gira em 5 MB, guarda o anterior em bot.log.1);
// - não deixa abrir duas cópias (trava em dados/supervisor.pid).
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

function iniciar() {
  clearTimeout(timerReinicio);
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

let timerAlteracao = null;
const alterados = new Set();
function aoAlterar(arquivo) {
  if (!arquivo || /(^|[\\/])(\.git|node_modules|dados)([\\/]|$)|~$|\.tmp$|\.swp$/.test(arquivo)) return;
  alterados.add(arquivo.replace(/\\/g, '/'));
  clearTimeout(timerAlteracao);
  // Espera parar de salvar (vários arquivos de uma vez, git pull) antes de reiniciar.
  timerAlteracao = setTimeout(() => {
    const lista = [...alterados].slice(0, 5).join(', ') + (alterados.size > 5 ? ` e mais ${alterados.size - 5}` : '');
    alterados.clear();
    reiniciarQuandoLivre(`Arquivo alterado (${lista})`);
  }, ESPERA_ALTERACAO);
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
