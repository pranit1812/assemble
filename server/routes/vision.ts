// Grok-bot vision: shopper photos are saved on the VM and queued as tasks. A Grok bot on
// the VM opens the file, says what it sees and which parts the shopper already owns;
// the shopper's page picks that up live. No model API needed.
import { Router } from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { all, get, run, J, id, DB_PATH } from '../db';

export const UPLOADS = join(dirname(DB_PATH), 'uploads');
mkdirSync(UPLOADS, { recursive: true });
export const visionRouter = Router();

const authed = (h?: string) => h === `Bearer ${process.env.OPS_KEY}`;

export function queueVision(goalId: string, dataUrl: string, goalText: string, components: { id: string; name: string }[]) {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) return;
  const file = join(UPLOADS, `${goalId}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
  writeFileSync(file, Buffer.from(m[2], 'base64'));
  run('INSERT INTO tasks (id, agent, title, status, detail) VALUES (?,?,?,?,?)', id('t'), 'Vision', `Look at a shopper's photo`, 'queued',
    JSON.stringify({ goalId, imagePath: file, imageUrl: `/uploads/${file.split('/').pop()}`, goal: goalText, components }));
}

// Bot: claim the next photo (returns null when there is none).
visionRouter.get('/next', (req, res) => {
  if (!authed(req.get('authorization'))) return void res.status(401).json({ error: 'Authorization: Bearer <OPS_KEY>' });
  const t = get<any>("SELECT * FROM tasks WHERE agent = 'Vision' AND status = 'queued' ORDER BY created_at LIMIT 1");
  if (!t) return void res.json(null);
  run("UPDATE tasks SET status = 'running', updated_at = datetime('now') WHERE id = ?", t.id);
  res.json({ taskId: t.id, ...J<any>(t.detail, {}) });
});

// Bot: post what it saw.
visionRouter.post('/:taskId', (req, res) => {
  if (!authed(req.get('authorization'))) return void res.status(401).json({ error: 'Authorization: Bearer <OPS_KEY>' });
  const t = get<any>("SELECT * FROM tasks WHERE id = ? AND agent = 'Vision'", req.params.taskId);
  if (!t) return void res.status(404).json({ error: 'No such vision task' });
  const d = J<any>(t.detail, {});
  const ids = new Set((d.components ?? []).map((c: any) => c.id));
  const seen = String(req.body?.seen ?? '').slice(0, 280);
  const owned = ([] as string[]).concat(req.body?.owned ?? []).filter((o) => ids.has(o));
  run("UPDATE tasks SET status = 'done', result = ?, updated_at = datetime('now') WHERE id = ?", JSON.stringify({ seen, owned }), t.id);
  res.json({ ok: true, owned });
});

// Shopper page: has Grok looked yet?
visionRouter.get('/goal/:goalId', (req, res) => {
  const t = all<any>("SELECT * FROM tasks WHERE agent = 'Vision' ORDER BY created_at DESC LIMIT 50").find((x) => J<any>(x.detail, {}).goalId === req.params.goalId);
  if (!t) return void res.json({ status: 'none' });
  res.json({ status: t.status, ...(t.result ? J<any>(t.result, {}) : {}) });
});
