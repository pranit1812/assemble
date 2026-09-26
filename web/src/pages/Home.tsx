import { useEffect, useMemo, useRef, useState } from 'react';
import { type Block, type BlockOf, type Option, type PlanEvent } from '@shared/genui';
import type { Area } from '@shared/areas';
import { api, type GoalInfo, type Offer } from '../lib/api';
import { LocationPicker, loadArea } from '../components/map/LocationPicker';
import { NearbyMap } from '../components/map/NearbyMap';
import { Composer } from '../components/Composer';
import { AssemblyView } from '../components/assembly/AssemblyView';
import {
  AdviceCardView, AgentNoteView, ClarifyGroup, ComponentCard, CostCompareView, GuideCardView, LocalShopCardView, PlanSummaryView, type ScoutState,
} from '../components/genui/Blocks';

const PROMPTS = [
  { label: 'Be Superman for Halloween', text: 'I want to be Superman for Halloween, £40, by Friday' },
  { label: 'Prototype a self-watering pot', text: 'Prototype a self-watering plant pot' },
  { label: 'A witch costume by tomorrow', text: 'A witch costume for my daughter by tomorrow, under £20' },
  { label: 'Tidy my messy shelf', text: 'Find me shelf organisers for this mess, DIY is fine, under £30' },
];
const PLACEHOLDERS = ['Superman for Halloween, £40, by Friday…', 'A self-watering plant pot prototype…', 'Shelf organisers for my messy desk…', 'Or attach a photo of what you already have…'];

type Phase = 'idle' | 'intake' | 'clarify' | 'planning' | 'planned';
const of = <T extends Block['type']>(bs: Block[], t: T) => bs.filter((b) => b.type === t) as BlockOf<T>[];
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

