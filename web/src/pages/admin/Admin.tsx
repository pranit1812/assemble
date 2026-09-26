import { useEffect, useState, type FormEvent } from 'react';
import Catalogue from './Catalogue';

export type Merchant = {
  id: string; name: string; kind: string; area: string | null; address: string | null;
  hours: string | null; blurb: string | null; walk_in: boolean; api_key?: string | null;
};
export type Product = {
  id: string; title: string; description: string; price_pence: number;
  tags: string[]; kind: string; stock: number; created_at: string;
};
type Demand = {
  trending: { label: string; count: number; areas: string[] }[];
  unmet: { label: string; count: number; area: string }[];
  spark: { hour: string; count: number }[]; total: number;
};
const passcodeKey = 'assemble.merchant.passcode';
const merchantKey = 'assemble.merchant.id';
const number = new Intl.NumberFormat('en-GB');
const field = 'w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15';
const card = 'rounded-2xl border border-line bg-card';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('X-Admin-Passcode')) headers.set('X-Admin-Passcode', localStorage.getItem(passcodeKey) ?? '');
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api/admin${path}`, { ...options, headers });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? 'Something went wrong. Please try again.');
  return data as T;
}

function Gate({ onUnlock }: { onUnlock: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api<Merchant[]>('/merchants', { headers: { 'X-Admin-Passcode': passcode } });
      localStorage.setItem(passcodeKey, passcode);
      onUnlock();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-paper px-5 py-12">
    <div className="w-full max-w-md">
      <a href="/" className="font-display text-4xl tracking-tight">assemble<span className="text-accent">.</span></a>
      <form onSubmit={submit} className={`${card} mt-10 p-7 shadow-soft sm:p-10`}>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent">For the neighbourhood</p>
        <h1 className="mt-4 font-display text-4xl">A little closer to<br />your next customer.</h1>
        <p className="mt-4 text-sm leading-6 text-muted">See what people nearby are making, and help them find the pieces they need.</p>
        <label htmlFor="passcode" className="mb-2 mt-8 block text-sm font-medium">Merchant passcode</label>
        <input id="passcode" type="password" autoComplete="current-password" required autoFocus value={passcode} onChange={event => setPasscode(event.target.value)} className={field} placeholder="Enter your passcode" aria-describedby={error ? 'gate-error' : undefined} />
        {error && <p id="gate-error" role="alert" className="mt-3 text-sm text-accent">{error}</p>}
        <button disabled={busy} className="mt-5 min-h-12 w-full rounded-xl bg-ink px-5 py-3 text-sm font-medium text-card transition hover:bg-accent disabled:opacity-50">{busy ? 'Opening your portal…' : 'Enter merchant portal →'}</button>
      </form>
      <p className="mt-6 text-center text-xs text-muted">Local shops. More possibilities.</p>
    </div>
  </main>;
}

function Sparkline({ spark }: { spark: Demand['spark'] }) {
  const max = Math.max(1, ...spark.map(point => point.count));
  const points = spark.map((point, index) => `${8 + index * 304 / Math.max(1, spark.length - 1)},${74 - point.count / max * 60}`).join(' ');
  const requests = spark.reduce((sum, point) => sum + point.count, 0);
  return <div className="min-w-0">
    <div className="flex items-center justify-between gap-4 text-xs text-muted"><span>Requests · last 24 hours</span><span className="font-medium text-ink">{number.format(requests)}</span></div>
    <svg viewBox="0 0 320 90" className="mt-4 h-28 w-full overflow-visible text-accent" role="img" aria-label={`${requests} nearby requests in the last 24 hourly buckets`}>
      <title>Nearby demand, hour by hour</title>
      <path d="M8 74H312 M8 44H312 M8 14H312" fill="none" stroke="currentColor" opacity="0.1" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {spark.map((point, index) => <circle key={point.hour} cx={8 + index * 304 / Math.max(1, spark.length - 1)} cy={74 - point.count / max * 60} r={point.count ? 3 : 1.5} fill="currentColor">
        <title>{new Date(point.hour).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}: {point.count} requests</title>
      </circle>)}
    </svg>
    <div className="flex justify-between text-[11px] text-muted"><span>24 hours ago</span><span>Now</span></div>
  </div>;
}

function DemandView({ demand, merchant }: { demand: Demand; merchant: Merchant }) {
  const unmet = demand.unmet.reduce((sum, item) => sum + item.count, 0);
  return <section aria-labelledby="demand-heading">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><p className="mb-2 text-xs font-medium uppercase tracking-[0.17em] text-accent">Your neighbourhood, in view</p><h1 id="demand-heading" className="font-display text-5xl sm:text-6xl">Demand near you</h1></div>
      <p className="text-xs text-muted">Within 3 km · Last 7 days</p>
    </div>
    <div className={`${card} overflow-hidden`}>
      <div className="grid grid-cols-2 gap-5 p-6 sm:gap-8 sm:p-8 lg:grid-cols-[1fr_1fr_1.1fr] lg:gap-10">
        <div><p className="font-display text-6xl leading-none tracking-tight sm:text-8xl">{number.format(demand.total)}</p><p className="mt-3 max-w-56 text-sm leading-6 text-muted">requests near <span className="text-ink">{merchant.area || merchant.name}</span> this week</p></div>
        <div className="border-l border-line pl-5 sm:pl-8"><p className="font-display text-6xl leading-none tracking-tight text-accent sm:text-8xl">{number.format(unmet)}</p><p className="mt-3 max-w-56 text-sm leading-6 text-muted">items people couldn’t find in local stock</p></div>
        <div className="col-span-2 flex flex-col justify-center border-t border-line pt-6 lg:col-span-1 lg:border-t-0 lg:pt-0"><Sparkline spark={demand.spark} /></div>
      </div>
      <div className="grid border-t border-line md:grid-cols-2">
        <div className="p-6 sm:p-8"><div className="flex items-center justify-between gap-3"><h2 className="font-display text-2xl">What’s being made</h2><span className="text-xs text-muted">Requests</span></div>
          {demand.trending.length ? <ul className="mt-4 divide-y divide-line">{demand.trending.slice(0, 5).map(item => <li key={item.label} className="flex gap-4 py-4"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.label}</p><p className="mt-1 text-xs leading-5 text-muted">{item.areas.join(' · ')}</p></div><span className="font-display text-3xl tabular-nums">{number.format(item.count)}</span></li>)}</ul>
            : <p className="mt-5 text-sm leading-6 text-muted">Your neighbourhood is just getting started. Nearby shopper requests will appear here.</p>}
        </div>
        <div className="border-t border-line p-6 sm:p-8 md:border-l md:border-t-0"><div className="flex items-center justify-between gap-3"><h2 className="font-display text-2xl">An opening for your shop</h2><span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] text-accent">Unmet demand</span></div>
          {demand.unmet.length ? <ul className="mt-4 divide-y divide-line">{demand.unmet.slice(0, 5).map(item => <li key={`${item.label}-${item.area}`} className="flex gap-4 py-4"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.label}</p><p className="mt-1 text-xs leading-5 text-muted">{item.area} · no local stock found</p></div><span className="font-display text-3xl tabular-nums text-accent">{number.format(item.count)}</span></li>)}</ul>
            : <p className="mt-5 text-sm leading-6 text-muted">No gaps in local stock reported yet. When someone needs a missing piece, you’ll see it here.</p>}
        </div>
      </div>
    </div>
  </section>;
}

function ShopDetails({ merchant, onUpdate }: { merchant: Merchant; onUpdate: (merchant: Merchant) => void }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function toggle() {
    setSaving(true); setError(''); setMessage('');
    try {
      const updated = await api<Merchant>(`/merchants/${encodeURIComponent(merchant.id)}`, { method: 'PATCH', body: JSON.stringify({ walkIn: !merchant.walk_in }) });
      onUpdate(updated); setMessage(updated.walk_in ? 'Your shop now welcomes walk-ins.' : 'Walk-ins are turned off.');
    } catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  }
  return <aside className={`${card} self-start p-6`}>
    <p className="text-xs uppercase tracking-[0.16em] text-muted">Your shop</p><h2 className="mt-3 break-words font-display text-3xl">{merchant.name}</h2>
    <div className="mt-6 flex items-start gap-4"><div className="flex-1"><p id="walkin-label" className="text-sm font-medium leading-6">Welcome walk-ins</p><p id="walkin-description" className="mt-1 text-xs leading-5 text-muted">No online store needed.</p></div><button type="button" role="switch" aria-checked={merchant.walk_in} aria-labelledby="walkin-label" aria-describedby="walkin-description" disabled={saving} onClick={toggle} className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-50 ${merchant.walk_in ? 'bg-own' : 'bg-line'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-card shadow-sm transition-transform ${merchant.walk_in ? 'left-1 translate-x-5' : 'left-1'}`} /></button></div>
    {message && <p role="status" className="mt-3 text-xs leading-5 text-own">{message}</p>}{error && <p role="alert" className="mt-3 text-xs text-accent">{error}</p>}
    <dl className="mt-6 space-y-5 border-t border-line pt-6 text-sm"><div><dt className="text-xs text-muted">Find us</dt><dd className="mt-1.5 whitespace-pre-line leading-6">{merchant.address || 'Address not added yet'}{merchant.area && <span className="block text-muted">{merchant.area}</span>}</dd></div><div><dt className="text-xs text-muted">Opening hours</dt><dd className="mt-1.5 whitespace-pre-line leading-6">{merchant.hours || 'Contact the shop for opening hours'}</dd></div></dl>
    <p className="mt-6 border-t border-line pt-5 text-xs leading-5 text-muted">Every piece in your catalogue is another possibility for someone nearby.</p>
  </aside>;
}

