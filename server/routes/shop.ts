import { Router } from 'express';
import { z } from 'zod';
import { TAGS } from '../../shared/tags';
import { llmJSON, aiName } from '../llm';
import { all, get, run, J, id, logEvent } from '../db';
import { AREAS, DEFAULT_AREA, km } from '../../shared/areas';
import { ROUTE_ORDER, pounds, type BlockOf, type Option, type PlanEvent } from '../../shared/genui';
import { intake, deadlineDays, getRecipe, parseConstraints } from '../agents/orchestrator';

const STOP = new Set(['and', 'the', 'for', 'with', 'your', 'set', 'kit', 'pack', 'new', 'old', 'small', 'large', 'big']);
const stems = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(es|s)$/, ''));
const fits = (part: string, title: string) => { const want = new Set(stems(part)); return stems(title).some((w) => want.has(w)); };

const COLOURS = new Set(['blue', 'yellow', 'black', 'white', 'green', 'purple', 'orange', 'pink', 'brown', 'grey', 'gray']);
import { SCOUTS, wholeProduct, type ScoutCtx } from '../agents/scouts';
import { score, rank, pickPlan, judgeWhys } from '../agents/judge';
import { compose, guidesFor, type GoalRow } from '../agents/composer';
import { queueRecipe } from './recipes';
import { queueVision } from './vision';
import { webScout, hasWeb } from '../agents/web';
import { advise } from '../agents/advisor';
import { offersForGoal } from './bridge';
import { FOLLOWUP_SYSTEM, FollowupOut } from '../prompts';
import { triggerBot } from '../trigger';

export const shopRouter = Router();

type State = { bd: BlockOf<'Breakdown'>; note: BlockOf<'AgentNote'> | null; wholeNewPence: number | null; whole?: { title: string; source: string } | null; advice?: BlockOf<'AdviceCard'> | null };

// Compose the plan and slot the Advisor's card in after the cost comparison.
function render(goal: GoalRow, st: State, acquired: Record<string, boolean>) {
  const blocks = compose(goal, st.bd, acquired, st.note, st.wholeNewPence, st.whole);
  if (st.advice) blocks.splice(blocks.findIndex((b) => b.type === 'CostCompare') + 1, 0, st.advice);
  return blocks;
}

export function track(agent: string, title: string, detail = '', status = 'done') {
  run('INSERT INTO tasks (id, agent, title, status, detail) VALUES (?,?,?,?,?)', id('t'), agent, title, status, detail);
}

const loadGoal = (gid: string) => get<GoalRow & { blocks: string | null; status: string }>('SELECT * FROM goals WHERE id = ?', gid);
const acquiredMap = (gid: string) => Object.fromEntries(all<any>('SELECT id, acquired FROM components WHERE goal_id = ?', gid).map((c) => [c.id, !!c.acquired]));

function composed(goal: GoalRow & { blocks: string | null }) {
  const st = J<State | null>(goal.blocks, null);
  return st ? render(goal, st, acquiredMap(goal.id)) : [];
}

shopRouter.post('/goals', async (req, res) => {
  const { text = '', image, userName, areaId } = req.body ?? {};
  if (image && (typeof image !== 'string' || !image.startsWith('data:image/') || image.length > 6_000_000)) return void res.status(400).json({ error: 'Image must be a photo under ~4MB' });
  if (!String(text).trim() && !image) return void res.status(400).json({ error: 'Tell me a goal' });
  // Long text would flood the owner and bot pages; real goals are a sentence or two.
  if (String(text).length > 600 || String(userName ?? '').length > 60) return void res.status(400).json({ error: 'Keep it under 600 characters' });
  const area = AREAS.find((a) => a.id === areaId) ?? DEFAULT_AREA;
  const r = await intake(String(text).trim() || 'Help me make what is in this photo', image);
  const gid = id('g');
  run('INSERT INTO goals (id, user_name, text, title, recipe_id, area, lat, lng, budget_pence, deadline) VALUES (?,?,?,?,?,?,?,?,?,?)',
    gid, userName ?? null, text, r.title, r.recipeId, area.name, area.lat, area.lng, r.budgetPence, r.deadline);
  for (const c of r.components) run('INSERT INTO components (id, goal_id, name, tag, tags) VALUES (?,?,?,?,?)', c.id, gid, c.name, c.tag, JSON.stringify(c.tags));
  logEvent('goal.created', r.title, area.name);
  if (image) queueVision(gid, image, String(text).trim(), r.components.map(({ id, name }) => ({ id, name })));
  if (!r.recipeId && r.by !== 'grok') queueRecipe(String(text).trim(), area.name);
  track('Orchestrator', `Understood "${r.title}"`, `${r.components.length} parts · ${r.by === 'grok' ? aiName() : 'house recipe'} · ${area.name}`);
  res.json({
    goal: { id: gid, title: r.title, by: r.by, components: r.components.map(({ id, name }) => ({ id, name })) },
    blocks: [{ type: 'AgentNote', agent: 'Orchestrator', text: r.restated }, ...r.cards],
  });
});

