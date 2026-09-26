// Orchestrator: goal text (+ optional image) -> title, components, clarify cards.
// Grok does the understanding; a retrieved house recipe keeps the golden paths stable;
// if the model is missing/slow/wrong, rules produce the same shape.
import { all, J } from '../db';
import { llmJSON } from '../llm';
import { ORCHESTRATOR_SYSTEM, IntakeOut } from '../prompts';
import { TAGS, isTag } from '../../shared/tags';
import type { BlockOf } from '../../shared/genui';

export type Comp = { id: string; name: string; tag: string; tags: string[]; note?: string };
export type Recipe = { id: string; title: string; match: string[]; whole_tag: string | null; components: Comp[] };

export function findRecipe(text: string): Recipe | undefined {
  const s = text.toLowerCase();
  return all<any>('SELECT * FROM recipes')
    .map((r) => ({ ...r, match: J<string[]>(r.match, []), components: J<Comp[]>(r.components, []) }))
    .find((r) => r.match.some((m: string) => s.includes(m.toLowerCase())));
}
export const getRecipe = (id: string | null) =>
  id ? all<any>('SELECT * FROM recipes WHERE id = ?', id).map((r) => ({ ...r, match: J(r.match, []), components: J<Comp[]>(r.components, []) }))[0] as Recipe | undefined : undefined;

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function parseConstraints(text: string) {
  const s = text.toLowerCase();
  const m = s.match(/£\s?(\d+(?:\.\d{1,2})?)/) || s.match(/(\d+)\s?(?:quid|pounds|gbp)\b/);
  const budgetPence = m ? Math.round(parseFloat(m[1]) * 100) : null;
  let deadline: string | null = null;
  if (/\b(today|tonight)\b/.test(s)) deadline = 'today';
  else if (/\btomorrow\b/.test(s)) deadline = 'tomorrow';
  else if (/next week|in a week|this week/.test(s)) deadline = '1w';
  else deadline = DAYS.find((d) => s.includes(d)) ?? null;
  return { budgetPence, deadline };
}

export function deadlineDays(d: string | null | undefined): number {
  if (!d || d === 'any') return 99;
  if (d === 'today') return 0;
  if (d === 'tomorrow') return 1;
  if (d === '1w') return 7;
  if (d === '2w') return 14;
  const i = DAYS.indexOf(d);
  if (i < 0) return 99;
  return (i - new Date().getDay() + 7) % 7 || 7;
}
export function deadlineLabel(d: string | null | undefined) {
  if (!d || d === 'any') return null;
  if (d === '1w') return 'within a week';
  if (d === '2w') return 'within two weeks';
  if (d === 'today' || d === 'tomorrow') return d;
  return d[0].toUpperCase() + d.slice(1);
}

function sanitize(cs: Comp[]): Comp[] {
  return cs.map((c, i) => {
    const tags = (c.tags ?? []).filter(isTag);
    const tag = isTag(c.tag) ? c.tag : tags[0] ?? c.tag;
    return { id: (c.id || `part-${i + 1}`).toLowerCase().replace(/[^a-z0-9-]/g, '-'), name: c.name, tag, tags: tags.filter((t) => t !== tag), note: c.note };
  });
}

const GENERIC = new Set(['costume', 'halloween', 'kids', 'adult', 'red', 'blue', 'yellow', 'black', 'craft', 'party', 'garden', 'electronics']);
export const cleanTitle = (text: string) => {
  const t = text.replace(/^\s*(i('d| would)? (want|need|like|would like|'d like) to|help me|how (do|can) i)\s+(be|make|build|get|create|prototype|find|buy)?\s*(a|an|some|my)?\s*/i, '').replace(/[,.].*$/, '').trim().slice(0, 40);
  return t ? t[0].toUpperCase() + t.slice(1) : 'Your goal';
};

function genericComponents(text: string): Comp[] {
  const s = text.toLowerCase();
  const found = TAGS.filter((t) => new RegExp(`\\b${t}s?\\b`).test(s));
  const tag = found.find((t) => !GENERIC.has(t)) ?? found[0] ?? 'craft';
  return [{ id: 'item', name: cleanTitle(text), tag, tags: found.filter((t) => t !== tag) }];
}

export async function intake(text: string, image?: string) {
  const recipe = findRecipe(text);
  const parsed = parseConstraints(text);
  const ctx = recipe ? `\n\nHOUSE RECIPE "${recipe.title}": ${JSON.stringify(recipe.components)}` : '';
  const userContent = image ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }] : text;
  const out = await llmJSON({
    messages: [{ role: 'system', content: ORCHESTRATOR_SYSTEM + ctx }, { role: 'user', content: userContent }],
    schema: IntakeOut,
    timeoutMs: image ? 14000 : 9000,
    vision: !!image,
  });

  let components: Comp[];
  let title: string;
  if (out) {
    components = sanitize(out.components as Comp[]);
    if (recipe && components.length < 2) components = recipe.components;
    title = out.title;
  } else if (recipe) {
    components = recipe.components;
    title = recipe.title;
  } else {
    components = genericComponents(text);
    title = components[0].name;
  }
  const budgetPence = parsed.budgetPence ?? out?.budgetPence ?? null;
  const deadline = parsed.deadline ?? out?.deadline ?? null;
  const dl = deadlineLabel(deadline);
  const restated =
    (out?.seen ? `${out.seen} ` : '') + (out?.restated ??
    `${title}${budgetPence ? `, under £${budgetPence / 100}` : ''}${dl ? `, by ${dl}` : ''}. I'll check what you own, what neighbours and local shops have, and only then what's new.`);

  const cards: BlockOf<'ClarifyCard'>[] = [];
  if (budgetPence == null)
    cards.push({ type: 'ClarifyCard', key: 'budget', question: "What's your budget?", multi: false, options: [
      { label: 'Under £20', value: '2000' }, { label: 'Under £40', value: '4000' }, { label: 'Under £80', value: '8000' }, { label: 'No limit', value: 'any' }] });
  if (deadline == null)
    cards.push({ type: 'ClarifyCard', key: 'deadline', question: 'When do you need it?', multi: false, options: [
      { label: 'Today', value: 'today' }, { label: 'Tomorrow', value: 'tomorrow' }, { label: 'This week', value: '1w' }, { label: 'No rush', value: 'any' }] });
  if (components.length > 1)
    cards.push({ type: 'ClarifyCard', key: 'owned', question: 'Anything you already have?', multi: true, options: [
      ...components.slice(0, 5).map((c) => ({ label: c.name, value: c.id })), { label: 'Nothing yet', value: 'none' }],
      selected: (out?.owned ?? []).filter((o) => components.some((c) => c.id === o)) });
  if (out?.extraQuestion) cards.push({ ...out.extraQuestion, multi: !!out.extraQuestion.multi });
  cards.push({ type: 'ClarifyCard', key: 'skill', question: 'How hands-on do you want to be?', multi: false, options: [
    { label: 'Buy it ready', value: 'none' }, { label: 'Some glue and scissors', value: 'some' }, { label: 'Love a project', value: 'crafty' }] });

  return { title, restated, recipeId: recipe?.id ?? null, components, budgetPence, deadline, cards: cards.slice(0, 3), by: out ? 'grok' : 'rules' };
}
