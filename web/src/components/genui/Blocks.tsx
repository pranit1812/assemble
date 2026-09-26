// Renderers for the fixed gen-UI component set (shared/genui.ts).
// The server only ever sends zod-validated JSON; each block type maps to one component here.
import { useState } from 'react';
import { ROUTE_ORDER, pounds, type BlockOf, type Option, type RouteTag } from '@shared/genui';

export const ROUTE_STYLE: Record<RouteTag, { bg: string; text: string; ring: string; soft: string; label: string; short?: string; hint: string }> = {
  Own: { bg: 'bg-own', text: 'text-own', ring: 'ring-own', soft: 'bg-own/10', label: 'Own', hint: 'Already yours' },
  DIY: { bg: 'bg-diy', text: 'text-diy', ring: 'ring-diy', soft: 'bg-diy/10', label: 'Make', hint: 'Make it' },
  Secondhand: { bg: 'bg-secondhand', text: 'text-secondhand', ring: 'ring-secondhand', soft: 'bg-secondhand/10', label: 'Neighbour', short: 'Used', hint: 'Secondhand nearby' },
  Local: { bg: 'bg-local', text: 'text-local', ring: 'ring-local', soft: 'bg-local/10', label: 'Local shop', short: 'Shop', hint: 'Walk in' },
  Parts: { bg: 'bg-parts', text: 'text-parts', ring: 'ring-parts', soft: 'bg-parts/10', label: 'Parts', hint: 'Buy parts, combine' },
  New: { bg: 'bg-new', text: 'text-new', ring: 'ring-new', soft: 'bg-new/10', label: 'New', hint: 'Buy it new' },
};

export function TagPill({ tag, small }: { tag: RouteTag; small?: boolean }) {
  const s = ROUTE_STYLE[tag];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${s.soft} ${s.text} ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} font-medium`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.bg}`} />
      {s.label}
    </span>
  );
}

const eta = (d: number) => (d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}` : `${m} min`);

export function AgentNoteView({ b }: { b: BlockOf<'AgentNote'> }) {
  return (
    <div className="rise flex gap-3">
      <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-medium text-paper">{b.agent[0]}</div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{b.agent}</div>
        <p className="mt-0.5 font-display text-[22px] leading-snug text-ink sm:text-[26px]">{b.text}</p>
      </div>
    </div>
  );
}

export function ClarifyGroup({ cards, onSubmit, busy }: { cards: BlockOf<'ClarifyCard'>[]; onSubmit: (a: Record<string, string | string[]>) => void; busy: boolean }) {
  const [ans, setAns] = useState<Record<string, string[]>>({});
  const toggle = (c: BlockOf<'ClarifyCard'>, v: string) =>
    setAns((a) => {
      const cur = a[c.key] ?? [];
      if (!c.multi) return { ...a, [c.key]: [v] };
      if (v === 'none') return { ...a, [c.key]: ['none'] };
      const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur.filter((x) => x !== 'none'), v];
      return { ...a, [c.key]: next };
    });
  const ready = cards.every((c) => c.multi || (ans[c.key]?.length ?? 0) > 0);
  return (
    <div className="rise space-y-6 rounded-3xl border border-line bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
      {cards.map((c, i) => (
        <div key={c.key} className="rise" style={{ animationDelay: `${i * 90}ms` }}>
          <div className="font-display text-2xl text-ink">{c.question}</div>
          {c.multi && <div className="mt-0.5 text-xs text-muted">Pick any</div>}
          <div className="mt-3 flex flex-wrap gap-2">
            {c.options.map((o) => {
              const on = ans[c.key]?.includes(o.value);
              return (
                <button key={o.value} onClick={() => toggle(c, o.value)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${on ? 'border-ink bg-ink text-paper' : 'border-line bg-paper/60 text-ink hover:border-ink/40'}`}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 border-t border-line pt-5">
        <span className="text-xs text-muted">We search in this order: own, make, neighbours, local shops, parts, new.</span>
        <button disabled={!ready || busy} onClick={() => onSubmit(Object.fromEntries(Object.entries(ans).map(([k, v]) => [k, cards.find((c) => c.key === k)?.multi ? v : v[0]])))}
          className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40">
          {busy ? 'Scouting…' : 'Find my routes →'}
        </button>
      </div>
    </div>
  );
}

export type ScoutState = Record<string, Partial<Record<RouteTag, { state: 'run' | 'done'; found: number }>>>;

function bestPerRoute(options: Option[]) {
  const m: Partial<Record<RouteTag, Option>> = {};
  for (const o of options) if (!m[o.tag]) m[o.tag] = o;
  return m;
}

