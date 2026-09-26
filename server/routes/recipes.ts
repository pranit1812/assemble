// Slow path: goals we have no house recipe for are queued as tasks for the Grok
// "Recipe writer" bot, which posts a recipe back. The next search is instant and rich.
import { Router } from 'express';
import { z } from 'zod';
import { all, run, J, id } from '../db';
import { isTag } from '../../shared/tags';
import { triggerBot } from '../trigger';

export const recipesRouter = Router();

const RecipeIn = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,40}$/),
  title: z.string().min(2).max(60),
  match: z.array(z.string().min(2)).min(1).max(12),
  whole_tag: z.string().nullable().optional(),
  components: z.array(z.object({ id: z.string(), name: z.string(), tag: z.string(), tags: z.array(z.string()).default([]), note: z.string().optional() })).min(1).max(6),
  taskId: z.string().optional(),
});

recipesRouter.get('/', (_q, res) => {
  res.json(all<any>('SELECT * FROM recipes').map((r) => ({ ...r, match: J(r.match, []), components: J(r.components, []) })));
});

recipesRouter.post('/', (req, res) => {
  if (req.get('authorization') !== `Bearer ${process.env.OPS_KEY}`) return void res.status(401).json({ error: 'Writes need Authorization: Bearer <OPS_KEY>.' });
  const p = RecipeIn.safeParse(req.body);
  if (!p.success) return void res.status(400).json({ error: 'Invalid recipe', issues: p.error.issues.slice(0, 5) });
  const r = p.data;
  const bad = r.components.flatMap((c) => [c.tag, ...c.tags]).filter((t) => !isTag(t));
  if (bad.length) return void res.status(400).json({ error: `Unknown tags: ${[...new Set(bad)].join(', ')}. Use only tags from GET /api/ops/tags.` });
  run('INSERT OR REPLACE INTO recipes (id, title, match, whole_tag, components) VALUES (?,?,?,?,?)', r.id, r.title, JSON.stringify(r.match.map((m) => m.toLowerCase())), r.whole_tag ?? null, JSON.stringify(r.components));
  if (r.taskId) run("UPDATE tasks SET status = 'done', result = ?, updated_at = datetime('now') WHERE id = ?", JSON.stringify({ recipe: r.id }), r.taskId);
  res.json({ ok: true, id: r.id });
});

export function queueRecipe(goalText: string, area: string) {
  const open = all<any>("SELECT id FROM tasks WHERE agent = 'Recipe writer' AND status IN ('queued','running') AND detail = ?", goalText);
  if (open.length) return;
  run('INSERT INTO tasks (id, agent, title, status, detail) VALUES (?,?,?,?,?)', id('t'), 'Recipe writer', `Write a house recipe (${area})`, 'queued', goalText);
  triggerBot('recipe', `write a recipe for: ${goalText}`, { goal: goalText, area });
}
