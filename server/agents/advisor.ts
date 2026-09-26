// Advisor: "Should I buy now or wait? Is something better coming? Does it matter?"
// Grok/LLM reasons over the plan + fresh web snippets (Tavily); rules answer if either is missing.
import { llmJSON } from '../llm';
import { ADVISOR_SYSTEM, AdvisorOut } from '../prompts';
import { tavily } from './web';
import { deadlineDays, deadlineLabel } from './orchestrator';
import { pounds, type BlockOf, type Option } from '../../shared/genui';

const TECH = /\b(esp32|arduino|sensor|microcontroller|electronics|usb|led|phone|laptop|tablet|camera|console|headphones|tv|monitor|drill|printer|3d-print)\b/i;
const TIMING = /\b(wait|newer|new model|upgrade|better|replace|release|coming|sale|black friday|next year)\b/i;

export async function advise(o: {
  question: string; goalTitle: string; deadline: string | null; budgetPence: number | null;
  picks: { component: string; pick: Option | null }[]; tags: string[];
}): Promise<BlockOf<'AdviceCard'>> {
  const chosen = o.picks.filter((p) => p.pick);
  const newish = chosen.filter((p) => ['New', 'Parts', 'Local'].includes(p.pick!.tag));
  const tech = TECH.test(`${o.goalTitle} ${o.question} ${o.tags.join(' ')}`);
  const subject = newish.map((p) => p.pick!.title).slice(0, 2).join(', ') || o.goalTitle;

  const snippets = tech || TIMING.test(o.question)
    ? await tavily(`${subject} newer model release OR successor OR price drop 2026`, { max: 4, timeoutMs: 5000 })
    : [];

  const ai = await llmJSON({
    messages: [
      { role: 'system', content: ADVISOR_SYSTEM },
      { role: 'user', content: JSON.stringify({
        question: o.question, goal: o.goalTitle, deadline: deadlineLabel(o.deadline) ?? 'none', budget: o.budgetPence ? pounds(o.budgetPence) : 'none',
        plan: chosen.map((p) => ({ part: p.component, route: p.pick!.tag, item: p.pick!.title, price: pounds(p.pick!.pricePence) })),
        webSnippets: snippets.map((s) => ({ title: s.title, url: s.url, text: s.content.slice(0, 400) })),
      }) },
    ],
    schema: AdvisorOut,
    timeoutMs: 9000,
  });
  if (ai) return { type: 'AdviceCard', question: o.question, ...ai, sources: ai.sources ?? [], upcoming: ai.upcoming ?? null, by: 'grok' };

  // Rules: honest defaults when the model is unavailable.
  const dl = deadlineDays(o.deadline);
  const label = deadlineLabel(o.deadline);
  const reused = chosen.length - newish.length;
  const sources: { title: string; url: string }[] = []; // rules don't read the web, so they cite nothing
  if (!chosen.length)
    return { type: 'AdviceCard', question: o.question, verdict: 'Wait', headline: 'Wait for local offers before buying anything.', by: 'rules', upcoming: null, sources,
      reasons: ["Nothing nearby is listed for this yet, so there's no pick to rush.", 'Shops near you have been asked; their offers appear on this plan.', 'If you need it sooner, compare the online links on each part.'] };
  if (dl <= 14)
    return { type: 'AdviceCard', question: o.question, verdict: 'Buy now', headline: `Buy now: you need it ${label === 'today' || label === 'tomorrow' ? label : `by ${label}`}.`, by: 'rules', upcoming: null, sources,
      reasons: [`Waiting risks missing ${label === 'today' || label === 'tomorrow' ? label : label}.`, `${reused} of ${chosen.length} parts are yours, made or secondhand, so newer versions don't change them.`, newish.length ? `Only ${newish.length} part${newish.length > 1 ? 's are' : ' is'} bought new, and nothing about ${newish.length > 1 ? 'them' : 'it'} improves by waiting.` : 'Nothing here is bought new.'] };
  if (tech)
    return { type: 'AdviceCard', question: o.question, verdict: 'Either is fine', headline: 'For what you want, the exact model barely matters.', by: 'rules', upcoming: null, sources,
      reasons: ['Buy the cheapest version that does the job; you can swap it later.', 'When a newer model lands, the current one usually drops in price.', 'A used or last-generation one is often the smartest middle path.'] };
  return { type: 'AdviceCard', question: o.question, verdict: reused >= newish.length ? 'Buy used' : 'Either is fine', headline: 'Nothing here gets better by waiting.', by: 'rules', upcoming: null, sources,
    reasons: ['These are simple things; newer versions rarely change how they work for you.', 'Secondhand and local options are already in your plan where they fit.'] };
}