function Ladder({ options, pickId, scouts, onPick }: { options?: Option[]; pickId?: string | null; scouts?: ScoutState[string]; onPick?: (o: Option) => void }) {
  const best = options ? bestPerRoute(options) : {};
  const picked = options?.find((o) => o.id === pickId);
  return (
    <div className="grid grid-cols-6 gap-1 sm:gap-1.5">
      {ROUTE_ORDER.map((r) => {
        const s = ROUTE_STYLE[r];
        const o = picked?.tag === r ? picked : best[r];
        const sc = scouts?.[r];
        const isPick = !!o && o.id === pickId;
        const empty = options ? !o : sc?.state === 'done' && sc.found === 0;
        return (
          <button key={r} disabled={!o || !onPick} onClick={() => o && onPick?.(o)} title={o ? `${o.title} · ${pounds(o.pricePence)}` : s.hint}
            className={`relative flex min-h-[54px] flex-col justify-between rounded-xl px-1.5 py-1.5 text-left transition sm:px-2
              ${isPick ? `${s.bg} text-white shadow-sm` : empty ? 'border border-dashed border-line text-faint' : `${s.soft} ${s.text} hover:ring-1 ${s.ring}`}`}>
            <span className="truncate text-[10px] font-medium uppercase tracking-wide opacity-90"><span className="sm:hidden">{s.short ?? s.label}</span><span className="hidden sm:inline">{s.label}</span></span>
            <span className="truncate font-mono text-[11.5px] sm:text-[13px]">
              {options ? (o ? (o.pricePence === 0 ? 'free' : pounds(o.pricePence)) : '—')
                : sc?.state === 'run' ? <span className="pulse-dot">•••</span> : sc?.state === 'done' ? (sc.found ? `${sc.found} found` : 'none') : <span className="opacity-30">·</span>}
            </span>
            {o?.isNew && <span className="absolute -right-1 -top-1.5 rounded-full bg-accent px-1.5 py-px text-[9px] font-semibold text-white">NEW</span>}
          </button>
        );
      })}
    </div>
  );
}

function MindfulRing({ v }: { v: number }) {
  const r = 15, c = 2 * Math.PI * r;
  return (
    <div className="relative h-10 w-10 shrink-0" title="Mindful score: route, distance, effort and time. Nobody can pay for it.">
      <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-line)" strokeWidth="3" />
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-own)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-[11px] text-ink">{v}</span>
    </div>
  );
}

export function ComponentCard({ c, scouts, onPick, idx = 0 }: { c: { id: string; name: string; note?: string; options?: Option[]; pickId?: string | null; briefOpen?: boolean }; scouts?: ScoutState[string]; onPick?: (o: Option) => void; idx?: number }) {
  const o = c.options?.find((x) => x.id === c.pickId);
  return (
    <div className="rise rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow-soft)] sm:p-5" style={{ animationDelay: `${idx * 70}ms` }}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-2xl text-ink">{c.name}</h3>
        {o && <span className="font-display text-2xl text-ink">{o.pricePence === 0 ? 'Free' : pounds(o.pricePence)}</span>}
      </div>
      <Ladder options={c.options} pickId={c.pickId} scouts={scouts} onPick={onPick} />
      {o && (
        <div className="mt-4 flex gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <TagPill tag={o.tag} small />
              <span className="font-medium text-ink">{o.title}</span>
              {o.isNew && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">Just added</span>}
            </div>
            <div className="mt-1 text-[13px] text-muted">
              {o.source.name}
              {o.source.area ? ` · ${o.source.area}` : ''}
              {o.source.distanceKm != null ? ` · ${o.source.distanceKm} km` : ''} · {o.tag === 'Secondhand' || o.tag === 'Local' ? `${Math.round(o.effortMins / 2)} min walk` : `${mins(o.effortMins)} hands-on`} · ready {eta(o.etaDays)}
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-ink/80"><span className="mr-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Why</span>{o.why}</p>
          </div>
          <MindfulRing v={o.mindful} />
        </div>
      )}
      {c.briefOpen && (
        <div className="mt-3 rounded-xl bg-accent-soft/60 px-3 py-2 text-[13px] text-accent">No neighbour or local shop has this yet. We've posted a brief to shops near you.</div>
      )}
    </div>
  );
}

export function LocalShopCardView({ b }: { b: BlockOf<'LocalShopCard'> }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(b.message.body); } catch { /* clipboard blocked */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="rise overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-4 p-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-local">
            <span className="h-1.5 w-1.5 rounded-full bg-local" /> Local shop · {b.shop.distanceKm} km
          </div>
          <h3 className="mt-1 font-display text-3xl text-ink">{b.shop.name}</h3>
          <div className="mt-1 text-[13px] text-muted">{b.shop.address}{b.shop.hours ? ` · ${b.shop.hours}` : ''}</div>
        </div>
        {b.shop.walkIn && <span className="shrink-0 rounded-full border border-local/40 px-3 py-1 text-xs font-medium text-local">Walk-ins welcome</span>}
      </div>
      <ul className="border-t border-line px-5 py-3 text-[14px]">
        {b.items.map((i) => (
          <li key={i.title} className="flex justify-between py-1"><span className="text-ink">{i.title}</span><span className="font-mono text-muted">{pounds(i.pricePence)}</span></li>
        ))}
      </ul>
      <div className="border-t border-line bg-paper/50 p-5">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Ask before you go</div>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink/80">{b.message.body}</pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.shop.address}, London`)}`} target="_blank" rel="noreferrer"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper">Walk in · directions</a>
          <button onClick={copy} className="rounded-full border border-line bg-card px-4 py-2 text-sm text-ink hover:border-ink/40">{copied ? 'Copied ✓' : 'Copy message'}</button>
          <a href={`mailto:${b.message.to}?subject=${encodeURIComponent(b.message.subject)}&body=${encodeURIComponent(b.message.body)}`} className="rounded-full border border-line bg-card px-4 py-2 text-sm text-ink hover:border-ink/40">Email shop</a>
        </div>
      </div>
    </div>
  );
}

