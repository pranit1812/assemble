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
const field = 'w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-ink/40';

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

function Header({ onSignOut }: { onSignOut: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
        <a href="/" className="flex shrink-0 items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-accent" />
          <span className="font-display text-[26px] leading-none text-ink">Assemble</span>
        </a>
        <button type="button" onClick={onSignOut} className="text-sm text-muted transition hover:text-ink">Sign out</button>
      </div>
    </header>
  );
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
  return <main className="flex min-h-[100svh] flex-col items-center justify-center px-4 py-16">
    <a href="/" className="mb-10 flex items-center gap-2">
      <span className="h-3 w-3 rounded-full bg-accent" />
      <span className="font-display text-[26px] leading-none text-ink">Assemble</span>
    </a>
    <div className="w-full max-w-md text-center">
      <h1 className="font-display text-[38px] leading-[1.06] text-ink sm:text-[56px]">A little closer to<br />your next customer.</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">See what people nearby are making, and help them find the pieces they need.</p>
    </div>
    <form onSubmit={submit} className="mt-10 w-full max-w-sm">
      <label htmlFor="passcode" className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted">Merchant passcode</label>
      <input id="passcode" type="password" autoComplete="current-password" required autoFocus value={passcode} onChange={event => setPasscode(event.target.value)} className={`${field} mt-2`} placeholder="Enter your passcode" aria-describedby={error ? 'gate-error' : undefined} />
      {error && <p id="gate-error" role="alert" className="mt-3 text-sm text-accent">{error}</p>}
      <button disabled={busy} className="mt-6 w-full rounded-full bg-ink py-3 text-[15px] font-medium text-paper transition hover:bg-accent disabled:opacity-50">{busy ? 'Opening your portal…' : 'Enter merchant portal'}</button>
    </form>
  </main>;
}

