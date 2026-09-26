import { useEffect, useState } from 'react';

type Task = {
  id: string;
  agent: string;
  title: string;
  status: string;
  detail: string | null;
  result: unknown;
  createdAt: string | null;
  updatedAt: string | null;
};

type Shop = {
  id: string;
  name: string;
  category: string;
  area: string | null;
  address: string | null;
  hours: string | null;
  blurb: string | null;
  walkIn: boolean;
  createdAt: string | null;
  products: { title: string; pricePence: number }[];
};

type EventRow = {
  id: number;
  type: string;
  area: string | null;
  label: string | null;
  createdAt: string | null;
};

const COLUMNS = [
  { id: 'queued', label: 'Queued', hint: 'Waiting' },
  { id: 'running', label: 'Running', hint: 'In progress' },
  { id: 'needs_approval', label: 'Needs approval', hint: 'A person decides' },
  { id: 'done', label: 'Done', hint: 'Finished' },
] as const;

const EVENT_LABEL: Record<string, string> = {
  'merchant.onboarded': 'Shop onboarded',
  'goal.created': 'New goal',
  'component.unmet': 'Unmet demand',
  'lead.won': 'Lead won',
  'product.created': 'Product added',
  'listing.created': 'Listing added',
};

function eventLabel(type: string) {
  if (EVENT_LABEL[type]) return EVENT_LABEL[type];
  const words = type.replace(/[._]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const KNOWN = new Set(['queued', 'running', 'needs_approval', 'done', 'failed']);

function inColumn(status: string, column: string) {
  if (column === 'done') return status === 'done' || status === 'failed';
  if (column === 'queued') return status === 'queued' || !KNOWN.has(status);
  return status === column;
}

function ago(iso: string | null) {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function money(pence: number) {
  return pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`;
}

function resultText(result: unknown) {
  return typeof result === 'string' ? result : '';
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(path);
  return res.json() as Promise<T>;
}

export default function Ops() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Ops · Assemble';
  }, []);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const [nextTasks, nextShops, nextEvents] = await Promise.all([
          getJson<Task[]>('/api/ops/tasks'),
          getJson<Shop[]>('/api/ops/merchants'),
          getJson<EventRow[]>('/api/ops/events'),
        ]);
        if (!live) return;
        setTasks(nextTasks);
        setShops(nextShops);
        setEvents(nextEvents);
        setError('');
        setReady(true);
      } catch {
        if (!live) return;
        setError('Reconnecting to the ops API…');
        setReady(true);
      }
    };
    load();
    const timer = setInterval(load, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-dvh px-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
      <header className="sticky top-0 z-10 -mx-4 border-b border-line bg-paper/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm sm:-mx-6 sm:px-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">Assemble</p>
            <h1 className="font-display text-5xl leading-none text-ink sm:text-6xl">Ops</h1>
          </div>
          <p className="mb-1 flex items-center gap-2 text-base text-muted">
            <span className="pulse-dot inline-block h-2.5 w-2.5 rounded-full bg-accent" />
            Live
          </p>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {COLUMNS.map((column) => {
            const count = tasks.filter((task) => inColumn(task.status, column.id)).length;
            return (
              <button
                key={column.id}
                type="button"
                onClick={() => jump(column.id)}
                className="rounded-2xl border border-line bg-card px-1 py-3 text-center shadow-soft"
              >
                <span className="block font-display text-4xl leading-none text-ink sm:text-5xl">{ready ? count : '–'}</span>
                <span className="mt-1 block text-[0.7rem] font-medium uppercase leading-tight tracking-wide text-muted sm:text-xs">
                  {column.id === 'needs_approval' ? 'Approve' : column.label}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {error && (
        <p className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 text-lg text-accent">{error}</p>
      )}

      {!ready ? (
        <p className="mt-10 font-display text-4xl text-ink">Loading the board…</p>
      ) : (
        <main className="mt-6 space-y-10">
          <section>
            <h2 className="font-display text-3xl text-ink">Shops onboarded by bots</h2>
            {shops.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-line bg-card px-4 py-6 text-xl text-muted">
                None yet. A bot can add one from a shop owner’s message.
              </p>
            ) : (
              <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
                {shops.map((shop) => (
                  <article key={shop.id} className="w-[82vw] max-w-sm shrink-0 snap-start rounded-2xl border border-line bg-card p-4 shadow-soft">
                    <p className="text-sm font-medium uppercase tracking-wide text-accent">{shop.category}</p>
                    <h3 className="mt-1 font-display text-3xl leading-tight text-ink">{shop.name}</h3>
                    <p className="mt-1 text-lg text-ink">{[shop.area, shop.hours].filter(Boolean).join(' · ')}</p>
                    {shop.address && <p className="text-base text-muted">{shop.address}</p>}
                    {shop.products.length > 0 && (
                      <ul className="mt-3 space-y-1 text-lg text-ink">
                        {shop.products.slice(0, 3).map((product) => (
                          <li key={`${product.title}-${product.pricePence}`}>{product.title} · {money(product.pricePence)}</li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-3 text-base text-muted">
                      {shop.walkIn ? 'Walk-ins' : 'No walk-ins'}
                      {shop.createdAt ? ` · ${ago(shop.createdAt)}` : ''}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-8">
            {COLUMNS.map((column) => {
              const cards = tasks.filter((task) => inColumn(task.status, column.id));
              return (
                <div key={column.id} id={column.id} className="scroll-mt-56">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-display text-4xl text-ink">{column.label}</h2>
                    <p className="text-base text-muted">{cards.length === 0 ? column.hint : cards.length}</p>
                  </div>
                  {cards.length === 0 ? (
                    <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-5 text-lg text-muted">Nothing here</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {cards.slice(0, 8).map((task) => {
                        const line = resultText(task.result);
                        const approval = task.status === 'needs_approval';
                        const running = task.status === 'running';
                        return (
                          <article
                            key={task.id}
                            className={`rise rounded-2xl border p-4 shadow-soft ${approval ? 'border-accent bg-accent-soft' : running ? 'border-accent bg-card' : 'border-line bg-card'}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-accent">
                                {running && <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-accent" />}
                                {task.agent}
                              </p>
                              <p className="shrink-0 text-base text-muted">{ago(task.updatedAt || task.createdAt)}</p>
                            </div>
                            <h3 className="mt-1 font-display text-2xl leading-tight text-ink sm:text-3xl">{task.title}</h3>
                            {task.status === 'failed' && <p className="mt-1 text-base font-medium text-accent">Failed</p>}
                            {line && <p className="mt-2 font-display text-xl italic leading-snug text-ink">{line}</p>}
                            {task.detail && <p className="mt-2 text-lg leading-snug text-ink">{task.detail}</p>}
                          </article>
                        );
                      })}
                      {cards.length > 8 && <p className="text-lg text-muted">{cards.length - 8} earlier</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <section>
            <h2 className="font-display text-3xl text-ink">Events</h2>
            <p className="text-base text-muted">Last 20</p>
            {events.length === 0 ? (
              <p className="mt-3 text-lg text-muted">No events yet</p>
            ) : (
              <ol className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card px-4 shadow-soft">
                {events.map((event) => (
                  <li key={event.id} className="py-3">
                    <p className="text-sm font-medium uppercase tracking-wide text-accent">{eventLabel(event.type)}</p>
                    <p className="text-xl leading-snug text-ink">{[event.label, event.area].filter(Boolean).join(' · ')}</p>
                    <p className="text-base text-muted">{ago(event.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
