// Web scout: when no shop on Assemble stocks a part, find public listings with Tavily.
// Results are shown as plain links (no affiliate tags) and never ranked above local routes.
import { createHash } from 'node:crypto';
import { get, run } from '../db';
import type { WebLink } from '../../shared/genui';

// Core shops first (proven results); the wider list only fills in when core finds fewer than 2.
const SHOPS = ['amazon.co.uk', 'ebay.co.uk', 'argos.co.uk', 'etsy.com', 'johnlewis.com', 'hobbycraft.co.uk', 'thepihut.com', 'ikea.com', 'screwfix.com', 'diy.com'];
const MORE_SHOPS = ['temu.com', 'aliexpress.com', 'currys.co.uk', 'ao.com', 'espares.co.uk', 'wayfair.co.uk', 'dunelm.com', 'wickes.co.uk', 'toolstation.com',
  'boots.com', 'halfords.com', 'decathlon.co.uk', 'very.co.uk', 'next.co.uk', 'backmarket.co.uk'];
export const hasWeb = () => !!process.env.TAVILY_API_KEY;
export const webStatus: { at?: string; ok?: boolean; detail?: string } = {};

export type WebResult = { title: string; url: string; content: string; score?: number };

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
    const out: WebResult[] = (data.results ?? []).map((r: any) => ({ title: String(r.title ?? ''), url: String(r.url ?? ''), content: String(r.content ?? '').slice(0, 600), score: typeof r.score === 'number' ? r.score : undefined }));
    run('INSERT OR REPLACE INTO llm_cache (key, value) VALUES (?, ?)', key, JSON.stringify(out));
    return out;
  } catch (e: any) {
    console.warn('[tavily] fail', e?.name === 'AbortError' ? 'timeout' : e?.message);
    return [];
  } finally { clearTimeout(t); }
}

const priceIn = (s: string) => { const m = s.match(/£\s?(\d{1,3}(?:\.\d{2})?)(?!\d)/); return m ? Math.round(parseFloat(m[1]) * 100) : undefined; };
const WORDS = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !['the', 'and', 'for', 'with'].includes(w));

// Public listings for one part. Search by the part itself (e.g. "red cape"), keep only listings that
// mention it, and trust a price only from the title or a plausible one in the snippet.
export async function webScout(part: string, tag: string, context = ''): Promise<WebLink[]> {
  const q = `${part}${part.toLowerCase().includes(tag.replace('-', ' ')) ? '' : ` ${tag.replace('-', ' ')}`}${context ? ` ${context}` : ''} buy UK`;
  const need = [...new Set([...WORDS(tag.replace('-', ' ')), ...WORDS(part)])];
  const relevant = (title: string) => { const t = title.toLowerCase(); return need.some((w) => t.includes(w.replace(/s$/, ''))); };
  let rs = await tavily(q, { domains: SHOPS, max: 8 });
  if (rs.filter((r) => relevant(r.title)).length < 2) rs = [...rs, ...(await tavily(q, { domains: MORE_SHOPS, max: 8 }))];
  const seen = new Set<string>();
  return rs
    .filter((r) => relevant(r.title))
    .map((r) => {
      const domain = new URL(r.url).hostname.replace(/^www\./, '');
      const fromTitle = priceIn(r.title);
      const fromText = priceIn(r.content);
      const pricePence = fromTitle ?? (fromText && fromText <= 15000 ? fromText : undefined);
      // Match: half Tavily's relevance score, half how many of the part's words the listing title contains.
      const t = r.title.toLowerCase();
      const words = need.filter((w) => t.includes(w.replace(/s$/, ''))).length / Math.max(1, need.length);
      const match = Math.round(100 * (0.5 * Math.min(1, r.score ?? 0.5) + 0.5 * words));
      return { match, title: r.title.replace(/\s*[|:–-]\s*(Amazon|eBay|Argos|Etsy|John Lewis|IKEA|Screwfix|B&Q|Hobbycraft)[^|]*$/i, '').replace(/^Amazon\.co\.uk\s*:\s*/i, '').slice(0, 90), url: r.url, domain, pricePence };
    })
    .sort((a, b) => b.match - a.match)
    .filter((l) => (seen.has(l.domain) ? false : (seen.add(l.domain), true)))
    .sort((a, b) => b.match - a.match)
    .slice(0, 3);
}
