import type { Block, PlanEvent } from '@shared/genui';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  return res.json();
}
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export type Offer = { id: string; componentId: string; merchant: string; title: string; productId: string; pricePence: number; note: string; address: string; distanceKm: number | null; createdAt: string };
export type GoalInfo = { id: string; title: string; by: string; components: { id: string; name: string }[] };

export const api = {
  intake: (text: string, areaId: string, image?: string, userName?: string) => post('/api/goals', { text, areaId, image, userName }).then((r) => j<{ goal: GoalInfo; blocks: Block[] }>(r)),
  pick: (gid: string, componentId: string, optionId: string) => post(`/api/goals/${gid}/pick`, { componentId, optionId }).then((r) => j<{ blocks: Block[] }>(r)),
  acquire: (gid: string, componentId: string, acquired: boolean) => post(`/api/goals/${gid}/acquire`, { componentId, acquired }).then((r) => j<{ blocks: Block[]; allAcquired: boolean }>(r)),
  assembly: (gid: string) => fetch(`/api/goals/${gid}/assembly`).then((r) => j<{ blocks: Block[] }>(r)),
  vision: (gid: string) => fetch(`/api/vision/goal/${gid}`).then((r) => j<{ status: string; seen?: string; owned?: string[] }>(r)),
  ask: (gid: string, question: string) => post(`/api/goals/${gid}/ask`, { question }).then((r) => j<{ block: Block }>(r)),
  offers: (gid: string) => fetch(`/api/goals/${gid}/offers`).then((r) => j<Offer[]>(r)),
  rescout: (gid: string, componentId: string, pickId?: string) => post(`/api/goals/${gid}/rescout`, { componentId, pickId }).then((r) => j<{ blocks: Block[] }>(r)),
  nearby: (areaId: string) => fetch(`/api/nearby?area=${areaId}`).then((r) => j<{ area: string; shops: number; listings: number }>(r)),

  // NDJSON stream. Scout events are paced on the client so the board animates
  // even if a proxy buffers the whole response.
  async plan(gid: string, answers: Record<string, string | string[]>, onEvent: (e: PlanEvent) => void) {
    const res = await post(`/api/goals/${gid}/plan`, { answers });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let last = 0;
    const pace = async (e: PlanEvent) => {
      const gap = e.t === 'scout' ? 28 : e.t === 'blocks' ? 350 : 120;
      const wait = last + gap - performance.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = performance.now();
      onEvent(e);
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) await pace(JSON.parse(line));
      }
    }
    if (buf.trim()) await pace(JSON.parse(buf));
  },
};
