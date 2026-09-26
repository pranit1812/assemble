// Scouts: one per route, run in parallel per component over the seeded catalogue.
// Plain queries on purpose: instant, can't invent products, and a product a merchant
// adds is visible to the very next search.
import { all, J } from '../db';
import { km } from '../../shared/areas';
import { pounds, type Option, type RouteTag } from '../../shared/genui';
import type { Comp } from './orchestrator';

export type ScoutCtx = { lat: number; lng: number; owned: Set<string>; skill: string; deadlineDays: number };

const tagged = (col: string) => `EXISTS (SELECT 1 FROM json_each(${col}) WHERE value = ?)`;
const overlap = (tags: string, c: Comp) => J<string[]>(tags, []).filter((t) => c.tags.includes(t)).length;
const isRecent = (iso: string) => Date.now() - Date.parse(iso.replace(' ', 'T') + 'Z') < 3600e3;
const walkMins = (d: number) => Math.max(3, Math.round(d * 12));

function own(c: Comp, x: ScoutCtx): Option[] {
  if (!x.owned.has(c.id)) return [];
  return [{ id: `own:${c.id}`, tag: 'Own', title: `Use your own ${c.name.toLowerCase()}`, pricePence: 0, effortMins: 5, etaDays: 0,
    source: { name: 'You', kind: 'you' }, why: 'You already have it. Free, and nothing new gets made.', mindful: 0, feasible: true }];
}

function diy(c: Comp): Option[] {
  const rows = all<any>(`SELECT g.*, m.name AS mname FROM guides g LEFT JOIN merchants m ON m.id = g.merchant_id WHERE ${tagged('g.tags')}`, c.tag);
  return rows
    .sort((a, b) => overlap(b.tags, c) - overlap(a.tags, c) || a.minutes - b.minutes)
    .slice(0, 2)
    .map((g) => ({ id: `guide:${g.id}`, tag: 'DIY' as const, title: g.title, pricePence: g.cost_pence, effortMins: g.minutes, etaDays: 0,
      source: { name: g.mname ?? 'Community guide', kind: g.mname ? ('merchant' as const) : ('community' as const), merchantId: g.merchant_id ?? undefined },
      guideId: g.id, why: `${g.minutes} min, ${g.difficulty}, about ${pounds(g.cost_pence)} in materials if you have none.`, mindful: 0, feasible: true }));
}

