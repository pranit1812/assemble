// Reset the database and load the seed catalogue. Run: npx tsx seed/seed.ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, run, get } from '../server/db';
import { isTag } from '../shared/tags';

const here = dirname(fileURLToPath(import.meta.url));
const load = <T = any>(f: string): T[] => JSON.parse(readFileSync(join(here, f), 'utf8'));

const merchants = load('merchants.json');
const products = load('products.json');
const listings = load('listings.json');
const guides = load('guides.json');
const recipes = load('recipes.json');
const history = load<{ type: string; label: string; area: string; hours_ago: number }>('history.json');

// Every tag must come from the closed vocabulary.
const bad = new Set<string>();
const check = (tags: string[]) => tags.forEach((t) => { if (!isTag(t)) bad.add(t); });
[...products, ...listings, ...guides].forEach((x) => check(x.tags));
recipes.forEach((r) => { if (r.whole_tag) check([r.whole_tag]); r.components.forEach((c: any) => check([c.tag, ...c.tags])); });
if (bad.size) throw new Error(`Unknown tags: ${[...bad].join(', ')}`);

const J = (v: unknown) => JSON.stringify(v);
const SEEDED = '-30 days'; // seeded rows are old, so only live additions get the NEW badge

db.exec('BEGIN');
try {
  // Children first (foreign keys are enforced).
  for (const t of ['offers', 'briefs', 'components', 'goals', 'kits', 'tasks', 'events', 'llm_cache', 'products', 'listings', 'guides', 'recipes', 'merchants']) {
    run(`DELETE FROM ${t}`);
  }
  run(`DELETE FROM sqlite_sequence WHERE name = 'events'`);

  for (const m of merchants) {
    run(`INSERT INTO merchants (id,name,kind,category,area,address,email,hours,blurb,lat,lng,walk_in,api_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      m.id, m.name, m.kind, m.category, m.area, m.address, m.email, m.hours, m.blurb, m.lat, m.lng, m.walk_in ? 1 : 0, m.api_key);
  }
  for (const p of products) {
    run(`INSERT INTO products (id,merchant_id,title,description,price_pence,tags,kind,stock,eta_days,guide_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now',?))`,
      p.id, p.merchant_id, p.title, p.description, p.price_pence, J(p.tags), p.kind, p.stock, p.eta_days, p.guide_id ?? null, SEEDED);
  }
  for (const s of listings) {
    run(`INSERT INTO listings (id,title,description,price_pence,tags,condition,seller,area,lat,lng,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now',?))`,
      s.id, s.title, s.description, s.price_pence, J(s.tags), s.condition, s.seller, s.area, s.lat, s.lng, SEEDED);
  }
  for (const g of guides) {
    run(`INSERT INTO guides (id,merchant_id,title,tags,difficulty,minutes,cost_pence,materials,steps) VALUES (?,?,?,?,?,?,?,?,?)`,
      g.id, g.merchant_id, g.title, J(g.tags), g.difficulty, g.minutes, g.cost_pence, J(g.materials), J(g.steps));
  }
  for (const r of recipes) {
    run(`INSERT INTO recipes (id,title,match,whole_tag,components) VALUES (?,?,?,?,?)`, r.id, r.title, J(r.match), r.whole_tag, J(r.components));
  }
  for (const h of history) {
    run(`INSERT INTO events (type,area,label,created_at) VALUES (?,?,?,datetime('now',?))`, h.type, h.area, h.label, `-${h.hours_ago} hours`);
  }

  const tasks = [
    ['t_demand', 'Demand analyst', 'Spot what shoppers near Dalston cannot find', 'done', '-3 hours',
      'Superman costume is the top goal near Dalston this week (37). Red cape is the most common unmet part (9).',
      { top_goal: 'Superman costume', area: 'Dalston', count_7d: 37, top_unmet: 'Red cape', unmet_count: 9 }],
    ['t_onboard', 'Shop onboarder', 'Onboard Dalston Party Store', 'done', '-2 hours',
      'Imported 9 products, set walk-in hours and issued an API key.',
      { merchant_id: 'm_party', products: 9 }],
    ['t_kit', 'Kit builder', 'Build a Superman kit for Dalston Party Store', 'queued', '-10 minutes',
      'Bundle emblem, boot covers and belt with a local cape and the no-sew cape guide.', null],
  ] as const;
  for (const [id, agent, title, status, ago, detail, result] of tasks) {
    run(`INSERT INTO tasks (id,agent,title,status,detail,result,created_at,updated_at) VALUES (?,?,?,?,?,?,datetime('now',?),datetime('now',?))`,
      id, agent, title, status, detail, result ? J(result) : null, ago, ago);
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

// Counts
for (const t of ['merchants', 'products', 'listings', 'guides', 'recipes', 'events', 'tasks']) {
  console.log(`${t.padEnd(10)} ${get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n}`);
}

// Coverage: every recipe component must have a route at each rung.
const has = (tags: string[], tag: string) => tags.includes(tag);
const kindOf = Object.fromEntries(merchants.map((m) => [m.id, m.kind]));
let gaps = 0;
for (const r of recipes) {
  for (const c of r.components) {
    const n = {
      diy: guides.filter((g) => has(g.tags, c.tag)).length,
      used: listings.filter((s) => has(s.tags, c.tag)).length,
      local: products.filter((p) => kindOf[p.merchant_id] === 'local' && has(p.tags, c.tag)).length,
      parts: products.filter((p) => kindOf[p.merchant_id] === 'online' && ['part', 'material'].includes(p.kind) && has(p.tags, c.tag)).length,
      new: products.filter((p) => kindOf[p.merchant_id] === 'online' && p.kind === 'complete' && has(p.tags, c.tag)).length,
    };
    const miss = Object.entries(n).filter(([, v]) => v === 0).map(([k]) => k);
    gaps += miss.length;
    console.log(`  ${r.id}/${c.tag.padEnd(16)} ${Object.entries(n).map(([k, v]) => `${k}:${v}`).join(' ')}${miss.length ? '  MISSING ' + miss.join(',') : ''}`);
  }
}
console.log(gaps ? `coverage gaps: ${gaps}` : 'coverage ok');
