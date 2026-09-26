// Owner view: the whole platform at a glance, for whoever runs Assemble.
import { useEffect, useState } from 'react';

type O = any;
const ago = (iso?: string) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - Date.parse(iso.replace(' ', 'T') + 'Z')) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
        <a href="/" className="flex shrink-0 items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-accent" />
          <span className="font-display text-[26px] leading-none text-ink">Assemble</span>
        </a>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
          <a href="/ops" className="transition hover:text-ink">Bots</a>
          <a href="/admin" className="transition hover:text-ink">For shops</a>
        </nav>
      </div>
    </header>
  );
}

export default function Owner() {
  const [d, setD] = useState<O | null>(null);
  useEffect(() => {
    const load = () => fetch('/api/owner/overview').then((r) => r.json()).then(setD).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto min-w-0 max-w-3xl px-4 pb-24 pt-12 sm:px-6">
        {!d ? <p className="text-sm text-muted">Loading…</p> : (
          <>
            <section>
              <h1 className="font-display text-[38px] leading-[1.06] text-ink sm:text-[56px]">What shoppers are asking for</h1>
              <ul className="mt-10 divide-y divide-line border-y border-line">
                {d.requests.map((g: O) => (
                  <li key={g.id} className="py-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="min-w-0 break-words font-display text-2xl leading-tight text-ink">{g.title}</p>
                      <p className="shrink-0 font-mono text-sm text-muted">{ago(g.created_at)}</p>
                    </div>
                    <p className="mt-2 break-words text-sm leading-relaxed text-muted">“{g.text}” · {g.user_name || 'guest'} · {g.area}</p>
                    {g.unmet && <p className="mt-2 break-words text-sm text-accent">No local stock: {g.unmet}</p>}
                    <p className="mt-1 text-sm text-faint">{g.status}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-20">
              <h2 className="font-display text-3xl text-ink">Demand this week</h2>
              <h3 className="mt-8 text-sm text-muted">Top goals</h3>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {d.topGoals.map((x: O) => (
                  <li key={x.label} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="min-w-0 break-words text-[15px] text-ink">{x.label}</span>
                    <span className="shrink-0 font-mono text-sm text-muted">{x.n}</span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-10 text-sm text-muted">Parts nobody nearby had</h3>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {d.topUnmet.map((x: O) => (
                  <li key={x.label} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="min-w-0 break-words text-[15px] text-ink">{x.label}</span>
                    <span className="shrink-0 font-mono text-sm text-muted">{x.n}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-20">
              <h2 className="font-display text-3xl text-ink">Goals we can't handle yet</h2>
              <p className="mt-2 text-sm text-muted">For the Recipe writer bot</p>
              {d.unknownGoals.length ? (
                <ul className="mt-6 divide-y divide-line border-y border-line">
                  {d.unknownGoals.map((x: O, i: number) => (
                    <li key={i} className="flex items-baseline justify-between gap-4 py-4">
                      <span className="min-w-0 break-words text-[15px] text-ink">“{x.text}”</span>
                      <span className="shrink-0 text-sm text-muted">{x.status}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-6 text-sm text-muted">None. Every goal so far had a recipe.</p>}
            </section>

            <section className="mt-20">
              <h2 className="font-display text-3xl text-ink">Merchants</h2>
              <ul className="mt-6 divide-y divide-line border-y border-line">
                {d.merchants.map((m: O) => (
                  <li key={m.id} className="py-5">
                    <p className="break-words font-display text-2xl leading-tight text-ink">{m.name}</p>
                    <p className="mt-2 break-words text-sm text-muted">{m.kind === 'local' ? 'Local' : 'Online'} · {m.category} · {m.area || '—'}{m.walk_in ? ' · Walk-in' : ''}</p>
                    <p className="mt-1 font-mono text-sm text-muted">{m.products} products · {m.offers} offers · {m.leads} leads</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-20">
              <h2 className="font-display text-3xl text-ink">Grok bots, latest</h2>
              <ul className="mt-6 divide-y divide-line border-y border-line">
                {d.bots.map((t: O, i: number) => (
                  <li key={i} className="py-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="min-w-0 break-words text-sm text-muted">{t.agent}</p>
                      <p className="shrink-0 font-mono text-sm text-muted">{t.status} · {ago(t.updated_at)}</p>
                    </div>
                    <p className="mt-2 break-words text-[15px] text-ink">{t.title}</p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
