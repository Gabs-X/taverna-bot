import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

mkdirSync('dados', { recursive: true });

export const db = new DatabaseSync('dados/taverna.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS calls_temporarias (
    canal_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    dono_id  TEXT NOT NULL
  );

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
    pericias TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (guild_id, user_id)
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
