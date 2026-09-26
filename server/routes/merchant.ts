import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, J, id, logEvent, db } from '../db';
import { AREAS, km } from '../../shared/areas';
import { TAGS } from '../../shared/tags';

export type Merchant = {
  id: string; name: string; kind: string; category: string; area: string | null;
  address: string | null; hours: string | null; blurb: string | null;
  lat: number | null; lng: number | null; walk_in: number;
  api_key: string | null; webhook_url: string | null;
};

export const findMerchant = (merchantId: string) => get<Merchant>('SELECT * FROM merchants WHERE id = ?', merchantId);

export function demandFor(merchant: Merchant) {
  const centre = merchant.lat != null && merchant.lng != null
    ? { lat: merchant.lat, lng: merchant.lng }
    : AREAS.find(area => area.name.toLowerCase() === merchant.area?.toLowerCase());
  const nearby = new Set(centre ? AREAS.filter(area => km(centre, area) <= 3).map(area => area.name) : []);
  const events = all<{ type: string; label: string; area: string; created_at: string }>(`
    SELECT type, label, area, created_at FROM events
    WHERE type IN ('goal.created', 'component.unmet')
      AND julianday(created_at) >= julianday('now', '-7 days')
      AND julianday(created_at) <= julianday('now')
    ORDER BY created_at
  `).filter(event => nearby.has(event.area));
  const trending = new Map<string, { label: string; count: number; areas: string[] }>();
  const unmet = new Map<string, { label: string; count: number; area: string }>();
  const hourMs = 60 * 60 * 1000;
  const firstHour = Math.floor(Date.now() / hourMs) * hourMs - 23 * hourMs;
  const spark = Array.from({ length: 24 }, (_, index) => ({ hour: new Date(firstHour + index * hourMs).toISOString(), count: 0 }));
  let total = 0;
  for (const event of events) {
    const label = event.label?.trim() || (event.type === 'goal.created' ? 'Untitled request' : 'Unspecified item');
    if (event.type === 'goal.created') {
      total++;
      const item = trending.get(label) ?? { label, count: 0, areas: [] };
      item.count++;
      if (!item.areas.includes(event.area)) item.areas.push(event.area);
      trending.set(label, item);
      // SQLite defaults are UTC without a timezone; ISO event timestamps may include one.
      const timestamp = Date.parse(event.created_at.includes('T') ? event.created_at : event.created_at.replace(' ', 'T') + 'Z');
      const bucket = Math.floor((timestamp - firstHour) / hourMs);
      if (bucket >= 0 && bucket < spark.length) spark[bucket].count++;
    } else {
      const key = JSON.stringify([label, event.area]);
      const item = unmet.get(key) ?? { label, count: 0, area: event.area };
      item.count++;
      unmet.set(key, item);
    }
  }
  const byCount = (a: { count: number; label: string }, b: { count: number; label: string }) => b.count - a.count || a.label.localeCompare(b.label);
  return { trending: [...trending.values()].sort(byCount), unmet: [...unmet.values()].sort(byCount), spark, total };
}

const productSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().default(''),
  pricePence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  tags: z.array(z.enum(TAGS)).min(1).max(TAGS.length).transform(tags => [...new Set(tags)]),
  kind: z.enum(['complete', 'part', 'material', 'tool']).optional().default('part'),
  stock: z.number().int().nonnegative().max(1_000_000).optional().default(10),
});

export function parseProduct(body: unknown, allowPounds = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return productSchema.safeParse(body);
  const input = body as Record<string, unknown>;
  const pounds = input.price;
  const pricePence = input.pricePence ?? (allowPounds && typeof pounds === 'number' && Number.isFinite(pounds) && pounds >= 0 ? Math.round((pounds + Number.EPSILON) * 100) : undefined);
  return productSchema.safeParse({ ...input, pricePence });
}

function serializeProduct(row: Record<string, unknown>) {
  return { ...row, tags: J<string[]>(row.tags as string, []) };
}

