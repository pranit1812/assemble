import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shopRouter } from './routes/shop';
import { merchantRouter } from './routes/merchant';
import { v1Router } from './routes/v1';
import { opsRouter } from './routes/ops';
import { recipesRouter } from './routes/recipes';
import { bridgeRouter } from './routes/bridge';
import { visionRouter, UPLOADS } from './routes/vision';
import { TAGS } from '../shared/tags';
import { z } from 'zod';
import { llmJSON, llmStatus } from './llm';
import { tavily, webStatus } from './agents/web';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_q, s) => { s.json({ ok: true, llm: !!process.env.LLM_API_KEY, web: !!process.env.TAVILY_API_KEY, llmLast: llmStatus, webLast: webStatus }); });
// Fire one tiny model call + one search so /api/health shows real outcomes.
app.post('/api/health/probe', async (_q, s) => {
  const out = await llmJSON({ messages: [{ role: 'system', content: 'Return JSON {"ok": true}.' }, { role: 'user', content: 'ping ' + Date.now() }], schema: z.object({ ok: z.boolean() }), timeoutMs: 12000 });
  const web = await tavily('self-watering plant pot UK', { max: 1 });
  s.json({ llm: !!out, llmLast: llmStatus, web: web.length > 0, webLast: webStatus });
});
app.use('/api/admin', merchantRouter); // owner: Codex
app.get('/api/ops/tags', (_q, s) => { s.json(TAGS); });
app.use('/api/ops/recipes', recipesRouter); // owner: lead
app.use('/api/briefs', bridgeRouter);       // owner: lead
app.use('/api/vision', visionRouter);       // owner: lead (Grok-bot vision)
app.use('/uploads', express.static(UPLOADS));
app.use('/api/ops', opsRouter);        // owner: Cursor
app.use('/v1', v1Router);              // owner: Codex
app.use('/api', shopRouter);           // owner: lead

const dist = join(root, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/(api|v1)\/).*/, (_q, s) => s.sendFile(join(dist, 'index.html')));
}
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`assemble api on :${port}`));
