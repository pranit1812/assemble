// Owner view: the whole platform at a glance, for whoever runs Assemble.
import { useEffect, useState } from 'react';

type O = any;
const ago = (iso?: string) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - Date.parse(iso.replace(' ', 'T') + 'Z')) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};

function Stat({ n, label }: { n: number; label: string }) {
  return <div className="rounded-2xl border border-line bg-card p-4"><div className="font-display text-3xl text-ink">{n}</div><div className="mt-1 text-[12px] text-muted">{label}</div></div>;
}
function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return <section className="rounded-2xl border border-line bg-card p-5"><div className="mb-3 flex items-baseline justify-between"><h2 className="font-display text-xl text-ink">{title}</h2>{right}</div>{children}</section>;
}

export default function Owner() {
  const [d, setD] = useState<O | null>(null);
  useEffect(() => {
    const load = () => fetch('/api/owner/overview').then((r) => r.json()).then(setD).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);
  if (!d) return <div className="p-10 text-muted">Loading…</div>;
  const k = d.kpis;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-accent" /><span className="font-display text-[24px] text-ink">Assemble</span><span className="ml-2 rounded-full bg-ink px-2.5 py-0.5 text-[11px] text-paper">Owner</span></a>
        <nav className="flex gap-4 text-sm text-muted"><a href="/ops" className="hover:text-ink">Bot board</a><a href="/admin" className="hover:text-ink">Merchant portal</a></nav>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat n={k.goalsToday} label="shopper goals today" /><Stat n={k.goalsWeek} label="goals this week" /><Stat n={k.merchants} label="merchants" /><Stat n={k.walkIn} label="walk-in shops" />
        <Stat n={k.neighbours} label="neighbours selling" /><Stat n={k.openBriefs} label="open briefs" /><Stat n={k.offers} label="shop offers" /><Stat n={k.leads} label="leads won" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="What shoppers are asking for" right={<span className="text-[12px] text-muted">live</span>}>
          <ul className="divide-y divide-line">
            {d.requests.map((g: O) => (
              <li key={g.id} className="flex items-start justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[15px] text-ink">{g.title}</div>
                  <div className="truncate text-[12px] text-muted">“{g.text}” · {g.user_name || 'guest'} · {g.area}</div>
                  {g.unmet && <div className="mt-0.5 text-[12px] text-accent">No local stock: {g.unmet}</div>}
                </div>
                <div className="shrink-0 text-right text-[12px] text-muted"><div>{ago(g.created_at)}</div><div>{g.status}</div></div>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-5">
          <Card title="Demand this week">
            <div className="text-[12px] uppercase tracking-wide text-muted">Top goals</div>
            {d.topGoals.map((x: O) => <div key={x.label} className="flex justify-between py-1 text-[14px]"><span className="text-ink">{x.label}</span><span className="text-muted">{x.n}</span></div>)}
            <div className="mt-3 text-[12px] uppercase tracking-wide text-muted">Parts nobody nearby had</div>
            {d.topUnmet.map((x: O) => <div key={x.label} className="flex justify-between py-1 text-[14px]"><span className="text-ink">{x.label}</span><span className="text-accent">{x.n}</span></div>)}
          </Card>
          <Card title="Goals we can't handle yet" right={<span className="text-[12px] text-muted">for the Recipe writer bot</span>}>
            {d.unknownGoals.length ? d.unknownGoals.map((x: O, i: number) => <div key={i} className="flex justify-between gap-3 py-1 text-[14px]"><span className="truncate text-ink">“{x.text}”</span><span className="shrink-0 text-muted">{x.status}</span></div>)
              : <p className="text-[13px] text-muted">None. Every goal so far had a recipe.</p>}
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Merchants">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead className="text-[12px] text-muted"><tr><th className="py-1.5 font-normal">Shop</th><th className="font-normal">Type</th><th className="font-normal">Area</th><th className="font-normal">Products</th><th className="font-normal">Offers</th><th className="font-normal">Leads</th></tr></thead>
              <tbody className="divide-y divide-line">
                {d.merchants.map((m: O) => (
                  <tr key={m.id}><td className="py-2 text-ink">{m.name}{m.walk_in && <span className="ml-2 rounded-full bg-local/10 px-2 py-0.5 text-[11px] text-local">walk-in</span>}</td>
                    <td className="text-muted">{m.kind === 'local' ? 'Local' : 'Online'} · {m.category}</td><td className="text-muted">{m.area || '—'}</td><td>{m.products}</td><td>{m.offers}</td><td>{m.leads}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Grok bots, latest" right={<a href="/ops" className="text-[12px] text-muted hover:text-ink">full board →</a>}>
          {d.bots.map((t: O, i: number) => (
            <div key={i} className="border-b border-line py-2 last:border-0">
              <div className="flex justify-between text-[12px] text-muted"><span className="font-medium uppercase tracking-wide">{t.agent}</span><span>{t.status} · {ago(t.updated_at)}</span></div>
              <div className="text-[14px] text-ink">{t.title}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
