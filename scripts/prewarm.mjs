// Run the golden prompts once so every LLM answer is cached (instant, identical on stage).
// Usage: BASE=https://your-vm node scripts/prewarm.mjs   (default http://localhost:3000)
const BASE = process.env.BASE || `http://localhost:${process.env.PORT || 3000}`;
const RUNS = [
  ['I want to be Superman for Halloween, £40, by Friday', { owned: ['suit'], skill: 'some' }],
  ['Prototype a self-watering plant pot', { budget: '4000', deadline: '1w', owned: ['none'], skill: 'crafty' }],
  ['Find me shelf organisers for this mess, DIY is fine, under £30', { deadline: '1w', owned: ['none'], skill: 'some' }],
];
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
for (const [text, answers] of RUNS) {
  const t0 = Date.now();
  const r = await post('/api/goals', { text, areaId: 'hackney', userName: 'Pranit' }).then((r) => r.json());
  await (await post(`/api/goals/${r.goal.id}/plan`, { answers })).text();
  console.log(`${r.goal.title.padEnd(26)} ${r.goal.by.padEnd(6)} ${Date.now() - t0} ms`);
}
console.log('done');