export function createProduct(merchant: Merchant, product: z.infer<typeof productSchema>) {
  const productId = id('product');
  db.exec('BEGIN');
  try {
    run(`INSERT INTO products (id, merchant_id, title, description, price_pence, tags, kind, stock, eta_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, productId, merchant.id, product.title, product.description,
    product.pricePence, JSON.stringify(product.tags), product.kind, product.stock, merchant.kind === 'local' ? 0 : 2);
    logEvent('product.created', product.title, merchant.area, merchant.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return serializeProduct(get<Record<string, unknown>>('SELECT * FROM products WHERE id = ?', productId)!);
}

export const merchantRouter = Router();

const cookieName = 'assemble_admin';
merchantRouter.delete('/session', (_req, res) => {
  res.clearCookie(cookieName, { path: '/', httpOnly: true, sameSite: 'lax' });
  res.status(204).end();
});

// This shared hackathon passcode permits switching between demo merchants.
merchantRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const header = req.get('X-Admin-Passcode');
  const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if ((header ?? cookie) !== 'fleek') {
    res.status(401).json({ error: 'Enter the merchant passcode to continue.' });
    return;
  }
  if (header) res.cookie(cookieName, 'fleek', { path: '/', httpOnly: true, sameSite: 'lax', secure: req.secure });
  next();
});

merchantRouter.get('/merchants', (req, res) => {
  const selected = typeof req.query.merchantId === 'string' ? req.query.merchantId : undefined;
  res.json(all<Merchant>('SELECT * FROM merchants ORDER BY name').map(({ api_key, ...merchant }) => ({
    ...merchant, walk_in: Boolean(merchant.walk_in), ...(merchant.id === selected ? { api_key } : {}),
  })));
});

merchantRouter.get('/demand', (req, res) => {
  const merchant = typeof req.query.merchantId === 'string' ? findMerchant(req.query.merchantId) : undefined;
  if (!merchant) { res.status(404).json({ error: 'Merchant not found.' }); return; }
  res.json(demandFor(merchant));
});

merchantRouter.get('/products', (req, res) => {
  const merchant = typeof req.query.merchantId === 'string' ? findMerchant(req.query.merchantId) : undefined;
  if (!merchant) { res.status(404).json({ error: 'Merchant not found.' }); return; }
  res.json(all<Record<string, unknown>>('SELECT * FROM products WHERE merchant_id = ? ORDER BY created_at DESC, rowid DESC', merchant.id).map(serializeProduct));
});

merchantRouter.post('/products', (req, res) => {
  const merchant = typeof req.body?.merchantId === 'string' ? findMerchant(req.body.merchantId) : undefined;
  if (!merchant) { res.status(404).json({ error: 'Merchant not found.' }); return; }
  const parsed = parseProduct(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Check your product details.', issues: parsed.error.flatten().fieldErrors }); return; }
  res.status(201).json(createProduct(merchant, parsed.data));
});

merchantRouter.patch('/merchants/:id', (req, res) => {
  const merchant = findMerchant(req.params.id);
  if (!merchant) { res.status(404).json({ error: 'Merchant not found.' }); return; }
  const parsed = z.object({ walkIn: z.boolean().optional(), webhookUrl: z.string().url().max(2000).nullable().optional() }).strict()
    .refine(body => body.walkIn !== undefined || body.webhookUrl !== undefined, 'Provide walkIn or webhookUrl.').safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Provide a boolean walkIn or a valid webhookUrl.' }); return; }
  const { walkIn, webhookUrl } = parsed.data;
  run('UPDATE merchants SET walk_in = ?, webhook_url = ? WHERE id = ?', walkIn === undefined ? merchant.walk_in : Number(walkIn), webhookUrl === undefined ? merchant.webhook_url : webhookUrl, merchant.id);
  const updated = findMerchant(merchant.id)!;
  res.json({ ...updated, walk_in: Boolean(updated.walk_in) });
});
