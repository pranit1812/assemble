// UI Composer: turns agent output into gen-UI blocks from the fixed component set.
// Every block is zod-validated before it leaves the server.
import { all, get, J } from '../db';
import { Block, pounds, type BlockOf, type Option } from '../../shared/genui';
import { deadlineLabel, deadlineDays } from './orchestrator';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSEMBLY_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'seed', 'assembly.json');
function assemblyFor(recipeId: string | null): Block | null {
  if (!recipeId) return null;
  try {
    const spec = JSON.parse(readFileSync(ASSEMBLY_FILE, 'utf8'))[recipeId];
    return spec ? Block.parse({ type: 'AssemblyView', ...spec }) : null;
  } catch (e) { console.warn('[assembly]', (e as Error).message); return null; }
}

type Breakdown = BlockOf<'Breakdown'>;
export type GoalRow = { id: string; title: string; user_name: string | null; area: string; lat: number; lng: number; budget_pence: number | null; deadline: string | null; recipe_id: string | null };

const pickOf = (c: Breakdown['components'][number]) => c.options.find((o) => o.id === c.pickId) ?? null;
const sum = (os: (Option | null | undefined)[], f: (o: Option) => number) => os.reduce((s, o) => s + (o ? f(o) : 0), 0);

export function compose(goal: GoalRow, bd: Breakdown, acquired: Record<string, boolean>, note: BlockOf<'AgentNote'> | null, wholeNewPence: number | null, whole?: { title: string; source: string } | null): Block[] {
  const picks = bd.components.map(pickOf);
  const blocks: Block[] = [];
  if (note) blocks.push(note);

  // Map: every secondhand seller and local shop the scouts found.
  const pins = new Map<string, BlockOf<'NearbyMap'>['pins'][number]>();
  for (const c of bd.components)
    for (const o of c.options) {
      if ((o.tag !== 'Secondhand' && o.tag !== 'Local') || o.source.lat == null || o.source.lng == null) continue;
      if ((o.source.distanceKm ?? 0) > 5 && o.id !== c.pickId) continue; // keep the map on the neighbourhood
      const key = `${o.source.name}@${o.source.lat}`;
      const picked = o.id === c.pickId;
      const prev = pins.get(key);
      if (prev && !picked) continue;
      pins.set(key, { id: o.id, lat: o.source.lat, lng: o.source.lng, label: o.source.name, sub: `${o.title} · ${pounds(o.pricePence)}`, tag: o.tag,
        distanceKm: o.source.distanceKm ?? 0, componentId: c.id, picked: picked || prev?.picked });
    }
  blocks.push({ type: 'NearbyMap', center: [goal.lat, goal.lng], areaLabel: goal.area, pins: [...pins.values()] });

  blocks.push(bd);

  // Local shops: where the plan sends you, else the nearest shop that has something.
  const localOpts = bd.components.filter((c) => pickOf(c)?.tag !== 'Own').flatMap((c) => c.options.filter((o) => o.tag === 'Local').map((o) => ({ c, o, picked: o.id === c.pickId })));
  const shopIds = [...new Set(localOpts.filter((x) => x.picked).map((x) => x.o.source.merchantId!))];
  if (!shopIds.length && localOpts.length) shopIds.push([...localOpts].sort((a, b) => (a.o.source.distanceKm ?? 9) - (b.o.source.distanceKm ?? 9))[0].o.source.merchantId!);
  for (const sid of shopIds.slice(0, 2)) {
    const m = get<any>('SELECT * FROM merchants WHERE id = ?', sid);
    if (!m) continue;
    const items = localOpts.filter((x) => x.o.source.merchantId === sid && (x.picked || !shopIds.length || true)).map((x) => ({ componentId: x.c.id, title: x.o.title, pricePence: x.o.pricePence, image: x.o.image }));
    const seen = new Set<string>();
    const uniq = items.filter((i) => (seen.has(i.title) ? false : (seen.add(i.title), true)));
    const when = deadlineDays(goal.deadline) <= 1 ? 'today' : 'this week';
    blocks.push({ type: 'LocalShopCard',
      shop: { id: m.id, name: m.name, address: m.address ?? '', area: m.area ?? '', distanceKm: localOpts.find((x) => x.o.source.merchantId === sid)?.o.source.distanceKm ?? 0,
        hours: m.hours ?? '', walkIn: !!m.walk_in, email: m.email ?? '' },
      items: uniq,
      message: { to: m.email ?? '', subject: `Do you have these in stock? (${goal.title})`,
        body: `Hi ${m.name},\n\nI'm putting together a ${goal.title.toLowerCase()} and saw you might have:\n${uniq.map((i) => `- ${i.title} (${pounds(i.pricePence)})`).join('\n')}\n\nCould you let me know if they're in stock? I can pop in ${when}.\n\nThanks,\n${goal.user_name || 'A neighbour'} (via Assemble)` } });
  }

  // Cost comparison.
  const firstOf = (tagOrder: Option['tag'][]) => bd.components.map((c) => tagOrder.map((t) => c.options.find((o) => o.tag === t)).find(Boolean) ?? c.options[0] ?? null);
  const diy = firstOf(['Own', 'DIY', 'Parts', 'Secondhand', 'Local', 'New']);
  const nu = firstOf(['New', 'Parts', 'Local']);
  const row = (label: string, os: (Option | null)[], extra: Partial<BlockOf<'CostCompare'>['rows'][number]> = {}) => ({
    label, totalPence: sum(os, (o) => o.pricePence), effortMins: sum(os, (o) => o.effortMins), etaDays: Math.max(0, ...os.map((o) => o?.etaDays ?? 0)),
    newItems: os.filter((o) => o && (o.tag === 'New' || o.tag === 'Parts' || o.tag === 'Local')).length, ...extra });
  const allNew = row('All new', nu);
  if (wholeNewPence != null && wholeNewPence < allNew.totalPence) Object.assign(allNew, { label: 'Buy it boxed', totalPence: wholeNewPence, effortMins: 5, newItems: 1, etaDays: Math.max(2, allNew.etaDays), ...(whole ? { item: whole } : {}) });
  blocks.push({ type: 'CostCompare', budgetPence: goal.budget_pence, rows: [row('Make it all', diy), row('Mindful mix', picks, { highlight: true }), allNew] });

  blocks.push({ type: 'PlanSummary', goalId: goal.id, title: goal.title, budgetPence: goal.budget_pence, deadline: deadlineLabel(goal.deadline),
    items: bd.components.flatMap((c, i) => (picks[i] ? [{ componentId: c.id, name: c.name, tag: picks[i]!.tag, title: picks[i]!.title, pricePence: picks[i]!.pricePence, acquired: !!acquired[c.id], image: picks[i]!.image }] : [])) });

  return blocks.map((b) => Block.parse(b));
}