shopRouter.post('/goals/:id/plan', async (req, res) => {
  const goal = loadGoal(req.params.id);
  if (!goal) return void res.status(404).json({ error: 'No such goal' });
  const answers: Record<string, string | string[]> = req.body?.answers ?? {};
  const one = (k: string) => (Array.isArray(answers[k]) ? answers[k][0] : (answers[k] as string | undefined));
  const budget = goal.budget_pence ?? (one('budget') && one('budget') !== 'any' ? parseInt(one('budget')!, 10) : null);
  // "Other" answers arrive as free text in <key>_text; read them with rules so any wording works.
  const txt = (k: string) => String(answers[`${k}_text`] ?? '').trim().toLowerCase();
  const deadline = goal.deadline ?? (one('deadline') === 'other' ? parseConstraints(txt('deadline')).deadline
    : one('deadline') && one('deadline') !== 'any' ? one('deadline')! : null);
  const owned = new Set(([] as string[]).concat(answers.owned ?? []).filter((v) => v !== 'none' && v !== 'other'));
  const skill = one('skill') === 'other'
    ? (/buy|ready|no time|busy|lazy/.test(txt('skill')) ? 'none' : /love|project|craft|sew|diy|make|handy|build/.test(txt('skill')) ? 'crafty' : 'some')
    : one('skill') ?? 'some';
  run('UPDATE goals SET answers = ?, budget_pence = ?, deadline = ? WHERE id = ?', JSON.stringify(answers), budget, deadline, goal.id);
  Object.assign(goal, { budget_pence: budget, deadline });

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (ev: PlanEvent) => res.write(JSON.stringify(ev) + '\n');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  try {
    const comps = all<any>('SELECT * FROM components WHERE goal_id = ? ORDER BY rowid', goal.id).map((c) => ({ id: c.id, name: c.name, tag: c.tag, tags: J<string[]>(c.tags, []) }));
    // Answers that are catalogue tags (e.g. 'adult', 'kids', 'black') steer ranking within each route.
    const typed = Object.keys(answers).filter((k) => k.endsWith('_text')).flatMap((k) => txt(k.slice(0, -5)).split(/[^a-z0-9-]+/));
    const prefs = [...Object.values(answers).flat(), ...typed].filter((v): v is string => typeof v === 'string' && (TAGS as readonly string[]).includes(v));
    for (const c of comps) c.tags.push(...prefs.filter((t) => !c.tags.includes(t)));
    // "I already have red boots" → the Boots part counts as owned.
    const ownedText = txt('owned');
    if (ownedText) {
      for (const c of comps)
        if ([c.tag, ...c.name.toLowerCase().split(/[^a-z-]+/)].some((w) => w.length > 3 && !COLOURS.has(w) && ownedText.includes(w.replace(/s$/, '')))) owned.add(c.id);
      run('UPDATE goals SET answers = ? WHERE id = ?', JSON.stringify({ ...answers, owned: [...owned] }), goal.id);
    }
    const x: ScoutCtx = { lat: goal.lat, lng: goal.lng, owned, skill, deadlineDays: deadlineDays(deadline) };
    send({ t: 'status', agent: 'Orchestrator', text: `${comps.length} parts. Sending ${comps.length * ROUTE_ORDER.length} scouts out around ${goal.area}.` });
    send({ t: 'components', components: comps.map(({ id, name, tag }) => ({ id, name, tag })) });

    const results = await Promise.all(comps.map(async (c) => {
      const found = await Promise.all(ROUTE_ORDER.map(async (route, ri) => {
        send({ t: 'scout', componentId: c.id, route, state: 'run', found: 0 });
        await sleep(200 + ri * 90 + Math.random() * 350);
        const opts = SCOUTS[route](c, x);
        send({ t: 'scout', componentId: c.id, route, state: 'done', found: opts.length });
        return opts;
      }));
      // No house recipe means the AI picked the category, so a local option only counts if its name
      // shares a word with the part ("Tap washer" never gets "Plug fuses"). Otherwise: ask shops + web links.
      const opts = goal.recipe_id ? found.flat() : found.flat().filter((o) => o.tag === 'Own' || fits(c.name, o.title));
      return { c, options: rank(opts.map((o) => score(o, x))) };
    }));

    const n = results.reduce((s, r) => s + r.options.length, 0);
    send({ t: 'status', agent: 'Judge', text: `Ranking ${n} options, mindful first. No merchant can pay for a spot.` });
    const picks = pickPlan(results.map((r) => ({ id: r.c.id, options: r.options })), budget);
    const recipe = getRecipe(goal.recipe_id);
    const whole = wholeProduct(recipe?.whole_tag ?? null);

    const bd: BlockOf<'Breakdown'> = { type: 'Breakdown', goal: goal.title, components: results.map(({ c, options }) => {
      // Unmet = nothing ready-made within 3 km (materials to make it yourself don't count).
      const unmet = !options.some((o) => (o.tag === 'Secondhand' || (o.tag === 'Local' && !o.makeIt)) && (o.source.distanceKm ?? 99) <= 3);
      return { id: c.id, name: c.name, options, pickId: picks[c.id], briefOpen: unmet };
    }) };

    // Unmet parts become demand signal + an open brief local merchants can answer.
    for (const c of bd.components.filter((c) => c.briefOpen)) {
      logEvent('component.unmet', c.name, goal.area);
      run('INSERT INTO briefs (id, goal_id, component, tag, area, budget_pence) VALUES (?,?,?,?,?,?)', id('b'), goal.id, c.name, comps.find((k) => k.id === c.id)!.tag, goal.area, null);
      triggerBot('brief', `a shopper near ${goal.area} needs: ${c.name}. Ask nearby shops.`, { goalId: goal.id, part: c.name, area: goal.area });
    }

    const pickOpt = (cid: string) => bd.components.find((c) => c.id === cid)!.options.find((o) => o.id === picks[cid]) ?? null;
    const allNew = bd.components.reduce((s, c) => s + (c.options.find((o) => o.tag === 'New')?.pricePence ?? c.options.find((o) => o.tag === 'Parts')?.pricePence ?? 0), 0);
    // Web scout: public listings (Amazon, eBay, Argos…) for every part, so shoppers can compare. Never ranked above local routes.
    const bare = bd.components;
    if (hasWeb()) send({ t: 'status', agent: 'Web scout', text: `Comparing with Amazon, eBay, Argos and others for ${bare.length} part${bare.length > 1 ? 's' : ''}.` });
    send({ t: 'status', agent: 'Advisor', text: 'Checking whether to buy now or wait.' });
    const [judged, webs, advice] = await Promise.all([
      judgeWhys({ title: goal.title, budgetPence: budget, deadline }, bd.components.map((c) => ({ id: c.id, name: c.name, pick: pickOpt(c.id) })), skill, whole?.price_pence ?? allNew),
      Promise.all(bare.map((c) => { const k = comps.find((x) => x.id === c.id)!; return webScout(c.name, k.tag, k.tags.includes('adult') ? 'adult' : ''); })),
      advise({ question: 'Should I buy this now or wait?', goalTitle: goal.title, deadline, budgetPence: budget,
        picks: bd.components.map((c) => ({ component: c.name, pick: pickOpt(c.id) })), tags: comps.flatMap((c) => [c.tag, ...c.tags]) }).catch(() => null),
    ]);
    bare.forEach((c, i) => { if (webs[i].length) c.web = webs[i]; });
    if (judged) for (const c of bd.components) {
      const w = judged.whys[c.id];
      const o = c.options.find((o) => o.id === c.pickId);
      if (w && o) o.why = w;
    }
    const chosen = bd.components.map((c) => pickOpt(c.id)).filter(Boolean) as Option[];
    const total = chosen.reduce((s, o) => s + o.pricePence, 0);
    const notNew = chosen.filter((o) => ['Own', 'DIY', 'Secondhand'].includes(o.tag)).length;
    const newRef = whole?.price_pence ?? allNew;
    const summary = judged?.summary ?? `${notNew} of ${chosen.length} parts come from what you own, can make, or a neighbour already has. ${pounds(total)} all in, against ${pounds(newRef)} ${whole ? 'for a boxed one' : 'to buy it all new'}${budget ? `, and well inside your ${pounds(budget)}` : ''}.`;
    const note: BlockOf<'AgentNote'> = { type: 'AgentNote', agent: 'Judge', text: summary };

    const state: State = { bd, note, wholeNewPence: whole?.price_pence ?? null, whole: whole ? { title: whole.title, source: whole.mname } : null, advice };
    run("UPDATE goals SET blocks = ?, status = 'planned' WHERE id = ?", JSON.stringify(state), goal.id);
    for (const c of bd.components) run('UPDATE components SET pick = ?, unmet = ? WHERE goal_id = ? AND id = ?', JSON.stringify(pickOpt(c.id)), c.briefOpen ? 1 : 0, goal.id, c.id);
    track('Scouts', `${n} routes for "${goal.title}"`, `${comps.length} parts × ${ROUTE_ORDER.length} routes near ${goal.area}`);
    track('Judge', `Planned "${goal.title}": ${pounds(total)}`, `${notNew}/${chosen.length} without buying new${judged ? ' · Grok whys' : ''}`);
    send({ t: 'blocks', blocks: render(goal, state, {}) });
  } catch (e: any) {
    console.error(e);
    send({ t: 'error', message: e?.message ?? 'Planning failed' });
  }
  res.end();
});

