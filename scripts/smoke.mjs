// "Did I break anything?" Runs the three golden flows plus the shop/owner APIs and fails loudly.
// Usage: npm run smoke   (BASE defaults to the local dev API on :3001; CI points it at :3000)
const BASE = process.env.BASE || 'http://localhost:3001';
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
let failed = 0;
const ok = (cond, what) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${what}`); if (!cond) failed++; };

for (let i = 0; ; i++) {
  try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {}
  if (i > 40) { console.error(`No server at ${BASE}. Start it with npm run dev.`); process.exit(1); }
  await new Promise((r) => setTimeout(r, 500));
}

const RUNS = [
  ['I want to be Superman for Halloween, £40, by Friday', { owned: ['suit'], skill: 'some' }],
  ['Prototype a self-watering plant pot', { budget: '4000', deadline: '1w', owned: ['none'], skill: 'crafty' }],
  ['Find me shelf organisers for this mess, DIY is fine, under £30', { deadline: '1w', owned: ['none'], skill: 'some' }],
];
for (const [text, answers] of RUNS) {
  console.log(text);
  const r = await post('/api/goals', { text, areaId: 'hackney', userName: 'Smoke' }).then((r) => r.json());
  ok(r.goal?.components?.length >= 2, `goal split into ${r.goal?.components?.length ?? 0} parts`);
  const events = (await (await post(`/api/goals/${r.goal.id}/plan`, { answers })).text()).trim().split('\n').map((l) => JSON.parse(l));
  ok(!events.some((e) => e.t === 'error'), 'plan stream has no errors');
  const blocks = events.filter((e) => e.t === 'blocks').at(-1)?.blocks ?? [];
  for (const type of ['NearbyMap', 'Breakdown', 'CostCompare', 'PlanSummary']) ok(blocks.some((b) => b.type === type), `shows ${type}`);
  const bd = blocks.find((b) => b.type === 'Breakdown');
  ok(bd?.components.every((c) => c.options.length && c.pickId), 'every part has options and a pick');
}

console.log('Shops and owner');
ok(Array.isArray(await fetch(BASE + '/api/briefs').then((r) => r.json())), 'open briefs list');
ok(!!(await fetch(BASE + '/api/owner/overview').then((r) => r.json())).kpis, 'owner overview');

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll good.');
process.exit(failed ? 1 : 0);
