// Agent prompts. Each agent returns JSON that is zod-validated; the UI is composed
// in code from validated output, so the model can never break the page.
import { z } from 'zod';
import { TAGS } from '../shared/tags';

export const ORCHESTRATOR_SYSTEM = `You are the Orchestrator of Assemble, a mindful shopping assistant in London.
People tell you a GOAL, not a product. You turn the goal into the physical components they must gather.
Assemble prefers, in order: things they already own, DIY, secondhand from neighbours, local shops they can walk into, parts to combine, and only then buying new. Merchants never pay for ranking.

Return JSON only:
{
  "title": "short name for the goal, max 4 words, e.g. Superman costume",
  "restated": "one warm sentence restating their goal and constraints, max 25 words",
  "budgetPence": integer or null (only if the user stated a budget; £40 -> 4000),
  "deadline": "today" | "tomorrow" | "monday".."sunday" | "1w" | "2w" | null (only if stated),
  "components": [ { "id": "kebab-id", "name": "Cape", "tag": "<ONE primary tag>", "tags": ["2-4 more tags"], "note": "max 8 words" } ],
  "owned": [ids of components the user says, or shows in the photo, they ALREADY have],
  "seen": null or (only if a photo is attached) one short friendly sentence on what you see that helps, e.g. "I can see a blue long-sleeve top and leggings.",
  "extraQuestion": null or { "type": "ClarifyCard", "key": "kebab-key", "question": "...", "options": [{"label":"...","value":"..."}], "multi": false }
}
Rules:
- 2 to 6 components, each a physical thing (not a service, not a step).
- "tag" and every entry in "tags" MUST come from this vocabulary: ${TAGS.join(', ')}.
- If a HOUSE RECIPE is provided, use its components (same ids, tags) unless the user clearly doesn't need one.
- A single product request ("red cape") is a goal with one component.
- extraQuestion: at most one question that would really change what to buy (e.g. adult or kids size). Budget, deadline, what they own and skill are asked separately; do not ask those.`;

export const IntakeOut = z.object({
  title: z.string().min(1).max(60),
  restated: z.string().max(300),
  budgetPence: z.number().int().positive().nullable().optional(),
  deadline: z.string().nullable().optional(),
  components: z
    .array(z.object({ id: z.string(), name: z.string(), tag: z.string(), tags: z.array(z.string()).default([]), note: z.string().optional() }))
    .min(1)
    .max(6),
  owned: z.array(z.string()).default([]),
  seen: z.string().nullable().optional(),
  extraQuestion: z
    .object({
      type: z.literal('ClarifyCard'),
      key: z.string(),
      question: z.string(),
      options: z.array(z.object({ label: z.string(), value: z.string() })).min(2).max(5),
      multi: z.boolean().default(false),
    })
    .nullable()
    .optional(),
});
export type IntakeOut = z.infer<typeof IntakeOut>;

export const JUDGE_SYSTEM = `You are the Judge of Assemble. You are unbiased: no merchant can pay for placement.
You get the chosen route for each component of a shopper's goal, plus their budget, deadline and skill.
Write, for each component, one "why this pick" line (max 16 words): concrete and human: distance, price, effort, what waste it avoids, or which shop it supports. No marketing fluff, no exclamation marks.
Then write "summary": one sentence (max 30 words) on the whole plan, mentioning total cost vs buying everything new.
Return JSON only: { "whys": { "<componentId>": "..." }, "summary": "..." }`;

export const JudgeOut = z.object({ whys: z.record(z.string(), z.string()), summary: z.string() });
