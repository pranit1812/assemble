// The bridge: unmet parts become open briefs; a shop answers (portal, API key, or a Grok
// bot relaying a shop owner's text) and the offer lands live on the shopper's plan.
import { Router, type Request } from 'express';
import { all, get, run, J, id, logEvent } from '../db';
import { AREAS, km } from '../../shared/areas';
import { isTag } from '../../shared/tags';

export const bridgeRouter = Router();

const areaOf = (name: string | null) => AREAS.find((a) => a.name === name);

// Who is answering? Merchant API key, the admin passcode (+merchantId), or the ops key (+merchantId).
function merchantFor(req: Request) {
  const token = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '')?.[1];
  if (token && token !== process.env.OPS_KEY) return get<any>('SELECT * FROM merchants WHERE api_key = ?', token);
  const trusted = (token && token === process.env.OPS_KEY) || req.get('x-admin-passcode') === (process.env.ADMIN_PASSCODE || 'fleek');
  return trusted && req.body?.merchantId ? get<any>('SELECT * FROM merchants WHERE id = ?', req.body.merchantId) : undefined;
}

// Open briefs, optionally only those near a merchant.
bridgeRouter.get('/', (req, res) => {
  const m = req.query.merchantId ? get<any>('SELECT * FROM merchants WHERE id = ?', String(req.query.merchantId)) : null;
  const rows = all<any>(`SELECT b.*, g.title AS goal_title FROM briefs b LEFT JOIN goals g ON g.id = b.goal_id WHERE b.status = 'open' ORDER BY b.created_at DESC LIMIT 50`)
    .map((b) => {
      const a = areaOf(b.area);
      return { id: b.id, goalId: b.goal_id, goal: b.goal_title, part: b.component, tag: b.tag, area: b.area, createdAt: b.created_at,
        distanceKm: m?.lat != null && a ? km(m, a) : null };
    })
    .filter((b) => b.distanceKm == null || b.distanceKm <= 5);
  res.json(rows);
});

bridgeRouter.post('/:id/offers', (req, res) => {
  const b = get<any>('SELECT * FROM briefs WHERE id = ?', req.params.id);
  if (!b) return void res.status(404).json({ error: 'No such brief' });
  const m = merchantFor(req);
  if (!m) return void res.status(401).json({ error: 'Answer with your merchant API key, or the admin passcode / ops key plus merchantId.' });
  const { title, pricePence, price, note } = req.body ?? {};
  const pence = Number.isFinite(pricePence) ? Math.round(pricePence) : Math.round((Number(price) || 0) * 100);
  if (!title || pence <= 0) return void res.status(400).json({ error: 'Offer needs a title and a price' });
  const extra = String(title).toLowerCase().split(/[^a-z-]+/).filter(isTag);
  const pid = id('p');
  run('INSERT INTO products (id, merchant_id, title, description, price_pence, tags, kind, stock, eta_days) VALUES (?,?,?,?,?,?,?,?,?)',
    pid, m.id, String(title).slice(0, 80), note ?? `Offered for a brief: ${b.component}`, pence, JSON.stringify([...new Set([b.tag, ...extra])]), 'complete', 1, m.kind === 'local' ? 0 : 2);
  const oid = id('o');
  run('INSERT INTO offers (id, brief_id, merchant_id, price_pence, note) VALUES (?,?,?,?,?)', oid, b.id, m.id, pence, JSON.stringify({ title, productId: pid, note: note ?? '' }));
  // Answer every open brief for the same part nearby, not just this one: more buyers served.
  run("UPDATE briefs SET status = 'answered' WHERE tag = ? AND status = 'open'", b.tag);
  logEvent('offer.created', String(title), b.area, m.id, { briefId: b.id, pricePence: pence });
  run('INSERT INTO tasks (id, agent, title, status, detail) VALUES (?,?,?,?,?)', id('t'), 'Matchmaker', `${m.name} answered "${b.component}"`, 'done', `${title} · £${(pence / 100).toFixed(2)} · brief in ${b.area}`);
  res.status(201).json({ offerId: oid, productId: pid });
});

// Offers for one shopper's goal (polled by the plan page).
export function offersForGoal(goalId: string) {
  const goal = get<any>('SELECT lat, lng, created_at FROM goals WHERE id = ?', goalId);
  const comps = all<any>('SELECT id, tag FROM components WHERE goal_id = ?', goalId);
  return all<any>(`SELECT o.*, m.name AS mname, m.lat, m.lng, m.address, m.kind AS mkind, b.tag FROM offers o
      JOIN briefs b ON b.id = o.brief_id JOIN merchants m ON m.id = o.merchant_id ORDER BY o.created_at DESC LIMIT 20`)
    .filter((o) => comps.some((c) => c.tag === o.tag) && (!goal || o.created_at >= goal.created_at))
    .map((o) => {
      const n = J<any>(o.note, {});
      return { id: o.id, componentId: comps.find((c) => c.tag === o.tag)!.id, merchant: o.mname, merchantId: o.merchant_id, title: n.title ?? 'Offer',
        productId: n.productId, pricePence: o.price_pence, note: n.note ?? '', address: o.address,
        distanceKm: goal && o.lat != null ? km(goal, o) : null, createdAt: o.created_at };
    });
}