function CopyBlock({ label, text, secret = false }: { label: string; text: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setError(false); }
    catch { setError(true); }
  }
  return <div className="min-w-0"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-medium">{label}</h3><button type="button" onClick={copy} className="rounded-lg border border-line px-3 py-2 text-xs transition hover:border-accent hover:text-accent">{copied ? 'Copied ✓' : 'Copy'}</button></div>
    <pre tabIndex={0} className={`overflow-x-auto rounded-xl border border-line bg-paper p-4 font-mono text-xs leading-6 ${secret ? 'break-all whitespace-pre-wrap' : ''}`}><code>{text}</code></pre>
    <span role="status" className="sr-only">{copied ? `${label} copied` : ''}</span>{error && <p role="alert" className="mt-2 text-xs text-accent">Copy isn’t available here. Select and copy the text above.</p>}
  </div>;
}

function ApiPanel({ merchant }: { merchant: Merchant }) {
  const key = merchant.api_key;
  const shellQuote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const origin = window.location.origin;
  const catalog = [`curl -X POST ${shellQuote(`${origin}/v1/catalog`)} \\`, `  -H ${shellQuote(`Authorization: Bearer ${key}`)} \\`, "  -H 'Content-Type: application/json' \\", `  -d '${JSON.stringify({ title: 'Red satin cape', price: 18.5, tags: ['cape', 'red', 'satin'], kind: 'part', stock: 8 })}'`].join('\n');
  const demand = [`curl ${shellQuote(`${origin}/v1/demand`)} \\`, `  -H ${shellQuote(`Authorization: Bearer ${key}`)}`].join('\n');
  return <section aria-labelledby="api-heading"><p className="mb-2 text-xs font-medium uppercase tracking-[0.17em] text-accent">A small connection. More possibilities.</p><h1 id="api-heading" className="font-display text-5xl">Your shop, connected.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-muted">Publish your catalogue from the tools you already use, and see what people nearby are looking for.</p>
    <div className={`${card} mt-8 space-y-8 p-6 sm:p-8`}>
      {key ? <><CopyBlock label="Your API key" text={key} secret /><p className="!mt-3 text-xs leading-5 text-muted">This key belongs to {merchant.name}. Keep it private; it allows products to be added to your catalogue.</p><CopyBlock label="Add a product · POST /v1/catalog" text={catalog} /><p className="!mt-3 text-xs leading-5 text-muted">Use price in pounds, or pricePence as an integer. Tags use the same vocabulary as your catalogue. Products with stock are available to the next search.</p><CopyBlock label="Read nearby demand · GET /v1/demand" text={demand} /></>
        : <p className="text-sm leading-6 text-muted">This merchant doesn’t have an API key yet. You can still add products from the Overview tab.</p>}
    </div>
  </section>;
}

