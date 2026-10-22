import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

mkdirSync('dados', { recursive: true });

export const db = new DatabaseSync('dados/taverna.db');

// As fichas eram de D&D 5e; a mesa joga 3.5. A tabela antiga é guardada como fichas_5e, não apagada.
const colunasFichas = db.prepare("SELECT name FROM pragma_table_info('fichas')").all() as { name: string }[];
if (colunasFichas.length && !colunasFichas.some((c) => c.name === 'bba')) {
  db.exec('DROP TABLE IF EXISTS fichas_5e; ALTER TABLE fichas RENAME TO fichas_5e;');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS calls_temporarias (
    canal_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    dono_id  TEXT NOT NULL
  );

  -- D&D 3.5
  CREATE TABLE IF NOT EXISTS fichas (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    nome     TEXT NOT NULL,
    classe   TEXT NOT NULL,
    raca     TEXT NOT NULL DEFAULT '',
    nivel    INTEGER NOT NULL,
    forca    INTEGER NOT NULL,
    destreza INTEGER NOT NULL,
    constituicao INTEGER NOT NULL,
    inteligencia INTEGER NOT NULL,
    sabedoria INTEGER NOT NULL,
    carisma  INTEGER NOT NULL,
    pv_max   INTEGER NOT NULL,
    pv_atual INTEGER NOT NULL,
    ca       INTEGER NOT NULL,
    bba      INTEGER NOT NULL,
    fort     INTEGER NOT NULL,
    ref      INTEGER NOT NULL,
    von      INTEGER NOT NULL,
    ini_extra INTEGER NOT NULL DEFAULT 0,
    pericias TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (guild_id, user_id)
  );

  -- Daggerheart
  CREATE TABLE IF NOT EXISTS fichas_dh (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    nome     TEXT NOT NULL,
    classe   TEXT NOT NULL,
    ancestralidade TEXT NOT NULL DEFAULT '',
    comunidade TEXT NOT NULL DEFAULT '',
    nivel    INTEGER NOT NULL,
    agilidade INTEGER NOT NULL,
    forca    INTEGER NOT NULL,
    acuidade INTEGER NOT NULL,
    instinto INTEGER NOT NULL,
    presenca INTEGER NOT NULL,
    conhecimento INTEGER NOT NULL,
    evasao   INTEGER NOT NULL,
    proficiencia INTEGER NOT NULL DEFAULT 1,
    pv_max   INTEGER NOT NULL,
    pv       INTEGER NOT NULL DEFAULT 0,
    estresse_max INTEGER NOT NULL DEFAULT 6,
    estresse INTEGER NOT NULL DEFAULT 0,
    esperanca INTEGER NOT NULL DEFAULT 2,
    armadura_max INTEGER NOT NULL,
    armadura INTEGER NOT NULL DEFAULT 0,
    limiar_maior INTEGER NOT NULL,
    limiar_grave INTEGER NOT NULL,
    experiencias TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (guild_id, user_id)
  );

  -- Reserva de Medo do Mestre de Daggerheart
  CREATE TABLE IF NOT EXISTS dh_medo (
    guild_id TEXT PRIMARY KEY,
    medo     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS lembretes (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    canal_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    quando   INTEGER NOT NULL,
    texto    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS aniversarios (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    dia      INTEGER NOT NULL,
    mes      INTEGER NOT NULL,
    ultimo_ano_avisado INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  -- Gótica de estimação (uma por pessoa em cada servidor)
  CREATE TABLE IF NOT EXISTS goticas (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    nome     TEXT NOT NULL,
    aparencia TEXT NOT NULL,
    personalidade TEXT NOT NULL,
    nivel    INTEGER NOT NULL DEFAULT 1,
    xp       INTEGER NOT NULL DEFAULT 0,
    barriga  REAL NOT NULL,
    humor    REAL NOT NULL,
    energia  REAL NOT NULL,
    atualizado_em INTEGER NOT NULL,
    ultimas  TEXT NOT NULL DEFAULT '{}',
    criada_em INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );

  -- Moedas da Taverna e nível por atividade
  CREATE TABLE IF NOT EXISTS carteira (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    moedas   INTEGER NOT NULL DEFAULT 0,
    nivel    INTEGER NOT NULL DEFAULT 0,
    xp       INTEGER NOT NULL DEFAULT 0,
    mensagens INTEGER NOT NULL DEFAULT 0,
    minutos_call INTEGER NOT NULL DEFAULT 0,
    ultima_msg INTEGER NOT NULL DEFAULT 0,
    ultimo_daily INTEGER NOT NULL DEFAULT 0,
    sequencia INTEGER NOT NULL DEFAULT 0,
    ultimo_trabalho INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  -- Itens comprados na loja da gótica
  CREATE TABLE IF NOT EXISTS gotica_itens (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    item     TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id, item)
  );
`);

const colunasGoticas = db.prepare("SELECT name FROM pragma_table_info('goticas')").all() as { name: string }[];
if (!colunasGoticas.some((c) => c.name === 'equipados')) db.exec("ALTER TABLE goticas ADD COLUMN equipados TEXT NOT NULL DEFAULT '{}'");

const colunasLembretes = db.prepare("SELECT name FROM pragma_table_info('lembretes')").all() as { name: string }[];
if (colunasLembretes.length && !colunasLembretes.some((c) => c.name === 'no_canal')) db.exec('ALTER TABLE lembretes ADD COLUMN no_canal INTEGER NOT NULL DEFAULT 1');

const colunasCarteira = db.prepare("SELECT name FROM pragma_table_info('carteira')").all() as { name: string }[];
if (!colunasCarteira.some((c) => c.name === 'xp_dobro_ate')) db.exec('ALTER TABLE carteira ADD COLUMN xp_dobro_ate INTEGER NOT NULL DEFAULT 0');