shopRouter.get('/goals/:id', (req, res) => {
  const goal = loadGoal(req.params.id);
  if (!goal) return void res.status(404).json({ error: 'No such goal' });
  res.json({ goal: { id: goal.id, title: goal.title, status: goal.status }, blocks: composed(goal) });
});

shopRouter.post('/goals/:id/pick', (req, res) => {
  const goal = loadGoal(req.params.id);
  const st = J<State | null>(goal?.blocks, null);
  if (!goal || !st) return void res.status(404).json({ error: 'No plan yet' });
  const { componentId, optionId } = req.body ?? {};
  const c = st.bd.components.find((c) => c.id === componentId);
  const o = c?.options.find((o) => o.id === optionId);
  if (!c || !o) return void res.status(400).json({ error: 'Unknown option' });
  c.pickId = o.id;
  run('UPDATE goals SET blocks = ? WHERE id = ?', JSON.stringify(st), goal.id);
  run('UPDATE components SET pick = ? WHERE goal_id = ? AND id = ?', JSON.stringify(o), goal.id, c.id);
  res.json({ blocks: render(goal, st, acquiredMap(goal.id)) });
});

shopRouter.post('/goals/:id/acquire', (req, res) => {
  const goal = loadGoal(req.params.id);
  const st = J<State | null>(goal?.blocks, null);
  if (!goal || !st) return void res.status(404).json({ error: 'No plan yet' });
  const { componentId, acquired } = req.body ?? {};
  run('UPDATE components SET acquired = ? WHERE goal_id = ? AND id = ?', acquired ? 1 : 0, goal.id, componentId);
  const c = st.bd.components.find((c) => c.id === componentId);
  const o = c?.options.find((o) => o.id === c.pickId);
  if (acquired && o?.source.merchantId && (o.tag === 'Local' || o.tag === 'New' || o.tag === 'Parts')) {
    const payload = { event: 'lead.won', goal: goal.title, item: o.title, pricePence: o.pricePence, area: goal.area, at: new Date().toISOString() };
    logEvent('lead.won', o.title, goal.area, o.source.merchantId, payload);
    const hook = get<any>('SELECT webhook_url FROM merchants WHERE id = ?', o.source.merchantId)?.webhook_url;
    if (hook) fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
  }
  const acq = acquiredMap(goal.id);
  const allAcquired = st.bd.components.every((c) => acq[c.id]);
  if (allAcquired) run("UPDATE goals SET status = 'assembled' WHERE id = ?", goal.id);
  res.json({ blocks: render(goal, st, acq), allAcquired });
});

