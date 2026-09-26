import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DB_PATH = process.env.DB_PATH || join(root, 'data', 'assemble.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
db.exec(readFileSync(join(root, 'server', 'schema.sql'), 'utf8'));

type P = (string | number | null)[];
export const all = <T = any>(sql: string, ...p: P) => db.prepare(sql).all(...p) as T[];
export const get = <T = any>(sql: string, ...p: P) => db.prepare(sql).get(...p) as T | undefined;
export const run = (sql: string, ...p: P) => db.prepare(sql).run(...p);

export const J = <T = any>(s: string | null | undefined, fallback: T = null as T): T => {
  if (s == null) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};
export const id = (prefix: string) => `${prefix}_${randomBytes(4).toString('hex')}`;

export function logEvent(type: string, label: string, area: string | null = null, merchantId: string | null = null, payload: unknown = null) {
  run('INSERT INTO events (type, area, label, merchant_id, payload) VALUES (?,?,?,?,?)', type, area, label, merchantId, payload == null ? null : JSON.stringify(payload));
}
