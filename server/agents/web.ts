// Web scout: when no shop on Assemble stocks a part, find public listings with Tavily.
// Results are shown as plain links (no affiliate tags) and never ranked above local routes.
import { createHash } from 'node:crypto';
import { get, run } from '../db';
import type { WebLink } from '../../shared/genui';

const SHOPS = ['amazon.co.uk', 'ebay.co.uk', 'argos.co.uk', 'etsy.com', 'johnlewis.com', 'hobbycraft.co.uk', 'thepihut.com', 'ikea.com', 'screwfix.com', 'diy.com'];
export const hasWeb = () => !!process.env.TAVILY_API_KEY;
export const webStatus: { at?: string; ok?: boolean; detail?: string } = {};

export type WebResult = { title: string; url: string; content: string };

export async function tavily(query: string, opts: { domains?: string[]; max?: number; timeoutMs?: number } = {}): Promise<WebResult[]> {
  if (!hasWeb()) return [];
  const key = 'tavily:' + createHash('sha1').update(JSON.stringify([query, opts.domains ?? null])).digest('hex');
  const hit = get<{ value: string }>('SELECT value FROM llm_cache WHERE key = ?', key);
  if (hit) return JSON.parse(hit.value);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 6000);
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
      body: JSON.stringify({ query, max_results: opts.max ?? 5, search_depth: 'basic', include_domains: opts.domains, country: 'united kingdom' }),
      signal: ctrl.signal,
    });
    if (!res.ok) { const b = (await res.text()).slice(0, 200); console.warn('[tavily]', res.status, b); Object.assign(webStatus, { at: new Date().toISOString(), ok: false, detail: `${res.status} ${b}` }); return []; }
    Object.assign(webStatus, { at: new Date().toISOString(), ok: true, detail: 'ok' });
    const data: any = await res.json();
    const out: WebResult[] = (data.results ?? []).map((r: any) => ({ title: String(r.title ?? ''), url: String(r.url ?? ''), content: String(r.content ?? '').slice(0, 600) }));
    run('INSERT OR REPLACE INTO llm_cache (key, value) VALUES (?, ?)', key, JSON.stringify(out));
    return out;
  } catch (e: any) {
    console.warn('[tavily] fail', e?.name === 'AbortError' ? 'timeout' : e?.message);
    return [];
  } finally { clearTimeout(t); }
}

const price = (s: string) => { const m = s.match(/£\s?(\d{1,4}(?:\.\d{2})?)/); return m ? Math.round(parseFloat(m[1]) * 100) : undefined; };

export async function webScout(part: string, goal: string): Promise<WebLink[]> {
  const rs = await tavily(`buy ${part} ${goal} UK price`, { domains: SHOPS, max: 8 });
  const seen = new Set<string>();
  return rs
    .map((r) => { const domain = new URL(r.url).hostname.replace(/^www\./, ''); return { title: r.title.replace(/\s*[|:-]\s*(Amazon|eBay|Argos|Etsy).*$/i, '').slice(0, 90), url: r.url, domain, pricePence: price(`${r.title} ${r.content}`) }; })
    .filter((l) => (seen.has(l.domain) ? false : (seen.add(l.domain), true)))
    .sort((a, b) => Number(!!b.pricePence) - Number(!!a.pricePence))
    .slice(0, 3);
}