export function CostCompareView({ b }: { b: BlockOf<'CostCompare'> }) {
  const max = Math.max(...b.rows.map((r) => r.totalPence), b.budgetPence ?? 0, 1);
  return (
    <div className="rise rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-2xl text-ink">Three ways to do it</h3>
        {b.budgetPence != null && <span className="text-xs text-muted">Budget {pounds(b.budgetPence)}</span>}
      </div>
      <div className="mt-4 space-y-4">
        {b.rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className={r.highlight ? 'font-medium text-ink' : 'text-muted'}>{r.label}{r.highlight && <span className="ml-2 rounded-full bg-own/10 px-2 py-0.5 text-[11px] text-own">our plan</span>}</span>
              <span className={`font-display text-2xl ${r.highlight ? 'text-ink' : 'text-muted'}`}>{pounds(r.totalPence)}</span>
            </div>
            <div className="relative mt-1.5 h-2.5 rounded-full bg-line/60">
              <div className={`h-full rounded-full ${r.highlight ? 'bg-own' : 'bg-faint'}`} style={{ width: `${(r.totalPence / max) * 100}%` }} />
              {b.budgetPence != null && <div className="absolute -top-1 h-4.5 w-px bg-accent" style={{ left: `${(b.budgetPence / max) * 100}%` }} />}
            </div>
            <div className="mt-1 text-[12px] text-muted">{mins(r.effortMins)} effort · ready {eta(r.etaDays)} · {r.newItems === 0 ? 'nothing bought new' : `${r.newItems} new item${r.newItems > 1 ? 's' : ''}`}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlanSummaryView({ b, onToggle }: { b: BlockOf<'PlanSummary'>; onToggle: (cid: string, v: boolean) => void }) {
  const got = b.items.filter((i) => i.acquired).length;
  const total = b.items.reduce((s, i) => s + i.pricePence, 0);
  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-2xl text-ink">Your plan</h3>
        <span className="font-display text-2xl text-ink">{pounds(total)}</span>
      </div>
      <div className="mt-1 text-xs text-muted">{b.deadline ? `Ready by ${b.deadline} · ` : ''}{got} of {b.items.length} gathered</div>
      <div className="mt-3 h-1.5 rounded-full bg-line/60"><div className="h-full rounded-full bg-own transition-all duration-500" style={{ width: `${(got / Math.max(1, b.items.length)) * 100}%` }} /></div>
      <ul className="mt-3 divide-y divide-line">
        {b.items.map((i) => (
          <li key={i.componentId}>
            <label className="flex cursor-pointer items-center gap-3 py-2.5">
              <input type="checkbox" checked={i.acquired} onChange={(e) => onToggle(i.componentId, e.target.checked)} className="h-4.5 w-4.5 accent-[var(--color-own)]" />
              <div className="min-w-0 flex-1">
                <div className={`text-sm ${i.acquired ? 'text-muted line-through' : 'text-ink'}`}>{i.name}</div>
                <div className="truncate text-[12px] text-muted">{i.title}</div>
              </div>
              <TagPill tag={i.tag} small />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GuideCardView({ b, idx = 0 }: { b: BlockOf<'GuideCard'>; idx?: number }) {
  return (
    <div className="rise rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow-soft)]" style={{ animationDelay: `${idx * 80}ms` }}>
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{b.author} · {b.minutes} min · {b.difficulty}</div>
      <h3 className="mt-1 font-display text-2xl text-ink">{b.title}</h3>
      {b.materials.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">{b.materials.map((m) => <span key={m} className="rounded-full bg-paper px-2.5 py-0.5 text-[12px] text-muted">{m}</span>)}</div>
      )}
      <ol className="mt-3 space-y-2">
        {b.steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-ink/85">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink font-mono text-[10px] text-paper">{i + 1}</span>{s}
          </li>
        ))}
      </ol>
    </div>
  );
}