export function guidesFor(goal: GoalRow, bd: Breakdown): Block[] {
  const out: Block[] = [];
  const asm = assemblyFor(goal.recipe_id);
  if (asm) out.push(asm);
  const seen = new Set<string>();
  for (const c of bd.components) {
    const o = pickOf(c);
    const tag = get<any>('SELECT tag FROM components WHERE goal_id = ? AND id = ?', goal.id, c.id)?.tag;
    const gid = o?.guideId ?? (o?.tag === 'Parts' && tag ? all<any>(`SELECT id FROM guides WHERE EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?) ORDER BY minutes LIMIT 1`, tag)[0]?.id : undefined);
    if (!gid || seen.has(gid)) continue;
    seen.add(gid);
    const g = get<any>('SELECT g.*, m.name AS mname FROM guides g LEFT JOIN merchants m ON m.id = g.merchant_id WHERE g.id = ?', gid);
    if (g) out.push({ type: 'GuideCard', guideId: g.id, title: g.title, author: g.mname ?? 'Community', minutes: g.minutes, difficulty: g.difficulty, materials: J(g.materials, []), steps: J(g.steps, []), componentId: c.id });
  }
  const final = FINAL_STEPS[goal.recipe_id ?? ''] ?? [`Lay out all ${bd.components.length} parts and check each one against your plan.`, 'Do the messy steps first (glue, paint) and let them dry.', 'Put it together, test it, and adjust.', 'Anything left over? List it on Assemble for a neighbour.'];
  out.push({ type: 'GuideCard', guideId: `final:${goal.id}`, title: `Put your ${goal.title.toLowerCase()} together`, author: 'Assemble', minutes: 20, difficulty: 'easy', materials: bd.components.map((c) => c.name), steps: final });
  return out.map((b) => Block.parse(b));
}

const FINAL_STEPS: Record<string, string[]> = {
  superman: ['Put on the blue top and leggings.', 'Fix the emblem to the centre of the chest (iron-on or fabric glue, let it set 10 min).', 'Pin or velcro the cape to both shoulders so it hangs to the back of the knees.', 'Fasten the yellow belt at the waist.', 'Slip on the red boot covers last. Stand tall, hands on hips.'],
  plantpot: ['Fill the reservoir with water to just below the top.', 'Thread the wick through the base of the inner pot so 5 cm hangs below.', 'Add potting mix to the inner pot, packing it lightly around the wick, and plant.', 'Seat the inner pot on the reservoir; the wick should touch the bottom.', 'Drop the float into the fill tube, push the moisture sensor into the soil, and power the ESP32 over USB.'],
};
