import { useEffect, useState } from 'react';
import { pounds } from '@shared/genui';
import type { Area } from '@shared/areas';
import { LocationPicker, loadArea } from '../components/map/LocationPicker';

type Wanted = { area: string; unmet: { label: string; count: number }[]; goals: { label: string; count: number }[] };
const CONDITIONS = ['like new', 'good', 'worn'];

export default function Sell() {
  const [area, setArea] = useState<Area>(loadArea);
  const [wanted, setWanted] = useState<Wanted | null>(null);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('good');
  const [seller, setSeller] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ title: string; tags: string[]; area: string; price: number } | null>(null);

  useEffect(() => { fetch(`/api/wanted?area=${area.id}`).then((r) => r.json()).then(setWanted).catch(() => {}); }, [area.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const pricePence = Math.round((parseFloat(price) || 0) * 100);
    const r = await fetch('/api/listings', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, pricePence, areaId: area.id, seller: seller || undefined, condition }) }).then((r) => r.json());
    setBusy(false);
    setDone({ title, tags: r.tags ?? [], area: r.area ?? area.name, price: pricePence });
    setTitle(''); setPrice('');
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <a href="/" className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-accent" /><span className="font-display text-[26px] leading-none text-ink">Assemble</span></a>
        <LocationPicker value={area} onChange={setArea} />
      </header>
      <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-24 pt-6 sm:px-6 lg:grid-cols-[1fr_440px]">
        <section>
          <p className="rise text-[12px] font-medium uppercase tracking-[0.2em] text-secondhand">Neighbours · {area.name}</p>
          <h1 className="rise mt-3 font-display text-[44px] leading-[1.02] text-ink sm:text-[64px]">Someone near you<br /><em className="text-secondhand">needs what you have.</em></h1>
          <p className="rise mt-4 max-w-xl text-[15px] leading-relaxed text-muted">These are parts people near {area.name} looked for this week and couldn't find close by. List yours and you become a pin on their map.</p>
          <ul className="mt-8 divide-y divide-line border-y border-line">
            {(wanted?.unmet ?? []).map((w, i) => (
              <li key={w.label} className="rise flex items-center justify-between gap-4 py-4" style={{ animationDelay: `${i * 60}ms` }}>
                <div>
                  <div className="font-display text-[28px] leading-tight text-ink">{w.label}</div>
                  <div className="text-[13px] text-muted">{w.count} {w.count === 1 ? 'person' : 'people'} nearby this week</div>
                </div>
                <button onClick={() => { setTitle(w.label); setDone(null); }} className="shrink-0 rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-secondhand hover:text-secondhand">I have one →</button>
              </li>
            ))}
          </ul>
          {wanted && wanted.goals.length > 0 && (
            <p className="mt-6 text-[13px] text-muted">Trending goals nearby: {wanted.goals.slice(0, 4).map((g) => `${g.label} (${g.count})`).join(' · ')}</p>
          )}
        </section>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          {done ? (
            <div className="rise rounded-3xl border border-line bg-card p-7 shadow-[var(--shadow-soft)]">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-own">Listed in {done.area}</div>
              <h2 className="mt-2 font-display text-3xl text-ink">{done.title}</h2>
              <div className="mt-1 font-mono text-sm text-muted">{done.price ? pounds(done.price) : 'Free'}</div>
              <p className="mt-4 text-[14px] leading-relaxed text-ink/80">You'll show up for anyone near {done.area} whose goal needs:</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{done.tags.map((t) => <span key={t} className="rounded-full bg-secondhand/10 px-2.5 py-1 text-[12px] text-secondhand">{t}</span>)}</div>
              <div className="mt-6 flex gap-2">
                <button onClick={() => setDone(null)} className="rounded-full border border-line px-4 py-2 text-sm text-ink">List another</button>
                <a href="/" className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Back to search</a>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="rise space-y-5 rounded-3xl border border-line bg-card p-7 shadow-[var(--shadow-soft)]">
              <h2 className="font-display text-3xl text-ink">Sell or lend something</h2>
              <label className="block">
                <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted">What is it?</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Red satin cape, adult, worn once" className="mt-1.5 w-full rounded-xl border border-line bg-paper/60 px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-ink/40" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted">Price £</span>
                  <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0 = free" className="mt-1.5 w-full rounded-xl border border-line bg-paper/60 px-3.5 py-2.5 font-mono text-[15px] text-ink outline-none focus:border-ink/40" />
                </label>
                <label className="block">
                  <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted">Your name</span>
                  <input value={seller} onChange={(e) => setSeller(e.target.value)} placeholder="Sam P." className="mt-1.5 w-full rounded-xl border border-line bg-paper/60 px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-ink/40" />
                </label>
              </div>
              <div>
                <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted">Condition</span>
                <div className="mt-1.5 flex gap-2">{CONDITIONS.map((c) => (
                  <button type="button" key={c} onClick={() => setCondition(c)} className={`rounded-full border px-3.5 py-1.5 text-sm ${condition === c ? 'border-ink bg-ink text-paper' : 'border-line text-ink'}`}>{c}</button>
                ))}</div>
              </div>
              <button disabled={busy || !title.trim()} className="w-full rounded-full bg-secondhand py-3 text-[15px] font-medium text-white transition hover:brightness-110 disabled:opacity-40">{busy ? 'Listing…' : `List it near ${area.name}`}</button>
              <p className="text-center text-[12px] text-muted">We tag it automatically. No fees for neighbours.</p>
            </form>
          )}
        </aside>
      </main>
    </div>
  );
}