function Words({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  return (
    <span className={className}>
      {text.split(' ').map((w, i) => (
        <span key={i} className="word-in" style={{ animationDelay: `${delay + i * 70}ms` }}>{w}&nbsp;</span>
      ))}
    </span>
  );
}

function Header({ area, setArea, solid }: { area: Area; setArea: (a: Area) => void; solid?: boolean }) {
  return (
    <header className={`sticky top-0 z-30 ${solid ? 'border-b border-line/70 bg-paper/80 backdrop-blur-xl' : ''}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <a href="/" className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-accent" />
          <span className="font-display text-[26px] leading-none text-ink">Assemble</span>
        </a>
        <div className="flex items-center gap-2 sm:gap-5">
          <a href="/admin" className="hidden text-sm text-muted transition hover:text-ink sm:inline">For shops</a>
          <LocationPicker value={area} onChange={setArea} />
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  const [area, setArea] = useState<Area>(loadArea);
  const [name, setName] = useState<string>(() => {
    const q = new URLSearchParams(location.search).get('name');
    if (q) store.set('assemble.name', q);
    return q || store.get('assemble.name') || '';
  });
  const [nameDraft, setNameDraft] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [goalText, setGoalText] = useState('');
  const [goalImage, setGoalImage] = useState<string | undefined>();
  const [goal, setGoal] = useState<GoalInfo | null>(null);
  const [intake, setIntake] = useState<Block[]>([]);
  const [status, setStatus] = useState<{ agent: string; text: string }[]>([]);
  const [comps, setComps] = useState<{ id: string; name: string }[]>([]);
  const [scouts, setScouts] = useState<ScoutState>({});
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [guides, setGuides] = useState<Block[]>([]);
  const [err, setErr] = useState('');
  const [offers, setOffers] = useState<Record<string, Offer>>({});
  const [vision, setVision] = useState<{ status: string; seen?: string; owned?: string[] } | null>(null);
  const lastAnswers = useRef<Record<string, string | string[]>>({});
  const [asks, setAsks] = useState<{ q: string; b: BlockOf<'AdviceCard'> | null }[]>([]);
  const askRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const guidesRef = useRef<HTMLDivElement>(null);
  const [lg, setLg] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setLg(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // A Grok bot on the VM looks at the shopper's photo; its answer lands here whenever it's ready.
  useEffect(() => {
    if (!goal || !goalImage) return;
    let stop = false;
    const t0 = Date.now();
    setVision({ status: 'queued' });
    (async function poll() {
      while (!stop && Date.now() - t0 < 240_000) {
        const v = await api.vision(goal.id).catch(() => null);
        if (v && v.status === 'done') { setVision(v); return; }
        if (v) setVision(v);
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();
    return () => { stop = true; };
  }, [goal?.id, goalImage]);

  // Fold what Grok saw into the owned chips (while clarifying).
  useEffect(() => {
    if (vision?.status !== 'done' || !vision.owned?.length) return;
    setIntake((bs) => bs.map((b) => (b.type === 'ClarifyCard' && b.key === 'owned' ? { ...b, selected: [...new Set([...(b.selected ?? []).filter((x) => x !== 'none'), ...vision.owned!])] } : b)));
  }, [vision?.status]);

  // Shops answering this shopper's briefs show up live.
  useEffect(() => {
    if (phase !== 'planned' || !goal) return;
    const seen = new Set(Object.values(offers).map((o) => o.id));
    const t = setInterval(async () => {
      const list = await api.offers(goal.id).catch(() => [] as Offer[]);
      for (const o of list) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        setOffers((m) => ({ ...m, [o.componentId]: o }));
        const r = await api.rescout(goal.id, o.componentId).catch(() => null);
        if (r) setBlocks(r.blocks);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [phase, goal?.id]);

  async function start(text: string, image?: string) {
    if (!text && !image) return;
    setErr(''); setGoalText(text || 'Here’s what I have.'); setGoalImage(image);
    setPhase('intake'); setOffers({}); setAsks([]); setVision(null); setBlocks([]); setGuides([]); setStatus([]); setScouts({}); setComps([]); setIntake([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const r = await api.intake(text, area.id, image, name || undefined);
      setGoal(r.goal); setIntake(r.blocks); setPhase('clarify');
    } catch (e: any) { setErr(e.message); setPhase('idle'); }
  }

  async function plan(answers: Record<string, string | string[]>) {
    if (!goal) return;
    lastAnswers.current = answers;
    setPhase('planning'); setComps(goal.components);
    setTimeout(() => planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
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

  // Follow-up buying questions go to the Advisor; anything else starts a new goal.
  async function onDock(text: string, image?: string) {
    const isQ = /\?\s*$|^(should|is|are|will|would|do|does|can|which|what if|how long)\b|\b(wait|worth it|better|newer|upgrade|does it matter)\b/i.test(text);
    if (!(phase === 'planned' && goal && text && !image && isQ)) return start(text, image);
    setAsks((a) => [...a, { q: text, b: null }]);
    setTimeout(() => askRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 60);
    const r = await api.ask(goal.id, text).catch(() => null);
    setAsks((a) => a.map((x) => (x.q === text && !x.b ? { ...x, b: (r?.block as BlockOf<'AdviceCard'>) ?? null } : x)));
  }

  async function pick(cid: string, o: Option) {
    if (!goal) return;
    setBlocks((await api.pick(goal.id, cid, o.id)).blocks);
  }
  async function toggle(cid: string, v: boolean) {
    if (!goal) return;
    const r = await api.acquire(goal.id, cid, v);
    setBlocks(r.blocks);
    if (r.allAcquired) {
      setGuides((await api.assembly(goal.id)).blocks);
      setTimeout(() => guidesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    } else setGuides([]);
  }

  const bd = of(blocks, 'Breakdown')[0];
  const map = of(blocks, 'NearbyMap')[0];
  const summary = of(blocks, 'PlanSummary')[0];
  const cards = useMemo(() => of(intake, 'ClarifyCard'), [intake]);

  // ---- first visit: ask for a name
  if (!name) {
    return (
      <div className="relative min-h-[100svh] overflow-hidden">
        <div className="aura"><i /><i /><i /></div>
        <div className="relative z-10 flex min-h-[100svh] flex-col items-center justify-center px-4 text-center">
          <div className="rise mb-6 h-3 w-3 rounded-full bg-accent" />
          <h1 className="font-display text-[42px] leading-[1.05] text-ink sm:text-[64px]"><Words text="Hi, I'm Assemble." /><br /><Words text="What should I call you?" delay={350} className="text-muted" /></h1>
          <form onSubmit={(e) => { e.preventDefault(); const n = nameDraft.trim(); if (n) { store.set('assemble.name', n); setName(n); } }} className="rise mt-10 flex w-full max-w-sm items-center gap-2 rounded-full border border-line bg-card/90 p-2 pl-5 shadow-[var(--shadow-soft)] backdrop-blur" style={{ animationDelay: '700ms' }}>
            <input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Your first name" className="flex-1 bg-transparent py-2 text-[17px] text-ink outline-none placeholder:text-faint" />
            <button disabled={!nameDraft.trim()} className="grid h-11 w-11 place-items-center rounded-full bg-ink text-paper disabled:opacity-25" aria-label="Continue">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---- landing: greeting + one input
  if (phase === 'idle') {
    return (
      <div className="relative min-h-[100svh] overflow-hidden">
        <div className="aura"><i /><i /><i /></div>
        <div className="relative z-10 flex min-h-[100svh] flex-col">
          <Header area={area} setArea={setArea} />
          <main className="flex flex-1 flex-col items-center justify-center px-4 pb-24 text-center sm:px-6">
            <h1 className="font-display text-[38px] leading-[1.06] text-ink sm:text-[60px]">
              <Words text={`Hey ${name},`} className="text-muted" />
              <br />
              <Words text="what are we thinking today?" delay={260} />
            </h1>
            <div className="rise mt-12 w-full max-w-2xl text-left" style={{ animationDelay: '750ms' }}>
              <Composer onSubmit={start} placeholders={PLACEHOLDERS} autoFocus />
            </div>
            <div className="mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
              {PROMPTS.map((p, i) => (
                <button key={p.label} onClick={() => start(p.text)} className="rise rounded-full border border-line bg-card/60 px-4 py-2 text-[13px] text-muted backdrop-blur transition hover:border-ink/25 hover:text-ink" style={{ animationDelay: `${900 + i * 80}ms` }}>
                  {p.label}
                </button>
              ))}
            </div>
            {err && <p className="mt-4 text-sm text-accent">{err}</p>}
          </main>
        </div>
      </div>
    );
  }

  // ---- conversation
  return (
    <div className="min-h-screen">
      <Header area={area} setArea={setArea} solid />
      <main className="mx-auto max-w-6xl px-4 pb-48 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-6 pt-8">
          <div className="rise flex flex-col items-end gap-2">
            {goalImage && <img src={goalImage} alt="What you have" className="img-in h-40 w-40 rounded-3xl rounded-br-md object-cover ring-1 ring-line" />}
            <div className="max-w-[85%] rounded-3xl rounded-br-md bg-ink px-5 py-3 text-[16px] text-paper">{goalText}</div>
          </div>
          {phase === 'intake' && (
            <div className="rise flex items-center gap-3 text-[14px] text-muted">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[11px] text-paper">O</span>
              <span className="pulse-dot">{goalImage ? 'Looking at your photo and the goal…' : 'Understanding the goal…'}</span>
            </div>
          )}
          {of(intake, 'AgentNote').map((b, i) => <AgentNoteView key={i} b={b} />)}
          {goalImage && vision && vision.status !== 'done' && vision.status !== 'none' && (
            <div className="rise flex items-center gap-3 text-[14px] text-muted">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[11px] text-paper">G</span>
              <span className="pulse-dot">A Grok bot on our server is looking at your photo…</span>
            </div>
          )}
          {vision?.status === 'done' && vision.seen && (
            <AgentNoteView b={{ type: 'AgentNote', agent: 'Grok bot · looked at your photo', text: vision.seen }} />
          )}
          {vision?.status === 'done' && !!vision.owned?.length && phase === 'planned' && goal && (
            <button onClick={() => { const owned = [...new Set([...([] as string[]).concat(lastAnswers.current.owned ?? []).filter((x) => x !== 'none'), ...vision.owned!])]; plan({ ...lastAnswers.current, owned }); }}
              className="rise rounded-full bg-own px-4 py-2 text-sm font-medium text-white">Update my plan with what Grok saw</button>
          )}
          {phase === 'clarify' && <ClarifyGroup key={JSON.stringify(cards.map((c) => c.selected ?? []))} cards={cards} onSubmit={plan} busy={false} />}
        </div>

        {(phase === 'planning' || phase === 'planned') && (
          <div ref={planRef} className="scroll-mt-20 pt-8">
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
                  <ComponentCard key={c.id} idx={i} c={c} scouts={scouts[c.id]} ownImage={goalImage} onPick={bd ? (o) => pick(c.id, o) : undefined}
                    offer={offers[c.id]} onUseOffer={async (o) => goal && setBlocks((await api.rescout(goal.id, c.id, `product:${o.productId}`)).blocks)} />
                ))}
                {of(blocks, 'CostCompare').map((b, i) => <CostCompareView key={i} b={b} />)}
                {of(blocks, 'AdviceCard').map((b, i) => <AdviceCardView key={i} b={b} />)}
                {of(blocks, 'LocalShopCard').map((b) => <LocalShopCardView key={b.shop.id} b={b} />)}
              </div>
              <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
                {!lg ? null : map ? <NearbyMap block={map} /> : <div className="grid h-[360px] place-items-center rounded-2xl border border-line bg-card text-sm text-muted"><span className="pulse-dot">Scouting around {area.name}…</span></div>}
                {summary && <PlanSummaryView b={summary} onToggle={toggle} ownImage={goalImage} />}
              </aside>
            </div>

            {asks.length > 0 && (
              <div ref={askRef} className="mx-auto mt-10 max-w-3xl space-y-4">
                {asks.map((a, i) => (
                  <div key={i} className="space-y-3">
                    <div className="rise flex justify-end"><div className="max-w-[85%] rounded-3xl rounded-br-md bg-ink px-5 py-3 text-[16px] text-paper">{a.q}</div></div>
                    {a.b ? <AdviceCardView b={a.b} /> : <div className="pulse-dot text-[14px] text-muted">Advisor is checking…</div>}
                  </div>
                ))}
              </div>
            )}

            {guides.length > 0 && (
              <section ref={guidesRef} className="scroll-mt-20 pt-14">
                <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-own">Everything gathered</p>
                <h2 className="mt-2 font-display text-5xl text-ink">Now put it together.</h2>
                {of(guides, 'AssemblyView').map((b, i) => <div key={i} className="mt-6"><AssemblyView block={b} /></div>)}
                <div className="mt-6 grid gap-4 md:grid-cols-2">{of(guides, 'GuideCard').map((b, i) => <GuideCardView key={b.guideId} b={b} idx={i} />)}</div>
              </section>
            )}
          </div>
        )}
        {err && <p className="mx-auto mt-4 max-w-3xl text-sm text-accent">{err}</p>}
      </main>

      <div className="dock-in fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-paper via-paper/85 to-transparent px-4 pb-4 pt-10">
        <div className="mx-auto max-w-2xl">
          <Composer size="dock" onSubmit={onDock} busy={phase === 'intake' || phase === 'planning'} placeholders={phase === 'planned' ? ['Should I buy now or wait?', 'Is something better coming?', 'Does it matter which one I get?', 'Or start another goal…'] : ['Start another goal…', 'Or attach a photo of what you have…']} />
        </div>
      </div>
    </div>
  );
}