// Follow-up buying questions about a plan: "should I wait?", "does it matter which one?".
const histOf = (h: unknown) => (Array.isArray(h) ? h : []).slice(-4).map((x: any) => ({ q: String(x?.q ?? '').slice(0, 200), a: String(x?.a ?? '').slice(0, 200) }));

// Rules when the model is unavailable: read the message plus the last question for plan changes.
function followupRules(text: string, history: { q: string }[], comps: { id: string; words: string }[]) {
  const t = text.toLowerCase(), ctx = `${history.at(-1)?.q ?? ''} ${text}`.toLowerCase();
  const out: { intent: 'ask' | 'revise' | 'new'; skill?: string; budgetPence?: number; owned?: string[]; boxed?: boolean; reply?: string } = { intent: 'new' };
  const budget = /£\s?(\d+)/.exec(t);
  // "I already have a power bank": match what follows the verb against each part's name and options.
  const obj = /\b(?:have|own|got)\b(.*)$/.exec(t)?.[1] ?? '';
  const objWords = obj.split(/[^a-z]+/).filter((w) => w.length > 3 && !['already', 'some', 'spare', 'that', 'this', 'with'].includes(w));
  const owned = /\bi\b.*\b(have|own|got)\b/.test(t) ? comps.filter((c) => objWords.some((w) => c.words.includes(w))).map((c) => c.id) : [];
  const strong = /prebuilt|pre-built|ready[- ]?made|almost built|no diy|don'?t want to (make|diy)|more diy|\bkit\b|boxed|complete set|cheaper/.test(t) || !!budget || owned.length > 0;
  const weak = /\b(updated?|redo|re-?plan|change it|instead|do that|go with|switch)\b/.test(t);
  if (strong || weak) {
    out.intent = 'revise';
    if (/boxed|complete set|\bkit\b/.test(ctx)) out.boxed = true;
    else if (/prebuilt|pre-built|ready[- ]?made|almost built|buy it|no diy|don'?t want to (make|diy)/.test(ctx)) out.skill = 'none';
    else if (/more diy|myself|diy (it|everything)/.test(ctx)) out.skill = 'crafty';
    if (budget) out.budgetPence = +budget[1] * 100;
    if (owned.length) out.owned = owned;
    out.reply = out.boxed ? 'Showing the complete set.' : out.skill === 'none' ? 'Switching to ready-made parts you can buy today.' : out.skill === 'crafty' ? 'Leaning into DIY.'
      : owned.length ? "Got it, I'll use what you already have." : budget ? `Refitting the plan to ${budget[0]}.` : 'Updating your plan.';
  } else if (/\?\s*$|^(should|is|are|will|would|do|does|can|which|what|how|why)\b|\b(wait|worth|better|newer|matter)\b/.test(t)) out.intent = 'ask';
  return out;
}

shopRouter.post('/goals/:id/followup', async (req, res) => {
  const goal = loadGoal(req.params.id);
  const st = J<State | null>(goal?.blocks, null);
  const text = String(req.body?.text ?? '').trim().slice(0, 300);
  if (!goal || !st || !text) return void res.status(400).json({ error: 'Follow up on a plan' });
  const history = histOf(req.body?.history);
  const answers = J<Record<string, any>>(get<any>('SELECT answers FROM goals WHERE id = ?', goal.id)?.answers, {});
  const comps = st.bd.components.map((c) => ({ id: c.id, words: [c.name, ...c.options.map((o) => o.title)].join(' ').toLowerCase() }));
  const ai = await llmJSON({
    messages: [{ role: 'system', content: FOLLOWUP_SYSTEM }, { role: 'user', content: JSON.stringify({
      message: text, conversation: history, goal: goal.title, answers,
      parts: st.bd.components.map((c) => { const p = c.options.find((o) => o.id === c.pickId); return { id: c.id, name: c.name, pick: p ? `${p.tag}: ${p.title} ${pounds(p.pricePence)}` : 'none nearby' }; }),
    }) }],
    schema: FollowupOut, timeoutMs: 6000,
  });
  const r = ai ?? followupRules(text, history, comps);
  const next = { ...answers };
  if (r.skill) next.skill = r.skill;
  if (r.budgetPence) next.budget = String(r.budgetPence);
  const ownedIds = (r.owned ?? []).filter((id) => comps.some((c) => c.id === id));
  if (ownedIds.length) next.owned = [...new Set([...([] as string[]).concat(answers.owned ?? []).filter((v) => v !== 'none'), ...ownedIds])];
  if (r.budgetPence) run('UPDATE goals SET budget_pence = ? WHERE id = ?', r.budgetPence, goal.id);
  track('Follow-up', `"${text.slice(0, 60)}"`, `${r.intent}${r.skill ? ` · skill ${r.skill}` : ''}${r.boxed ? ' · boxed' : ''} · ${ai ? aiName() : 'rules'}`);
  res.json({ intent: r.intent, answers: next, boxed: !!r.boxed, reply: r.reply ?? '' });
});

shopRouter.post('/goals/:id/ask', async (req, res) => {
  const goal = loadGoal(req.params.id);
  const st = J<State | null>(goal?.blocks, null);
  const question = String(req.body?.question ?? '').trim().slice(0, 300);
  if (!goal || !st || !question) return void res.status(400).json({ error: 'Ask about a plan' });
  const comps = all<any>('SELECT tag, tags FROM components WHERE goal_id = ?', goal.id);
  const history = histOf(req.body?.history);
  const block = await advise({ question, history, goalTitle: goal.title, deadline: goal.deadline, budgetPence: goal.budget_pence,
    picks: st.bd.components.map((c) => ({ component: c.name, pick: c.options.find((o) => o.id === c.pickId) ?? null })),
    tags: comps.flatMap((c) => [c.tag, ...J<string[]>(c.tags, [])]) });
  track('Advisor', `"${question.slice(0, 60)}"`, `${block.verdict} · ${block.by === 'grok' ? aiName() : 'rules'}${block.sources.length ? ` · ${block.sources.length} web sources` : ''}`);
  res.json({ block });
});

// Live offers from shops answering this shopper's briefs.
shopRouter.get('/goals/:id/offers', (req, res) => { res.json(offersForGoal(req.params.id)); });

// Re-run the scouts for one component (e.g. after a shop answered its brief).
shopRouter.post('/goals/:id/rescout', (req, res) => {
  const goal = loadGoal(req.params.id);
  const st = J<State | null>(goal?.blocks, null);
  if (!goal || !st) return void res.status(404).json({ error: 'No plan yet' });
  const row = get<any>('SELECT * FROM components WHERE goal_id = ? AND id = ?', goal.id, req.body?.componentId);
  const c = st.bd.components.find((k) => k.id === row?.id);
  if (!row || !c) return void res.status(400).json({ error: 'Unknown component' });
  const answers = J<Record<string, any>>(get<any>('SELECT answers FROM goals WHERE id = ?', goal.id)?.answers, {});
  const x: ScoutCtx = { lat: goal.lat, lng: goal.lng, owned: new Set(([] as string[]).concat(answers.owned ?? []).filter((v) => v !== 'none')),
    skill: (Array.isArray(answers.skill) ? answers.skill[0] : answers.skill) ?? 'some', deadlineDays: deadlineDays(goal.deadline) };
  const comp = { id: row.id, name: row.name, tag: row.tag, tags: J<string[]>(row.tags, []) };
  const fresh = rank(ROUTE_ORDER.flatMap((r) => SCOUTS[r](comp, x)).map((o) => score(o, x)));
  const keep = c.options.find((o) => o.id === c.pickId);
  c.options = fresh.map((o) => (keep && o.id === keep.id ? { ...o, why: keep.why } : o));
  if (req.body?.pickId && c.options.some((o) => o.id === req.body.pickId)) c.pickId = req.body.pickId;
  else if (!c.options.some((o) => o.id === c.pickId)) c.pickId = c.options[0]?.id ?? null;
  c.briefOpen = false;
  run('UPDATE goals SET blocks = ? WHERE id = ?', JSON.stringify(st), goal.id);
  res.json({ blocks: render(goal, st, acquiredMap(goal.id)) });
});

shopRouter.get('/goals/:id/assembly', (req, res) => {
  const goal = loadGoal(req.params.id);
  const st = J<State | null>(goal?.blocks, null);
  if (!goal || !st) return void res.status(404).json({ error: 'No plan yet' });
  res.json({ blocks: guidesFor(goal, st.bd) });
});

// Landing-page line: what's around the shopper.
shopRouter.get('/nearby', (req, res) => {
  const a = AREAS.find((x) => x.id === req.query.area) ?? DEFAULT_AREA;
  const shops = all<any>("SELECT lat, lng FROM merchants WHERE kind = 'local' AND walk_in = 1 AND lat IS NOT NULL").filter((m) => km(a, m) <= 5).length;
  const listings = all<any>('SELECT lat, lng FROM listings').filter((l) => km(a, l) <= 5).length;
  res.json({ area: a.name, shops, listings });
});

// ---- Neighbours selling: list something, and see what people nearby are looking for.

const TagOut = z.object({ tags: z.array(z.string()).max(6) });
export async function autoTag(title: string, description = '') {
  const s = `${title} ${description}`.toLowerCase().replace(/[^a-z0-9 -]/g, ' ');
  const words = new Set(s.split(/\s+/).flatMap((w) => [w, w.replace(/s$/, '')]));
  const rule = TAGS.filter((t) => words.has(t) || (t.includes('-') && s.includes(t.replace('-', ' '))));
  const ai = await llmJSON({
    messages: [
      { role: 'system', content: `Tag a secondhand item for a local marketplace. Return JSON {"tags": [...]} with 2-6 tags ONLY from: ${TAGS.join(', ')}. Include the tag for what the item IS (e.g. cape, boots, planter) first.` },
      { role: 'user', content: `${title}. ${description}` },
    ],
    schema: TagOut,
    timeoutMs: 6000,
  });
  const tags = [...new Set([...(ai?.tags ?? []).filter((t) => (TAGS as readonly string[]).includes(t)), ...rule])];
  return { tags: tags.length ? tags : ['craft'], by: ai ? 'grok' : 'rules' };
}

shopRouter.get('/wanted', (req, res) => {
  const a = AREAS.find((x) => x.id === req.query.area) ?? DEFAULT_AREA;
  const near = (area: string | null) => { const x = AREAS.find((z) => z.name === area); return !!x && km(a, x) <= 4; };
  const ev = all<any>("SELECT type, label, area FROM events WHERE type IN ('component.unmet','goal.created') AND created_at > datetime('now','-7 days')").filter((e) => near(e.area));
  const count = (type: string) => Object.entries(ev.filter((e) => e.type === type).reduce<Record<string, number>>((m, e) => ((m[e.label] = (m[e.label] ?? 0) + 1), m), {}))
    .sort((x, y) => y[1] - x[1]).slice(0, 6).map(([label, n]) => ({ label, count: n }));
  res.json({ area: a.name, unmet: count('component.unmet'), goals: count('goal.created') });
});

shopRouter.post('/listings', async (req, res) => {
  const { pricePence, areaId, seller, condition, description } = req.body ?? {};
  if (!req.body?.title || typeof req.body.title !== 'string') return void res.status(400).json({ error: 'What are you selling?' });
  // Brand goes in front of the title so shoppers see it ("IKEA Kallax insert"), unless it's already there.
  const brand = typeof req.body.brand === 'string' ? req.body.brand.trim().slice(0, 40) : '';
  const title = brand && !req.body.title.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${req.body.title}` : req.body.title;
  const a = AREAS.find((x) => x.id === areaId) ?? DEFAULT_AREA;
  const { tags, by } = await autoTag(title, description ?? '');
  const lid = id('s');
  const r = 0.004 * Math.sqrt(Math.random()), t = Math.random() * 2 * Math.PI;
  run('INSERT INTO listings (id, title, description, price_pence, tags, condition, seller, area, lat, lng) VALUES (?,?,?,?,?,?,?,?,?,?)',
    lid, title.slice(0, 80), description ?? '', Math.max(0, Math.round(Number(pricePence) || 0)), JSON.stringify(tags), condition || 'good', seller || 'A neighbour', a.name, a.lat + r * Math.cos(t), a.lng + r * Math.sin(t) * 1.6);
  logEvent('listing.created', title, a.name, null, { tags });
  track('Listing agent', `Listed "${title}" in ${a.name}`, `tags: ${tags.join(', ')} · ${by === 'grok' ? aiName() : 'rules'}`);
  res.json({ id: lid, title, tags, area: a.name });
});