type Brief = {
  id: string; goalId: string | null; goal: string | null; part: string; tag: string;
  area: string | null; distanceKm: number | null; createdAt: string;
};

function since(createdAt: string) {
  const then = Date.parse(createdAt.includes('T') ? createdAt : `${createdAt.replace(' ', 'T')}Z`);
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (!Number.isFinite(mins) || mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function BriefRow({ brief, merchantId, onSent }: { brief: Brief; merchantId: string; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(brief.part);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!/^\d+(\.\d{1,2})?$/.test(price) || Number(price) <= 0) { setError('Enter a price in pounds.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/briefs/${encodeURIComponent(brief.id)}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Passcode': localStorage.getItem(passcodeKey) || 'fleek' },
        body: JSON.stringify({ merchantId, title: title.trim(), price: Number(price), note: note.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (response.status !== 201) throw new Error(data?.error ?? 'The offer could not be sent.');
      onSent();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  const where = [
    `Someone near ${brief.area || 'you'} is making a ${brief.goal || 'something'}`,
    since(brief.createdAt),
    ...(brief.distanceKm == null ? [] : [`${brief.distanceKm} km away`]),
  ].join(' · ');
  return <li className="p-5 sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="break-words font-display text-3xl leading-none">{brief.part}</p>
        <p className="mt-2 text-sm leading-6 text-muted">{where}</p>
      </div>
      <button type="button" aria-expanded={open} aria-controls={`offer-${brief.id}`} onClick={() => { setOpen(value => !value); setError(''); }} className="min-h-11 shrink-0 rounded-xl border border-line bg-paper px-4 py-3 text-sm font-medium transition hover:border-accent hover:text-accent sm:mt-1">{open ? 'Close' : 'Answer with an offer'}</button>
    </div>
    {open && <form id={`offer-${brief.id}`} onSubmit={submit} className="mt-5 space-y-4 rounded-xl border border-line bg-paper p-4">
      <label className="block text-xs font-medium" htmlFor={`offer-title-${brief.id}`}>Title<input id={`offer-title-${brief.id}`} required maxLength={80} value={title} onChange={event => setTitle(event.target.value)} className={`${field} mt-2`} /></label>
      <label className="block text-xs font-medium" htmlFor={`offer-price-${brief.id}`}>Price (£)<input id={`offer-price-${brief.id}`} type="number" inputMode="decimal" min="0.01" step="0.01" required value={price} onChange={event => setPrice(event.target.value)} className={`${field} mt-2`} placeholder="8.00" /></label>
      <label className="block text-xs font-medium" htmlFor={`offer-note-${brief.id}`}>Note <span className="font-normal text-muted">(optional)</span><input id={`offer-note-${brief.id}`} maxLength={240} value={note} onChange={event => setNote(event.target.value)} className={`${field} mt-2`} placeholder="Two in stock, pop in today" /></label>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <button disabled={busy} className="min-h-11 w-full rounded-xl bg-ink px-4 py-3 text-sm font-medium text-card transition hover:bg-accent disabled:opacity-50">{busy ? 'Sending…' : 'Send offer'}</button>
    </form>}
  </li>;
}

function OpenBriefs({ merchantId }: { merchantId: string }) {
  const [briefs, setBriefs] = useState<Brief[] | null>(null);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    let latest = 0;
    async function load() {
      const mine = ++latest;
      try {
        const response = await fetch(`/api/briefs?merchantId=${encodeURIComponent(merchantId)}`);
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? 'Open briefs could not be loaded.');
        if (active && mine === latest) { setBriefs(data); setError(''); }
      } catch (error) { if (active && mine === latest) setError((error as Error).message); }
    }
    void load();
    const timer = window.setInterval(load, 4_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [merchantId, reload]);
  return <section aria-labelledby="briefs-heading" className="mb-10">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><p className="mb-2 text-xs font-medium uppercase tracking-[0.17em] text-accent">A shopper is waiting</p><h2 id="briefs-heading" className="font-display text-4xl sm:text-5xl">Open briefs near you</h2></div>
      <p className="text-xs text-muted">Within 5 km</p>
    </div>
    {sent && <p role="status" className="mb-4 rounded-xl bg-own/10 p-4 text-sm text-own">{sent}</p>}
    {error && <p role="alert" className="mb-4 rounded-xl bg-accent-soft p-4 text-sm text-accent">{error}</p>}
    <div className={`${card} overflow-hidden`}>
      {briefs == null ? <p role="status" className="p-6 text-sm text-muted sm:p-8">{error ? 'Open briefs could not be loaded.' : 'Looking for open briefs…'}</p>
        : briefs.length ? <ul className="divide-y divide-line">{briefs.map(brief => <BriefRow key={brief.id} brief={brief} merchantId={merchantId} onSent={() => { setSent("Sent. It's on their screen now."); setReload(value => value + 1); }} />)}</ul>
          : <p className="p-6 text-sm leading-6 text-muted sm:p-8">No open briefs near you right now. We'll show them here the moment a shopper needs something you might stock.</p>}
    </div>
  </section>;
}

function Workspace({ initialMerchant }: { initialMerchant: Merchant }) {
  const [merchant, setMerchant] = useState(initialMerchant);
  const [demand, setDemand] = useState<Demand | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState<'overview' | 'api'>('overview');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const query = `?merchantId=${encodeURIComponent(initialMerchant.id)}`;
    async function load() {
      try {
        const [nextDemand, nextProducts, merchants] = await Promise.all([
          api<Demand>(`/demand${query}`, { signal: controller.signal }), api<Product[]>(`/products${query}`, { signal: controller.signal }), api<Merchant[]>(`/merchants${query}`, { signal: controller.signal }),
        ]);
        if (!active) return;
        setDemand(nextDemand); setProducts(nextProducts);
        const selected = merchants.find(item => item.id === initialMerchant.id);
        if (selected) setMerchant(selected);
        setError('');
      } catch (error) { if (active) setError((error as Error).message); }
    }
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [initialMerchant.id, refresh]);
  return <>
    <nav className="mb-10 flex gap-7 border-b border-line" aria-label="Merchant sections">{(['overview', 'api'] as const).map(item => <button key={item} type="button" aria-current={tab === item ? 'page' : undefined} onClick={() => setTab(item)} className={`border-b-2 px-1 pb-4 text-sm transition ${tab === item ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{item === 'overview' ? 'Overview' : 'API access'}</button>)}<span className="ml-auto hidden self-start pt-1 text-xs text-muted sm:block">Updates every 30 seconds</span></nav>
    {error && <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent-soft p-4 text-sm text-accent"><span>{error}</span><button onClick={() => setRefresh(value => value + 1)} className="font-medium underline">Try again</button></div>}
    {tab === 'overview' && <OpenBriefs merchantId={merchant.id} />}
    {!demand ? <p role="status" className="py-16 text-center text-sm text-muted">{error ? 'Your shop could not be loaded.' : 'Looking around your neighbourhood…'}</p> : tab === 'api' ? <ApiPanel key={merchant.id} merchant={merchant} /> : <>
      <DemandView demand={demand} merchant={merchant} />
      <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><Catalogue merchantId={merchant.id} searchable={merchant.kind !== 'local' || merchant.walk_in} products={products} onAdd={product => setProducts(previous => [product, ...previous.filter(item => item.id !== product.id)])} /><ShopDetails merchant={merchant} onUpdate={setMerchant} /></div>
    </>}
  </>;
}

export default function Admin() {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(passcodeKey) === 'fleek');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selected, setSelected] = useState(() => localStorage.getItem(merchantKey) ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!unlocked) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    const load = () => api<Merchant[]>('/merchants', { signal: controller.signal }).then(items => {
      if (!active) return;
      setMerchants(items); setError('');
      setSelected(previous => items.some(item => item.id === previous) ? previous : (items[0]?.id ?? ''));
    }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [unlocked, refresh]);
  async function signOut() {
    try {
      await api('/session', { method: 'DELETE' });
      localStorage.removeItem(passcodeKey); setUnlocked(false); setMerchants([]);
    } catch (error) { setError((error as Error).message); }
  }
  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />;
  const merchant = merchants.find(item => item.id === selected);
  return <div className="min-h-screen bg-paper pb-10">
    <header className="border-b border-line"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-6 sm:px-8"><a href="/" className="font-display text-4xl tracking-tight">assemble<span className="text-accent">.</span><span className="ml-3 align-middle font-sans text-[10px] uppercase tracking-[0.15em] text-muted">For merchants</span></a><button type="button" onClick={signOut} className="rounded-lg px-2 py-2 text-xs text-muted hover:text-ink">Sign out</button></div></header>
    <main className="mx-auto max-w-6xl px-5 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 py-6"><label htmlFor="merchant" className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-xs text-muted"><span className="shrink-0">Signed in as</span><select id="merchant" aria-label="Signed in as" value={selected} disabled={!merchants.length} onChange={event => { setSelected(event.target.value); localStorage.setItem(merchantKey, event.target.value); }} className="max-w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm font-medium text-ink outline-none focus:border-accent">{!merchants.length && <option value="">{loading ? 'Loading merchants…' : 'No merchants yet'}</option>}{merchants.map(item => <option key={item.id} value={item.id}>{item.name}{item.area ? ` · ${item.area}` : ''}</option>)}</select></label><button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading} className="rounded-lg px-2 py-2 text-xs text-muted hover:text-ink disabled:opacity-40">Refresh shops ↻</button></div>
      {error && <p role="alert" className="mb-5 rounded-xl bg-accent-soft p-4 text-sm text-accent">{error}</p>}
      {merchant ? <Workspace key={merchant.id} initialMerchant={merchant} /> : <div className={`${card} my-8 p-10 text-center`}><h1 className="font-display text-3xl">{loading ? 'Opening your shop…' : 'Your neighbourhood is taking shape.'}</h1><p className="mt-3 text-sm text-muted">{loading ? 'Just a moment.' : 'Refresh shops when merchant data has arrived.'}</p></div>}
      <footer className="mt-12 flex flex-wrap justify-between gap-2 border-t border-line pt-5 text-xs text-muted"><span>Small shops. Big possibilities.</span><span>Assemble · Merchant portal</span></footer>
    </main>
  </div>;
}
