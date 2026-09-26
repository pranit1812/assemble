import { randomBytes } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { all, db, get, id, J, logEvent, run } from '../db';
import { findArea } from '../../shared/areas';
import { isTag } from '../../shared/tags';

export const opsRouter = Router();

const STATUSES = ['queued', 'running', 'needs_approval', 'done', 'failed'] as const;
const CATEGORIES = ['costume', 'craft', 'maker', 'party', 'fabric', 'garden', 'hardware'] as const;
const KINDS = ['complete', 'part', 'material', 'tool'] as const;

opsRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

function requireKey(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const token = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') ?? '')?.[1];
  const key = process.env.OPS_KEY;
  if (!key || token !== key) {
    res.status(401).json({ error: 'Writes need Authorization: Bearer <OPS_KEY>.' });
    return;
  }
  next();
}
opsRouter.use(requireKey);

function param(req: Request, name: string) {
  const value = req.params[name];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function iso(value: string | null | undefined) {
  if (!value) return null;
  if (/[zZ]$/.test(value) || /[+-]\d\d:?\d\d$/.test(value)) return value;
  return `${value.includes('T') ? value : value.replace(' ', 'T')}Z`;
}

function fail(res: Response, error: string, issues?: unknown) {
  res.status(400).json(issues ? { error, issues } : { error });
}

function isConstraint(error: unknown) {
  const err = error as { code?: string; message?: string };
  return /UNIQUE|SQLITE_CONSTRAINT/i.test(`${err?.code ?? ''} ${err?.message ?? ''}`);
}

// ~200m disk around the area centre. 1° lat ≈ 111.32km.
function jitter(lat: number, lng: number, metres = 200) {
  const radius = metres * Math.sqrt(Math.random());
  const angle = Math.random() * Math.PI * 2;
  const latRad = (lat * Math.PI) / 180;
  const dLat = (radius * Math.cos(angle)) / 111_320;
  const dLng = (radius * Math.sin(angle)) / (111_320 * Math.cos(latRad));
  return {
    lat: Math.round((lat + dLat) * 1e6) / 1e6,
    lng: Math.round((lng + dLng) * 1e6) / 1e6,
  };
}

type TaskRow = {
  id: string; agent: string; title: string; status: string;
  detail: string | null; result: string | null; created_at: string; updated_at: string;
};

function taskJson(row: TaskRow) {
  return {
    id: row.id,
    agent: row.agent,
    title: row.title,
    status: row.status,
    detail: row.detail,
    result: J(row.result, null),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

const taskCreate = z.object({
  agent: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  detail: z.string().max(4000).optional(),
  status: z.enum(STATUSES).optional(),
});

const taskPatch = z.object({
  status: z.enum(STATUSES).optional(),
  detail: z.string().max(4000).nullable().optional(),
  result: z.unknown().optional(),
}).refine((body) => body.status !== undefined || body.detail !== undefined || body.result !== undefined, {
  message: 'Provide status, detail, or result.',
});

opsRouter.get('/tasks', (_req, res) => {
  const rows = all<TaskRow>('SELECT * FROM tasks ORDER BY created_at DESC, rowid DESC');
  res.json(rows.map(taskJson));
});

opsRouter.post('/tasks', (req, res) => {
  const parsed = taskCreate.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 'Task needs an agent and a title.', parsed.error.flatten().fieldErrors);
    return;
  }
  const { agent, title, detail, status } = parsed.data;
  const taskId = id('t');
  run(
    `INSERT INTO tasks (id, agent, title, status, detail, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    taskId, agent, title, status ?? 'queued', detail ?? null,
  );
  res.status(201).json(taskJson(get<TaskRow>('SELECT * FROM tasks WHERE id = ?', taskId)!));
});

opsRouter.patch('/tasks/:id', (req, res) => {
  const parsed = taskPatch.safeParse(req.body ?? {});
  if (!parsed.success) {
    const empty = parsed.error.issues.some((issue) => issue.code === 'custom');
    fail(res, empty ? 'Provide status, detail, or result.' : 'Check the task fields. Status is queued, running, needs_approval, done, or failed.', parsed.error.flatten().fieldErrors);
    return;
  }
  const taskId = param(req, 'id');
  const current = get<TaskRow>('SELECT * FROM tasks WHERE id = ?', taskId);
  if (!current) {
    res.status(404).json({ error: 'No such task.' });
    return;
  }
  const { status, detail, result } = parsed.data;
  let storedResult = current.result;
  if (result !== undefined) {
    if (result === null) storedResult = null;
    else {
      const encoded = JSON.stringify(result);
      if (encoded.length > 8000) {
        fail(res, 'Result is too long.');
        return;
      }
      storedResult = encoded;
    }
  }
  run(
    `UPDATE tasks SET status = ?, detail = ?, result = ?, updated_at = datetime('now') WHERE id = ?`,
    status ?? current.status,
    detail === undefined ? current.detail : detail,
    storedResult,
    taskId,
  );
  res.json(taskJson(get<TaskRow>('SELECT * FROM tasks WHERE id = ?', taskId)!));
});

opsRouter.get('/insights', (_req, res) => {
  const topGoals = all<{ label: string; count: number }>(`
    SELECT label, COUNT(*) AS count FROM events
    WHERE type = 'goal.created' AND label IS NOT NULL AND trim(label) != ''
    GROUP BY label ORDER BY count DESC, label ASC LIMIT 12
  `).map((row) => ({ label: row.label, count: Number(row.count) }));

  const unmet = all<{ label: string; count: number; area: string | null }>(`
    SELECT label, area, COUNT(*) AS count FROM events
    WHERE type = 'component.unmet' AND label IS NOT NULL AND trim(label) != ''
    GROUP BY label, area ORDER BY count DESC, label ASC LIMIT 20
  `).map((row) => ({ label: row.label, count: Number(row.count), area: row.area }));

  const recentGoals = all<{ id: string; title: string | null; text: string; area: string | null; status: string; created_at: string }>(`
    SELECT id, title, text, area, status, created_at FROM goals
    ORDER BY created_at DESC, rowid DESC LIMIT 12
  `).map((row) => ({
    id: row.id,
    title: row.title,
    text: row.text,
    area: row.area,
    status: row.status,
    createdAt: iso(row.created_at),
  }));

  res.json({ topGoals, unmet, recentGoals });
});

function productRoute(merchantKind: string, kind: string) {
  if (merchantKind === 'local') return 'Local';
  if (kind === 'complete') return 'New';
  return 'Parts';
}

opsRouter.get('/search', (req, res) => {
  const raw = Array.isArray(req.query.tag) ? req.query.tag[0] : req.query.tag;
  const tag = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!tag) {
    fail(res, 'Provide ?tag= with a tag from the closed list.');
    return;
  }
  if (!isTag(tag)) {
    fail(res, `Unknown tag "${tag}". Use a tag from shared/tags.ts.`);
    return;
  }
  const tagged = (column: string) => `EXISTS (SELECT 1 FROM json_each(${column}) WHERE value = ?)`;

  const products = all<{ id: string; title: string; price_pence: number; kind: string; merchant_kind: string; source: string }>(`
    SELECT p.id, p.title, p.price_pence, p.kind, m.kind AS merchant_kind, m.name AS source
    FROM products p JOIN merchants m ON m.id = p.merchant_id
    WHERE ${tagged('p.tags')}
  `, tag).map((row) => ({
    ref: `product:${row.id}`,
    title: row.title,
    pricePence: row.price_pence,
    route: productRoute(row.merchant_kind, row.kind),
    source: row.source,
  }));

  const listings = all<{ id: string; title: string; price_pence: number; source: string | null }>(`
    SELECT id, title, price_pence, COALESCE(seller, area, 'A neighbour') AS source
    FROM listings WHERE ${tagged('tags')}
  `, tag).map((row) => ({
    ref: `listing:${row.id}`,
    title: row.title,
    pricePence: row.price_pence,
    route: 'Secondhand',
    source: row.source ?? 'A neighbour',
  }));

  const guides = all<{ id: string; title: string; price_pence: number; source: string }>(`
    SELECT g.id, g.title, g.cost_pence AS price_pence, COALESCE(m.name, 'Community guide') AS source
    FROM guides g LEFT JOIN merchants m ON m.id = g.merchant_id
    WHERE ${tagged('g.tags')}
  `, tag).map((row) => ({
    ref: `guide:${row.id}`,
    title: row.title,
    pricePence: row.price_pence,
    route: 'DIY',
    source: row.source,
  }));

  const order = ['Local', 'Secondhand', 'DIY', 'Parts', 'New'];
  const items = [...products, ...listings, ...guides].sort(
    (a, b) => order.indexOf(a.route) - order.indexOf(b.route) || a.title.localeCompare(b.title),
  );
  res.json(items);
});

const merchantCreate = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().toLowerCase().pipe(z.enum(CATEGORIES)),
  area: z.string().trim().min(1).max(80),
  address: z.string().trim().max(300).optional(),
  hours: z.string().trim().max(200).optional(),
  email: z.string().trim().max(200).optional(),
  blurb: z.string().trim().max(500).optional(),
  walkIn: z.boolean().optional(),
  products: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    pricePence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    tags: z.array(z.string()).optional().default([]),
    kind: z.string().trim().toLowerCase().pipe(z.enum(KINDS)),
  })).max(40),
});

opsRouter.post('/merchants', (req, res) => {
  const parsed = merchantCreate.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 'Check the shop. Need name, category, area, and products with title, pricePence, and kind.', parsed.error.flatten().fieldErrors);
    return;
  }
  const body = parsed.data;
  const area = findArea(body.area);
  if (!area) {
    fail(res, `Unknown area "${body.area}". Use an area name or postcode from shared/areas.ts. Prefer the name — E8 matches Hackney.`);
    return;
  }

  const dropped = new Set<string>();
  const products = body.products.map((product) => {
    const tags: string[] = [];
    for (const tag of product.tags) {
      const raw = tag.trim().toLowerCase();
      if (!raw) continue;
      if (isTag(raw)) tags.push(raw);
      else dropped.add(tag.trim());
    }
    return { ...product, tags: [...new Set(tags)] };
  });

  const merchantId = id('m');
  const apiKey = `mk_live_${randomBytes(6).toString('hex')}`;
  const point = jitter(area.lat, area.lng);
  const walkIn = body.walkIn ?? true;
  const saved: { id: string; title: string; pricePence: number; tags: string[]; kind: string; etaDays: number }[] = [];

  db.exec('BEGIN');
  try {
    run(
      `INSERT INTO merchants (id, name, kind, category, area, address, email, hours, blurb, lat, lng, walk_in, api_key)
       VALUES (?, ?, 'local', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      merchantId, body.name, body.category, area.name,
      body.address || null, body.email || null, body.hours || null, body.blurb || null,
      point.lat, point.lng, walkIn ? 1 : 0, apiKey,
    );
    for (const product of products) {
      const productId = id('p');
      run(
        `INSERT INTO products (id, merchant_id, title, description, price_pence, tags, kind, stock, eta_days)
         VALUES (?, ?, ?, '', ?, ?, ?, 10, 0)`,
        productId, merchantId, product.title, product.pricePence, JSON.stringify(product.tags), product.kind,
      );
      saved.push({ id: productId, title: product.title, pricePence: product.pricePence, tags: product.tags, kind: product.kind, etaDays: 0 });
    }
    logEvent('merchant.onboarded', body.name, area.name, merchantId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    if (isConstraint(error)) {
      res.status(409).json({ error: 'Could not save that shop. Try again.' });
      return;
    }
    throw error;
  }

  res.status(201).json({
    id: merchantId,
    name: body.name,
    kind: 'local',
    category: body.category,
    area: area.name,
    address: body.address || null,
    hours: body.hours || null,
    email: body.email || null,
    blurb: body.blurb || null,
    lat: point.lat,
    lng: point.lng,
    walkIn,
    api_key: apiKey,
    products: saved,
    droppedTags: [...dropped],
  });
});

type ShopRow = {
  id: string; name: string; category: string; area: string | null; address: string | null;
  hours: string | null; blurb: string | null; lat: number | null; lng: number | null;
  walk_in: number; created_at: string;
};

opsRouter.get('/merchants', (_req, res) => {
  const shops = all<ShopRow>(`
    SELECT m.id, m.name, m.category, m.area, m.address, m.hours, m.blurb, m.lat, m.lng, m.walk_in,
           MAX(e.created_at) AS created_at, MAX(e.id) AS event_id
    FROM events e
    JOIN merchants m ON m.id = e.merchant_id
    WHERE e.type = 'merchant.onboarded'
    GROUP BY m.id
    ORDER BY event_id DESC
    LIMIT 24
  `);
  res.json(shops.map((shop) => ({
    id: shop.id,
    name: shop.name,
    category: shop.category,
    area: shop.area,
    address: shop.address,
    hours: shop.hours,
    blurb: shop.blurb,
    lat: shop.lat,
    lng: shop.lng,
    walkIn: Boolean(shop.walk_in),
    createdAt: iso(shop.created_at),
    products: all<{ title: string; price_pence: number; tags: string; kind: string }>(
      'SELECT title, price_pence, tags, kind FROM products WHERE merchant_id = ? ORDER BY rowid',
      shop.id,
    ).map((product) => ({
      title: product.title,
      pricePence: product.price_pence,
      tags: J<string[]>(product.tags, []),
      kind: product.kind,
    })),
  })));
});

opsRouter.get('/events', (_req, res) => {
  const rows = all<{ id: number; type: string; area: string | null; label: string | null; merchant_id: string | null; payload: string | null; created_at: string }>(`
    SELECT id, type, area, label, merchant_id, payload, created_at
    FROM events ORDER BY id DESC LIMIT 20
  `);
  res.json(rows.map((row) => ({
    id: row.id,
    type: row.type,
    area: row.area,
    label: row.label,
    merchantId: row.merchant_id,
    payload: J(row.payload, null),
    createdAt: iso(row.created_at),
  })));
});

type KitRow = {
  id: string; slug: string; title: string; tagline: string | null; description: string | null;
  accent: string | null; emoji: string | null; items: string; status: string;
  created_by: string | null; created_at: string;
};

function kitJson(row: KitRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    tagline: row.tagline,
    description: row.description,
    accent: row.accent,
    emoji: row.emoji,
    items: J<{ ref: string; note?: string }[]>(row.items, []),
    status: row.status,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

const kitCreate = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(160),
  tagline: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  accent: z.string().trim().max(20).optional(),
  emoji: z.string().trim().max(16).optional(),
  items: z.array(z.object({
    ref: z.string().trim().regex(/^(product|listing|guide):\S+$/),
    note: z.string().max(300).optional(),
  })).min(1).max(40),
});

opsRouter.get('/kits', (_req, res) => {
  res.json(all<KitRow>('SELECT * FROM kits ORDER BY created_at DESC, rowid DESC').map(kitJson));
});

opsRouter.post('/kits', (req, res) => {
  const parsed = kitCreate.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 'Kit needs slug, title, tagline, description, and items[{ref, note?}]. Refs look like product:p_abc.', parsed.error.flatten().fieldErrors);
    return;
  }
  const kit = parsed.data;
  const kitId = id('k');
  try {
    run(
      `INSERT INTO kits (id, slug, title, tagline, description, accent, emoji, items, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      kitId, kit.slug, kit.title, kit.tagline, kit.description,
      kit.accent ?? null, kit.emoji ?? null, JSON.stringify(kit.items),
    );
  } catch (error) {
    if (isConstraint(error)) {
      res.status(409).json({ error: `Slug "${kit.slug}" is already used.` });
      return;
    }
    throw error;
  }
  res.status(201).json(kitJson(get<KitRow>('SELECT * FROM kits WHERE id = ?', kitId)!));
});

opsRouter.post('/kits/:id/approve', (req, res) => {
  const kitId = param(req, 'id');
  const current = get<KitRow>('SELECT * FROM kits WHERE id = ?', kitId);
  if (!current) {
    res.status(404).json({ error: 'No such kit.' });
    return;
  }
  if (current.status !== 'live') run(`UPDATE kits SET status = 'live' WHERE id = ?`, kitId);
  res.json(kitJson(get<KitRow>('SELECT * FROM kits WHERE id = ?', kitId)!));
});
