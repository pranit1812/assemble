// Any OpenAI-compatible chat endpoint (default xAI Grok). Every call:
// JSON mode -> zod validate -> cache. Returns null on no key / timeout / bad JSON,
// and every caller has a deterministic fallback. The demo never waits on the model.
import { createHash } from 'node:crypto';
import type { ZodType } from 'zod';
import { get, run } from './db';

export const hasLLM = () => !!process.env.LLM_API_KEY;
// Last outcome, surfaced on /api/health for remote debugging (never includes the key).
export const llmStatus: { at?: string; ok?: boolean; model?: string; host?: string; detail?: string } = {};
const note = (ok: boolean, model: string, detail: string) =>
  Object.assign(llmStatus, { at: new Date().toISOString(), ok, model, host: new URL(process.env.LLM_BASE_URL || 'https://api.x.ai/v1').host, detail: detail.slice(0, 300) });

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
  // Slower, smarter models (e.g. Grok via OpenRouter) can be given more time with LLM_TIMEOUT_MS.
  const timer = setTimeout(() => ctrl.abort(), Math.max(o.timeoutMs ?? 9000, Number(process.env.LLM_TIMEOUT_MS) || 0));
  const t0 = Date.now();
  try {
    const res = await fetch(`${process.env.LLM_BASE_URL || 'https://api.x.ai/v1'}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LLM_API_KEY}` },
      // max_tokens keeps OpenRouter from reserving a huge reply; LLM_REASONING (low/medium/high) is OpenRouter-only.
      body: JSON.stringify({ model, messages: o.messages, temperature: 0.3, max_tokens: 1500, response_format: { type: 'json_object' },
        ...(process.env.LLM_REASONING ? { reasoning: { effort: process.env.LLM_REASONING } } : {}) }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      console.warn('[llm]', res.status, body);
      note(false, model, `${res.status} ${body}`);
      return null;
    }
    const data: any = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? '';
    const parsed = o.schema.safeParse(JSON.parse(text.replace(/^```(json)?|```$/gm, '').trim()));
    if (!parsed.success) {
      console.warn('[llm] schema miss', JSON.stringify(parsed.error.issues.slice(0, 3)));
      note(false, model, `schema miss: ${JSON.stringify(parsed.error.issues.slice(0, 2))} | raw: ${text.slice(0, 120)}`);
      return null;
    }
    console.log(`[llm] ${model} ok in ${Date.now() - t0}ms`);
    note(true, model, `ok in ${Date.now() - t0}ms`);
    run('INSERT OR REPLACE INTO llm_cache (key, value) VALUES (?, ?)', key, JSON.stringify(parsed.data));
    return parsed.data;
  } catch (e: any) {
    console.warn('[llm] fail', e?.name === 'AbortError' ? 'timeout' : e?.message);
    note(false, model, e?.name === 'AbortError' ? 'timeout' : String(e?.message));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Honest label for the task board: say which model actually answered.
export const aiName = () => /grok/i.test(process.env.LLM_MODEL || 'grok') ? 'Grok' : (process.env.LLM_MODEL || '').split('/').pop()!;
