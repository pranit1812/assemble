// Owner view: everything on the platform at a glance: merchants, shoppers' requests, demand, bots.
import { Router, type Request } from 'express';
import { all, get } from '../db';

export const ownerRouter = Router();

// Signed in = the shop-portal passcode (header or its cookie) or the ops key. Everyone else gets no shopper names or wording.
const signedIn = (req: Request) =>
  (req.get('x-admin-passcode') ?? /(?:^|;\s*)assemble_admin=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]) === (process.env.ADMIN_PASSCODE || 'fleek') ||
  (!!process.env.OPS_KEY && req.get('authorization') === `Bearer ${process.env.OPS_KEY}`);

ownerRouter.get('/overview', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const n = (sql: string, ...p: any[]) => (get<any>(sql, ...p)?.n ?? 0) as number;
  const kpis = {
    goalsToday: n("SELECT COUNT(*) n FROM goals WHERE created_at > datetime('now','-1 day')"),
    goalsWeek: n("SELECT COUNT(*) n FROM events WHERE type = 'goal.created' AND created_at > datetime('now','-7 days')"),
    merchants: n('SELECT COUNT(*) n FROM merchants'),
    walkIn: n("SELECT COUNT(*) n FROM merchants WHERE kind = 'local' AND walk_in = 1"),
    neighbours: n('SELECT COUNT(DISTINCT seller) n FROM listings'),
    openBriefs: n("SELECT COUNT(*) n FROM briefs WHERE status = 'open'"),
    offers: n('SELECT COUNT(*) n FROM offers'),
    leads: n("SELECT COUNT(*) n FROM events WHERE type = 'lead.won'"),
    botTasks: n("SELECT COUNT(*) n FROM tasks WHERE agent NOT IN ('Orchestrator','Scouts','Judge','Advisor') AND created_at > datetime('now','-1 day')"),
  };
  const merchants = all<any>(`SELECT m.id, m.name, m.kind, m.category, m.area, m.walk_in,
      (SELECT COUNT(*) FROM products p WHERE p.merchant_id = m.id) AS products,
      (SELECT COUNT(*) FROM events e WHERE e.merchant_id = m.id AND e.type = 'lead.won') AS leads,
      (SELECT COUNT(*) FROM offers o WHERE o.merchant_id = m.id) AS offers,
      (SELECT MAX(created_at) FROM products p WHERE p.merchant_id = m.id) AS last_product
    FROM merchants m ORDER BY m.kind DESC, leads DESC, m.name`).map((m) => ({ ...m, walk_in: !!m.walk_in }));
  const requests = all<any>(`SELECT g.id, g.title, g.text, g.user_name, g.area, g.status, g.created_at,
      (SELECT GROUP_CONCAT(c.name, ', ') FROM components c WHERE c.goal_id = g.id AND c.unmet = 1) AS unmet,
      (SELECT COUNT(*) FROM components c WHERE c.goal_id = g.id) AS parts
    FROM goals g ORDER BY g.created_at DESC, g.rowid DESC LIMIT 25`);
  const count = (type: string) => all<any>(`SELECT label, COUNT(*) AS n FROM events WHERE type = ? AND created_at > datetime('now','-7 days') GROUP BY label ORDER BY n DESC LIMIT 6`, type);
  const bots = all<any>(`SELECT agent, title, status, detail, updated_at FROM tasks WHERE agent NOT IN ('Orchestrator','Scouts','Judge','Advisor') ORDER BY updated_at DESC LIMIT 10`);
  const unknownGoals = all<any>(`SELECT detail AS text, status FROM tasks WHERE agent = 'Recipe writer' ORDER BY created_at DESC LIMIT 6`);
  const me = signedIn(req);
  res.json({ kpis, merchants, topGoals: count('goal.created'), topUnmet: count('component.unmet'), bots, signedIn: me,
    requests: me ? requests : requests.map((g) => ({ ...g, text: g.title, user_name: null })),
    unknownGoals: me ? unknownGoals : unknownGoals.map((x) => ({ ...x, text: 'A new kind of goal (sign in to see it)' })) });
});
