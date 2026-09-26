// Judge: scores every option for mindfulness, picks one per component within budget
// and deadline, and (with Grok) rewrites the "why this pick" lines. Merchants cannot
// influence any of this: the score only looks at route, distance, effort and time.
import { llmJSON } from '../llm';
import { JUDGE_SYSTEM, JudgeOut } from '../prompts';
import { ROUTE_ORDER, pounds, type Option } from '../../shared/genui';
import type { ScoutCtx } from './scouts';

const BASE: Record<Option['tag'], number> = { Own: 100, DIY: 88, Secondhand: 80, Local: 70, Parts: 52, New: 28 };

export function score(o: Option, x: ScoutCtx): Option {
  let s = BASE[o.tag];
  let feasible = true;
  let why = o.why;
  if (o.tag === 'DIY' || o.tag === 'Parts' || (o.tag === 'Local' && o.makeIt)) {
    if (x.skill === 'none') { s -= o.tag === 'DIY' ? 45 : 30; why = `You'd rather buy it ready. ${why}`; }
    else if (x.skill === 'some') s -= o.effortMins > 60 ? 18 : o.effortMins > 30 ? 9 : 0;
    else if (x.skill === 'crafty') s += 4;
  }
  const d = o.source.distanceKm ?? 0;
  if (d > 6) s -= 15; else if (d > 3) s -= 7;
  if (o.etaDays > x.deadlineDays) { feasible = false; s -= 40; why = `Misses your deadline. ${why}`; }
  return { ...o, mindful: Math.max(1, Math.min(100, Math.round(s))), feasible, why };
}

export const rank = (opts: Option[]) =>
  [...opts].sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.mindful - a.mindful || a.pricePence - b.pricePence);

type CompOpts = { id: string; options: Option[] };

// Best-scoring pick per component, then trade down the priciest picks until the plan fits the budget.
export function pickPlan(comps: CompOpts[], budgetPence: number | null): Record<string, string | null> {
  const picks: Record<string, Option | null> = {};
  for (const c of comps) picks[c.id] = c.options[0] ?? null;
  const total = () => Object.values(picks).reduce((s, o) => s + (o?.pricePence ?? 0), 0);
  for (let i = 0; budgetPence != null && total() > budgetPence && i < 12; i++) {
    let best: { cid: string; o: Option; gain: number } | null = null;
    for (const c of comps) {
      const cur = picks[c.id];
      if (!cur) continue;
      for (const o of c.options) {
        if (!o.feasible || o.pricePence >= cur.pricePence) continue;
        const gain = (cur.pricePence - o.pricePence) / Math.max(1, cur.mindful - o.mindful + 1);
        if (!best || gain > best.gain) best = { cid: c.id, o, gain };
      }
    }
    if (!best) break;
    picks[best.cid] = best.o;
  }
  return Object.fromEntries(Object.entries(picks).map(([k, v]) => [k, v?.id ?? null]));
}

export async function judgeWhys(
  goal: { title: string; budgetPence: number | null; deadline: string | null },
  comps: { id: string; name: string; pick: Option | null }[],
  skill: string,
  allNewPence: number,
) {
  // Parts nobody nearby has: the honest written summary beats the model's "£0 vs £0".
  if (comps.some((c) => !c.pick)) return { whys: {}, summary: ruleSummary(goal.budgetPence, comps, allNewPence) };
  const out = await llmJSON({
    messages: [
      { role: 'system', content: JUDGE_SYSTEM },
      { role: 'user', content: JSON.stringify({
        goal: goal.title, budget: goal.budgetPence ? pounds(goal.budgetPence) : 'none', deadline: goal.deadline ?? 'none', skill,
        allNewCost: pounds(allNewPence),
        picks: comps.filter((c) => c.pick).map((c) => ({ componentId: c.id, component: c.name, route: c.pick!.tag, item: c.pick!.title,
          price: pounds(c.pick!.pricePence), from: c.pick!.source.name, distanceKm: c.pick!.source.distanceKm, effortMins: c.pick!.effortMins, etaDays: c.pick!.etaDays })),
      }) },
    ],
    schema: JudgeOut,
    timeoutMs: 8000,
  });
  return out ?? { whys: {}, summary: ruleSummary(goal.budgetPence, comps, allNewPence) };
}

// Honest one-liner when the model is unavailable: never claim "inside budget" when it isn't,
// never compare against £0, and say plainly when nothing nearby fits yet.
function ruleSummary(budgetPence: number | null, comps: { pick: Option | null }[], allNewPence: number) {
  const chosen = comps.map((c) => c.pick).filter(Boolean) as Option[];
  const missing = comps.length - chosen.length;
  if (!chosen.length)
    return "Nothing in our local catalogue fits this yet, so I've asked shops near you to reply with offers. Compare the online links meanwhile, or name the exact thing for a sharper plan.";
  const total = chosen.reduce((s, o) => s + o.pricePence, 0);
  const notNew = chosen.filter((o) => ['Own', 'DIY', 'Secondhand'].includes(o.tag)).length;
  const vsNew = allNewPence > total ? `, against ${pounds(allNewPence)} to buy it all new` : '';
  const fit = budgetPence == null ? '' : total <= budgetPence ? `, inside your ${pounds(budgetPence)}` : `, over your ${pounds(budgetPence)}, so swap a pick or two`;
  const gap = missing ? ` ${missing} part${missing > 1 ? 's' : ''} nobody nearby has yet; I've asked local shops.` : '';
  return `${notNew} of ${comps.length} parts come from what you own, can make, or a neighbour already has. ${pounds(total)} all in${vsNew}${fit}.${gap}`;
}

export const routeIndex = (t: Option['tag']) => ROUTE_ORDER.indexOf(t);
