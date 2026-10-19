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
`);