function secondhand(c: Comp, x: ScoutCtx): Option[] {
  const rows = all<any>(`SELECT * FROM listings WHERE ${tagged('tags')}`, c.tag);
  return rows
    .map((l) => ({ l, d: km(x, l) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 2)
    .map(({ l, d }) => ({ id: `listing:${l.id}`, tag: 'Secondhand' as const, title: l.title, pricePence: l.price_pence, effortMins: walkMins(d) * 2, etaDays: d <= 3 ? 0 : 1,
      source: { name: l.seller ?? 'A neighbour', kind: 'seller' as const, area: l.area, distanceKm: d, lat: l.lat, lng: l.lng },
      isNew: isRecent(l.created_at),
      why: `${l.condition ? l.condition[0].toUpperCase() + l.condition.slice(1) : 'Good'}, ${d} km away (${walkMins(d)} min walk). Already exists, so nothing new is made.`, mindful: 0, feasible: true }));
}

function local(c: Comp, x: ScoutCtx): Option[] {
  const rows = all<any>(`SELECT p.*, m.name AS mname, m.area AS marea, m.lat AS mlat, m.lng AS mlng FROM products p JOIN merchants m ON m.id = p.merchant_id
    WHERE m.kind = 'local' AND m.walk_in = 1 AND p.stock > 0 AND ${tagged('p.tags')}`, c.tag);
  return rows
    .map((p) => ({ p, d: km(x, { lat: p.mlat, lng: p.mlng }) }))
    .sort((a, b) => a.d - b.d || overlap(b.p.tags, c) - overlap(a.p.tags, c))
    .slice(0, 2)
    .map(({ p, d }) => ({ id: `product:${p.id}`, tag: 'Local' as const, title: p.title, pricePence: p.price_pence, effortMins: walkMins(d) * 2, etaDays: 0,
      source: { name: p.mname, kind: 'merchant' as const, merchantId: p.merchant_id, area: p.marea, distanceKm: d, lat: p.mlat, lng: p.mlng },
      isNew: isRecent(p.created_at), guideId: p.guide_id ?? undefined, makeIt: p.kind === 'material' || p.kind === 'part',
      why: `On the shelf at ${p.mname}, ${d} km away. Walk in today, and your money stays local.`, mindful: 0, feasible: true }));
}

function online(c: Comp, kinds: string[]) {
  return all<any>(`SELECT p.*, m.name AS mname FROM products p JOIN merchants m ON m.id = p.merchant_id
    WHERE m.kind = 'online' AND p.stock > 0 AND p.kind IN (${kinds.map(() => '?').join(',')}) AND ${tagged('p.tags')}`, ...kinds, c.tag)
    .sort((a, b) => overlap(b.tags, c) - overlap(a.tags, c) || a.price_pence - b.price_pence);
}

function parts(c: Comp): Option[] {
  const rows = online(c, ['part', 'material']).slice(0, 2);
  if (!rows.length) return [];
  const guide = all<any>(`SELECT minutes FROM guides WHERE ${tagged('tags')} ORDER BY minutes LIMIT 1`, c.tag)[0];
  const total = rows.reduce((s, p) => s + p.price_pence, 0);
  const shops = [...new Set(rows.map((p) => p.mname))];
  return [{ id: `parts:${c.id}`, tag: 'Parts', title: rows.map((p) => p.title).join(' + '), pricePence: total, effortMins: guide?.minutes ?? 30,
    etaDays: Math.max(...rows.map((p) => p.eta_days)), source: { name: shops.join(' & '), kind: 'merchant', merchantId: rows[0].merchant_id },
    productIds: rows.map((p) => p.id), isNew: rows.some((p) => isRecent(p.created_at)),
    why: `Combine ${rows.length === 1 ? 'one part' : `${rows.length} parts`} for ${pounds(total)}. More effort, less packaging than a finished one.`, mindful: 0, feasible: true }];
}

function brandNew(c: Comp): Option[] {
  return online(c, ['complete'])
    .sort((a, b) => a.price_pence - b.price_pence)
    .slice(0, 1)
    .map((p) => ({ id: `product:${p.id}`, tag: 'New' as const, title: p.title, pricePence: p.price_pence, effortMins: 5, etaDays: p.eta_days,
      source: { name: p.mname, kind: 'merchant' as const, merchantId: p.merchant_id }, isNew: isRecent(p.created_at), guideId: p.guide_id ?? undefined,
      why: `Arrives in ${p.eta_days} day${p.eta_days === 1 ? '' : 's'}. The fallback if nothing nearby works.`, mindful: 0, feasible: true }));
}

export const SCOUTS: Record<RouteTag, (c: Comp, x: ScoutCtx) => Option[]> = {
  Own: own,
  DIY: (c) => diy(c),
  Secondhand: secondhand,
  Local: local,
  Parts: (c) => parts(c),
  New: (c) => brandNew(c),
};

// "Buy the complete thing new" for the whole goal (e.g. a boxed Superman costume).
export function wholeProduct(tag: string | null) {
  if (!tag) return null;
  return all<any>(`SELECT p.*, m.name AS mname FROM products p JOIN merchants m ON m.id = p.merchant_id
    WHERE m.kind = 'online' AND p.kind = 'complete' AND ${tagged('p.tags')}
    ORDER BY (EXISTS (SELECT 1 FROM json_each(p.tags) WHERE value = 'adult')) DESC, p.price_pence LIMIT 1`, tag)[0] ?? null;
}