function DemandView({ demand, merchant }: { demand: Demand; merchant: Merchant }) {
  return <section aria-labelledby="demand-heading" className="mt-20">
    <h2 id="demand-heading" className="font-display text-3xl text-ink">Demand near you</h2>
    <p className="mt-2 text-sm text-muted">Within 3 km · last 7 days · {merchant.area || merchant.name}</p>
    <div className="mt-10">
      <h3 className="font-display text-2xl text-ink">What’s being made</h3>
      {demand.trending.length ? <ul className="mt-4 divide-y divide-line border-y border-line">{demand.trending.slice(0, 5).map(item => <li key={item.label} className="flex items-baseline justify-between gap-4 py-4"><div className="min-w-0"><p className="break-words text-[15px] text-ink">{item.label}</p><p className="mt-1 break-words text-sm text-muted">{item.areas.join(' · ')}</p></div><span className="shrink-0 font-mono text-sm text-muted">{number.format(item.count)}</span></li>)}</ul>
        : <p className="mt-4 text-sm leading-relaxed text-muted">Your neighbourhood is just getting started. Nearby shopper requests will appear here.</p>}
    </div>
    <div className="mt-12">
      <h3 className="font-display text-2xl text-ink">An opening for your shop</h3>
      {demand.unmet.length ? <ul className="mt-4 divide-y divide-line border-y border-line">{demand.unmet.slice(0, 5).map(item => <li key={`${item.label}-${item.area}`} className="flex items-baseline justify-between gap-4 py-4"><div className="min-w-0"><p className="break-words text-[15px] text-ink">{item.label}</p><p className="mt-1 break-words text-sm text-muted">{item.area} · no local stock found</p></div><span className="shrink-0 font-mono text-sm text-muted">{number.format(item.count)}</span></li>)}</ul>
        : <p className="mt-4 text-sm leading-relaxed text-muted">No gaps in local stock reported yet. When someone needs a missing piece, you’ll see it here.</p>}
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
  return <section className="mt-20">
    <h2 className="break-words font-display text-3xl text-ink">{merchant.name}</h2>
    <div className="mt-8 flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <p id="walkin-label" className="text-[15px] text-ink">Welcome walk-ins</p>
        <p id="walkin-description" className="mt-1 text-sm text-muted">No online store needed.</p>
      </div>
      <button type="button" role="switch" aria-checked={merchant.walk_in} aria-labelledby="walkin-label" aria-describedby="walkin-description" disabled={saving} onClick={toggle} className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-50 ${merchant.walk_in ? 'bg-own' : 'bg-line'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-card transition-transform ${merchant.walk_in ? 'left-1 translate-x-5' : 'left-1'}`} /></button>
    </div>
    {message && <p role="status" className="mt-4 text-sm text-own">{message}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-accent">{error}</p>}
    <dl className="mt-8 space-y-6 border-t border-line pt-8 text-[15px]">
      <div><dt className="text-sm text-muted">Find us</dt><dd className="mt-1 whitespace-pre-line leading-relaxed">{merchant.address || 'Address not added yet'}{merchant.area && <span className="block text-muted">{merchant.area}</span>}</dd></div>
      <div><dt className="text-sm text-muted">Opening hours</dt><dd className="mt-1 whitespace-pre-line leading-relaxed">{merchant.hours || 'Contact the shop for opening hours'}</dd></div>
    </dl>
  </section>;
}

function CopyBlock({ label, text }: { label: string; text: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setError(false); }
    catch { setError(true); }
  }
  return <div className="min-w-0">
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="min-w-0 break-words text-sm text-ink">{label}</h3>
      <button type="button" onClick={copy} className="shrink-0 text-sm text-muted transition hover:text-ink">{copied ? 'Copied' : 'Copy'}</button>
    </div>
    <pre tabIndex={0} className="overflow-x-hidden whitespace-pre-wrap break-all rounded-xl border border-line bg-card p-4 font-mono text-xs leading-6 text-ink"><code>{text}</code></pre>
    <span role="status" className="sr-only">{copied ? `${label} copied` : ''}</span>
    {error && <p role="alert" className="mt-2 text-sm text-accent">Copy isn’t available here. Select and copy the text above.</p>}
  </div>;
}

function ApiPanel({ merchant }: { merchant: Merchant }) {
  const key = merchant.api_key;
  const shellQuote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const origin = window.location.origin;
  const catalog = [`curl -X POST ${shellQuote(`${origin}/v1/catalog`)} \\`, `  -H ${shellQuote(`Authorization: Bearer ${key}`)} \\`, "  -H 'Content-Type: application/json' \\", `  -d '${JSON.stringify({ title: 'Red satin cape', price: 18.5, tags: ['cape', 'red', 'satin'], kind: 'part', stock: 8 })}'`].join('\n');
  const demand = [`curl ${shellQuote(`${origin}/v1/demand`)} \\`, `  -H ${shellQuote(`Authorization: Bearer ${key}`)}`].join('\n');
  return <section aria-labelledby="api-heading">
    <h1 id="api-heading" className="font-display text-[38px] leading-[1.06] text-ink sm:text-[56px]">Your shop, connected.</h1>
    <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">Publish your catalogue from the tools you already use, and see what people nearby are looking for.</p>
    <div className="mt-12 space-y-12">
      {key ? <>
        <CopyBlock label="Your API key" text={key} secret />
        <p className="!mt-3 text-sm leading-relaxed text-muted">This key belongs to {merchant.name}. Keep it private; it allows products to be added to your catalogue.</p>
        <CopyBlock label="Add a product · POST /v1/catalog" text={catalog} />
        <p className="!mt-3 text-sm leading-relaxed text-muted">Use price in pounds, or pricePence as an integer. Tags use the same vocabulary as your catalogue. Products with stock are available to the next search.</p>
        <CopyBlock label="Read nearby demand · GET /v1/demand" text={demand} />
      </> : <p className="text-sm leading-relaxed text-muted">This merchant doesn’t have an API key yet. You can still add products from the Overview tab.</p>}
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
  return <li className="py-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="break-words font-display text-2xl leading-tight text-ink sm:text-3xl">{brief.part}</p>
        <p className="mt-2 break-words text-sm leading-relaxed text-muted">{where}</p>
      </div>
      <button type="button" aria-expanded={open} aria-controls={`offer-${brief.id}`} onClick={() => { setOpen(value => !value); setError(''); }} className={open ? 'self-start text-sm text-muted transition hover:text-ink' : 'self-start rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-ink'}>{open ? 'Close' : 'Answer with an offer'}</button>
    </div>
    {open && <form id={`offer-${brief.id}`} onSubmit={submit} className="mt-6 max-w-lg space-y-5 border-t border-line pt-6">
      <label className="block text-[12px] font-medium uppercase tracking-[0.12em] text-muted" htmlFor={`offer-title-${brief.id}`}>Title<input id={`offer-title-${brief.id}`} required maxLength={80} value={title} onChange={event => setTitle(event.target.value)} className={`${field} mt-2`} /></label>
      <label className="block text-[12px] font-medium uppercase tracking-[0.12em] text-muted" htmlFor={`offer-price-${brief.id}`}>Price (£)<input id={`offer-price-${brief.id}`} type="number" inputMode="decimal" min="0.01" step="0.01" required value={price} onChange={event => setPrice(event.target.value)} className={`${field} mt-2`} placeholder="8.00" /></label>
      <label className="block text-[12px] font-medium uppercase tracking-[0.12em] text-muted" htmlFor={`offer-note-${brief.id}`}>Note <span className="font-normal normal-case tracking-normal text-faint">(optional)</span><input id={`offer-note-${brief.id}`} maxLength={240} value={note} onChange={event => setNote(event.target.value)} className={`${field} mt-2`} placeholder="Two in stock, pop in today" /></label>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <button disabled={busy} className="w-full rounded-full bg-ink py-3 text-[15px] font-medium text-paper transition hover:bg-accent disabled:opacity-50">{busy ? 'Sending…' : 'Send offer'}</button>
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
  return <section aria-labelledby="briefs-heading">
    <h1 id="briefs-heading" className="font-display text-[38px] leading-[1.06] text-ink sm:text-[56px]">Open briefs near you</h1>
    <p className="mt-3 text-sm text-muted">Within 5 km</p>
    {sent && <p role="status" className="mt-6 text-sm text-own">{sent}</p>}
    {error && <p role="alert" className="mt-6 text-sm text-accent">{error}</p>}
    <div className="mt-10">
      {briefs == null ? <p role="status" className="text-sm text-muted">{error ? 'Open briefs could not be loaded.' : 'Looking for open briefs…'}</p>
        : briefs.length ? <ul className="divide-y divide-line border-y border-line">{briefs.map(brief => <BriefRow key={brief.id} brief={brief} merchantId={merchantId} onSent={() => { setSent("Sent. It's on their screen now."); setReload(value => value + 1); }} />)}</ul>
          : <p className="text-sm leading-relaxed text-muted">No open briefs near you right now. We'll show them here the moment a shopper needs something you might stock.</p>}
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
    <nav className="mb-14 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Merchant sections">{(['overview', 'api'] as const).map(item => <button key={item} type="button" aria-current={tab === item ? 'page' : undefined} onClick={() => setTab(item)} className={`transition ${tab === item ? 'text-ink' : 'text-muted hover:text-ink'}`}>{item === 'overview' ? 'Overview' : 'API access'}</button>)}</nav>
    {error && <div role="alert" className="mb-8 flex flex-wrap items-center gap-3 text-sm text-accent"><span>{error}</span><button onClick={() => setRefresh(value => value + 1)} className="underline">Try again</button></div>}
    {tab === 'overview' && <OpenBriefs merchantId={merchant.id} />}
    {!demand ? <p role="status" className="py-16 text-sm text-muted">{error ? 'Your shop could not be loaded.' : 'Looking around your neighbourhood…'}</p> : tab === 'api' ? <ApiPanel key={merchant.id} merchant={merchant} /> : <>
      <DemandView demand={demand} merchant={merchant} />
      <Catalogue merchantId={merchant.id} searchable={merchant.kind !== 'local' || merchant.walk_in} products={products} onAdd={product => setProducts(previous => [product, ...previous.filter(item => item.id !== product.id)])} />
      <ShopDetails merchant={merchant} onUpdate={setMerchant} />
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
  return <div className="min-h-screen">
    <Header onSignOut={signOut} />
    <main className="mx-auto min-w-0 max-w-3xl px-4 pb-24 pt-12 sm:px-6">
      <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
        <label htmlFor="merchant" className="block min-w-0 flex-1">
          <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted">Shop</span>
          <select id="merchant" aria-label="Signed in as" value={selected} disabled={!merchants.length} onChange={event => { setSelected(event.target.value); localStorage.setItem(merchantKey, event.target.value); }} className={`${field} mt-2 max-w-full`}>{!merchants.length && <option value="">{loading ? 'Loading merchants…' : 'No merchants yet'}</option>}{merchants.map(item => <option key={item.id} value={item.id}>{item.name}{item.area ? ` · ${item.area}` : ''}</option>)}</select>
        </label>
        <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading} className="text-sm text-muted transition hover:text-ink disabled:opacity-40">Refresh</button>
      </div>
      {error && <p role="alert" className="mb-8 text-sm text-accent">{error}</p>}
      {merchant ? <Workspace key={merchant.id} initialMerchant={merchant} /> : <div className="py-16"><h1 className="font-display text-3xl text-ink">{loading ? 'Opening your shop…' : 'Your neighbourhood is taking shape.'}</h1><p className="mt-3 text-sm text-muted">{loading ? 'Just a moment.' : 'Refresh shops when merchant data has arrived.'}</p></div>}
    </main>
  </div>;
}
