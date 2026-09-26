// Any OpenAI-compatible chat endpoint (default xAI Grok). Every call:
// JSON mode -> zod validate -> cache. Returns null on no key / timeout / bad JSON,
// and every caller has a deterministic fallback. The demo never waits on the model.
import { createHash } from 'node:crypto';
import type { ZodType } from 'zod';
import { get, run } from './db';

export const hasLLM = () => !!process.env.LLM_API_KEY;

type Msg = { role: 'system' | 'user' | 'assistant'; content: unknown };

export async function llmJSON<T>(o: { messages: Msg[]; schema: ZodType<T>; timeoutMs?: number; vision?: boolean }): Promise<T | null> {
  if (!hasLLM()) return null;
  const model = (o.vision && process.env.LLM_VISION_MODEL) || process.env.LLM_MODEL || 'grok-4-1-fast-non-reasoning';
  const key = createHash('sha1').update(JSON.stringify([model, o.messages])).digest('hex');
  const hit = get<{ value: string }>('SELECT value FROM llm_cache WHERE key = ?', key);
  if (hit) {
    const p = o.schema.safeParse(JSON.parse(hit.value));
    if (p.success) return p.data;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 9000);
  const t0 = Date.now();
  try {
    const res = await fetch(`${process.env.LLM_BASE_URL || 'https://api.x.ai/v1'}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify({ model, messages: o.messages, temperature: 0.3, response_format: { type: 'json_object' } }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn('[llm]', res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data: any = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? '';
    const parsed = o.schema.safeParse(JSON.parse(text.replace(/^```(json)?|```$/gm, '').trim()));
    if (!parsed.success) {
      console.warn('[llm] schema miss', JSON.stringify(parsed.error.issues.slice(0, 3)));
      return null;
    }
    console.log(`[llm] ${model} ok in ${Date.now() - t0}ms`);
    run('INSERT OR REPLACE INTO llm_cache (key, value) VALUES (?, ?)', key, JSON.stringify(parsed.data));
    return parsed.data;
  } catch (e: any) {
    console.warn('[llm] fail', e?.name === 'AbortError' ? 'timeout' : e?.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
