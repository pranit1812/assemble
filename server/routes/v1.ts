import { Router } from 'express';
import { get } from '../db';
import { createProduct, demandFor, parseProduct, type Merchant } from './merchant';

export const v1Router = Router();

v1Router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const token = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') ?? '')?.[1];
  const merchant = token ? get<Merchant>('SELECT * FROM merchants WHERE api_key = ?', token) : undefined;
  if (!merchant) {
    res.set('WWW-Authenticate', 'Bearer');
    res.status(401).json({ error: 'A valid merchant API key is required. Use Authorization: Bearer <api_key>.' });
    return;
  }
  res.locals.merchant = merchant;
  next();
});

v1Router.post('/catalog', (req, res) => {
  const parsed = parseProduct(req.body, true);
  if (!parsed.success) { res.status(400).json({ error: 'Check your product details. Supply price in pounds or pricePence, plus valid tags.', issues: parsed.error.flatten().fieldErrors }); return; }
  res.status(201).json(createProduct(res.locals.merchant, parsed.data));
});

v1Router.get('/demand', (_req, res) => {
  res.json(demandFor(res.locals.merchant));
});
