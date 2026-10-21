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
`);
