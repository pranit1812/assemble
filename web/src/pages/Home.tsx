import { useEffect, useMemo, useRef, useState } from 'react';
import { ROUTE_ORDER, type Block, type BlockOf, type Option, type PlanEvent, type RouteTag } from '@shared/genui';
import type { Area } from '@shared/areas';
import { api, type GoalInfo } from '../lib/api';
import { LocationPicker, loadArea } from '../components/map/LocationPicker';
import { NearbyMap } from '../components/map/NearbyMap';
import {
  AgentNoteView, ClarifyGroup, ComponentCard, CostCompareView, GuideCardView, LocalShopCardView, PlanSummaryView, ROUTE_STYLE, type ScoutState,
} from '../components/genui/Blocks';

const EXAMPLES = ['I want to be Superman for Halloween, £40, by Friday', 'Prototype a self-watering plant pot'];

type Phase = 'idle' | 'intake' | 'clarify' | 'planning' | 'planned';
const of = <T extends Block['type']>(bs: Block[], t: T) => bs.filter((b) => b.type === t) as BlockOf<T>[];

export default function Home() {
  const [area, setArea] = useState<Area>(loadArea);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [goalText, setGoalText] = useState('');
  const [goal, setGoal] = useState<GoalInfo | null>(null);
  const [intake, setIntake] = useState<Block[]>([]);
  const [status, setStatus] = useState<{ agent: string; text: string }[]>([]);
  const [comps, setComps] = useState<{ id: string; name: string }[]>([]);
  const [scouts, setScouts] = useState<ScoutState>({});
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [guides, setGuides] = useState<Block[]>([]);
  const [err, setErr] = useState('');
  const [nearby, setNearby] = useState<{ shops: number; listings: number } | null>(null);
  const [listening, setListening] = useState(false);
  const planRef = useRef<HTMLDivElement>(null);
  const [lg, setLg] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setLg(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const guidesRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api.nearby(area.id).then(setNearby).catch(() => {}); }, [area.id]);

  async function start(t = text) {
    const q = t.trim();
    if (!q) return;
    setErr(''); setGoalText(q); setPhase('intake'); setBlocks([]); setGuides([]); setStatus([]); setScouts({}); setComps([]);
    try {
      const r = await api.intake(q, area.id);
      setGoal(r.goal); setIntake(r.blocks); setPhase('clarify');
    } catch (e: any) { setErr(e.message); setPhase('idle'); }
  }

  async function plan(answers: Record<string, string | string[]>) {
    if (!goal) return;
    setPhase('planning'); setComps(goal.components);
    setTimeout(() => planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    try {
      await api.plan(goal.id, answers, (e: PlanEvent) => {
        if (e.t === 'status') setStatus((s) => [...s, { agent: e.agent, text: e.text }]);
        else if (e.t === 'components') setComps(e.components);
        else if (e.t === 'scout') setScouts((s) => ({ ...s, [e.componentId]: { ...s[e.componentId], [e.route]: { state: e.state, found: e.found } } }));
        else if (e.t === 'blocks') { setBlocks(e.blocks); setPhase('planned'); }
        else if (e.t === 'error') setErr(e.message);
      });
    } catch (e: any) { setErr(e.message); }
  }

  async function pick(cid: string, o: Option) {
    if (!goal) return;
    const r = await api.pick(goal.id, cid, o.id);
    setBlocks(r.blocks);
  }
  async function toggle(cid: string, v: boolean) {
    if (!goal) return;
    const r = await api.acquire(goal.id, cid, v);
    setBlocks(r.blocks);
    if (r.allAcquired) {
      const g = await api.assembly(goal.id);
      setGuides(g.blocks);
      setTimeout(() => guidesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    } else setGuides([]);
  }

  function mic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'en-GB'; rec.interimResults = true;
    rec.onresult = (e: any) => setText(Array.from(e.results).map((r: any) => r[0].transcript).join(''));
    rec.onend = () => setListening(false);
    setListening(true); rec.start();
  }
  const hasMic = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const reset = () => { setPhase('idle'); setGoal(null); setText(''); setBlocks([]); setGuides([]); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const bd = of(blocks, 'Breakdown')[0];
  const map = of(blocks, 'NearbyMap')[0];
  const summary = of(blocks, 'PlanSummary')[0];
  const cards = useMemo(() => of(intake, 'ClarifyCard'), [intake]);
  const idle = phase === 'idle' || phase === 'intake';

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <button onClick={reset} className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-accent" />
          <span className="font-display text-[26px] leading-none text-ink">Assemble</span>
        </button>
        <div className="flex items-center gap-2 sm:gap-4">
          <LocationPicker value={area} onChange={setArea} />
          <a href="/sell" className="hidden text-sm text-muted hover:text-ink sm:inline">Sell or lend</a>
          <a href="/admin" className="hidden text-sm text-muted hover:text-ink sm:inline">For shops →</a>
        </div>
      </header>

      {idle && (
        <main className="mx-auto flex min-h-[78vh] max-w-3xl flex-col justify-center px-4 pb-16 sm:px-6">
          <p className="rise text-[12px] font-medium uppercase tracking-[0.2em] text-muted">Mindful buying · London</p>
          <h1 className="rise mt-4 font-display text-[44px] leading-[1.02] text-ink sm:text-[76px]" style={{ animationDelay: '60ms' }}>
            Tell us what you're making.<br /><em className="text-accent">We'll find it close to home.</em>
          </h1>
          <form onSubmit={(e) => { e.preventDefault(); start(); }} className="rise mt-10" style={{ animationDelay: '120ms' }}>
            <div className="flex items-end gap-2 rounded-[28px] border border-line bg-card p-2.5 pl-5 shadow-[var(--shadow-soft)] focus-within:border-ink/30">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start(); } }}
                placeholder="Describe your goal…"
                className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[17px] text-ink outline-none placeholder:text-faint" />
              {hasMic && (
                <button type="button" onClick={mic} aria-label="Speak" className={`grid h-11 w-11 place-items-center rounded-full ${listening ? 'bg-accent text-white' : 'text-muted hover:bg-paper'}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                </button>
              )}
              <button type="submit" disabled={phase === 'intake' || !text.trim()} aria-label="Start"
                className="grid h-11 w-11 place-items-center rounded-full bg-ink text-paper transition disabled:opacity-30">
                {phase === 'intake' ? <span className="pulse-dot text-lg leading-none">•</span> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
              </button>
            </div>
          </form>
          <div className="rise mt-4 flex flex-wrap gap-2" style={{ animationDelay: '180ms' }}>
            {EXAMPLES.map((x) => (
              <button key={x} onClick={() => { setText(x); start(x); }} className="rounded-full border border-line px-3.5 py-1.5 text-[13px] text-muted transition hover:border-ink/30 hover:text-ink">{x}</button>
            ))}
          </div>
          {err && <p className="mt-4 text-sm text-accent">{err}</p>}
          <div className="rise mt-14 border-t border-line pt-6" style={{ animationDelay: '240ms' }}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px] text-muted">
              <span className="mr-1">We always look in this order</span>
              {ROUTE_ORDER.map((r, i) => (
                <span key={r} className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 ${ROUTE_STYLE[r].text}`}><span className={`h-2 w-2 rounded-full ${ROUTE_STYLE[r].bg}`} />{ROUTE_STYLE[r].hint}</span>
                  {i < ROUTE_ORDER.length - 1 && <span className="text-faint">→</span>}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-muted">
              {nearby ? <><b className="font-medium text-ink">{nearby.shops} local shops</b> and <b className="font-medium text-ink">{nearby.listings} neighbours</b> within 5 km of {area.name}. </> : null}
              Shops never pay to rank. They pay to hear what people nearby need.
            </p>
            <a href="/sell" className="mt-3 inline-block text-[13px] text-secondhand underline decoration-secondhand/30 underline-offset-4 hover:decoration-secondhand">Got something a neighbour could use? Sell or lend it →</a>
          </div>
        </main>
      )}

      {!idle && (
        <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-6 pt-4">
            <div className="rise flex justify-end"><div className="max-w-[85%] rounded-3xl rounded-br-md bg-ink px-5 py-3 text-[16px] text-paper">{goalText}</div></div>
            {of(intake, 'AgentNote').map((b, i) => <AgentNoteView key={i} b={b} />)}
            {phase === 'clarify' && <ClarifyGroup cards={cards} onSubmit={plan} busy={false} />}
          </div>

          {(phase === 'planning' || phase === 'planned') && (
            <div ref={planRef} className="scroll-mt-6 pt-8">
              <div className="mx-auto max-w-3xl space-y-2">
                {status.map((s, i) => (
                  <div key={i} className="rise flex items-center gap-2 text-[13px] text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-own" /><span className="font-medium text-ink">{s.agent}</span>{s.text}
                  </div>
                ))}
              </div>
              {of(blocks, 'AgentNote').map((b, i) => <div key={i} className="mx-auto mt-6 max-w-3xl"><AgentNoteView b={b} /></div>)}

              <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
                <div className="space-y-4">
                  {!lg && map && <NearbyMap block={map} />}
                  {(bd?.components ?? comps).map((c, i) => (
                    <ComponentCard key={c.id} idx={i} c={c} scouts={scouts[c.id]} onPick={bd ? (o) => pick(c.id, o) : undefined} />
                  ))}
                  {of(blocks, 'CostCompare').map((b, i) => <CostCompareView key={i} b={b} />)}
                  {of(blocks, 'LocalShopCard').map((b) => <LocalShopCardView key={b.shop.id} b={b} />)}
                </div>
                <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
                  {!lg ? null : map ? <NearbyMap block={map} /> : <div className="grid h-[280px] place-items-center rounded-2xl border border-line bg-card text-sm text-muted sm:h-[360px]"><span className="pulse-dot">Scouting around {area.name}…</span></div>}
                  {summary && <PlanSummaryView b={summary} onToggle={toggle} />}
                </aside>
              </div>

              {guides.length > 0 && (
                <section ref={guidesRef} className="scroll-mt-6 pt-14">
                  <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-own">Everything gathered</p>
                  <h2 className="mt-2 font-display text-5xl text-ink">Now put it together.</h2>
                  <div className="mt-6 grid gap-4 md:grid-cols-2">{of(guides, 'GuideCard').map((b, i) => <GuideCardView key={b.guideId} b={b} idx={i} />)}</div>
                </section>
              )}
              {err && <p className="mt-4 text-sm text-accent">{err}</p>}
            </div>
          )}
        </main>
      )}
    </div>
  );
}

export type { RouteTag };
