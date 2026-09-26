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

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
        <a href="/" className="flex shrink-0 items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-accent" />
          <span className="font-display text-[26px] leading-none text-ink">Assemble</span>
        </a>
        <a href="/owner" className="text-sm text-muted transition hover:text-ink">Overview</a>
      </div>
    </header>
  );
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
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto min-w-0 max-w-3xl px-4 pb-24 pt-12 sm:px-6">
        <h1 className="font-display text-[38px] leading-[1.06] text-ink sm:text-[56px]">Bots</h1>
        <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted" aria-label="Board">
          {COLUMNS.map((column) => (
            <button key={column.id} type="button" onClick={() => jump(column.id)} className="transition hover:text-ink">
              {column.id === 'needs_approval' ? 'Approve' : column.label}
            </button>
          ))}
        </nav>
        {error && <p className="mt-8 text-sm text-accent">{error}</p>}
        {!ready ? (
          <p className="mt-16 text-sm text-muted">Loading the board…</p>
        ) : (
          <div className="mt-16 space-y-20">
            {COLUMNS.map((column) => {
              const cards = tasks.filter((task) => inColumn(task.status, column.id));
              return (
                <section key={column.id} id={column.id} className="scroll-mt-24">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-3xl text-ink">{column.label}</h2>
                    <p className="shrink-0 font-mono text-sm text-muted">{cards.length === 0 ? column.hint : cards.length}</p>
                  </div>
                  {cards.length === 0 ? (
                    <p className="mt-6 text-sm text-muted">Nothing here</p>
                  ) : (
                    <ul className="mt-6 divide-y divide-line border-y border-line">
                      {cards.slice(0, 8).map((task) => {
                        const line = resultText(task.result);
                        return (
                          <li key={task.id} className="rise py-6">
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="min-w-0 break-words text-sm text-muted">{task.agent}</p>
                              <p className="shrink-0 font-mono text-sm text-muted">{ago(task.updatedAt || task.createdAt)}</p>
                            </div>
                            <h3 className="mt-2 break-words font-display text-2xl leading-tight text-ink">{task.title}</h3>
                            {task.status === 'failed' && <p className="mt-2 text-sm text-accent">Failed</p>}
                            {line && <p className="mt-3 break-words text-[15px] leading-relaxed text-ink">{line}</p>}
                            {task.detail && <p className="mt-2 break-words text-sm leading-relaxed text-muted">{task.detail}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {cards.length > 8 && <p className="mt-4 text-sm text-muted">{cards.length - 8} earlier</p>}
                </section>
              );
            })}

            <section>
              <h2 className="font-display text-3xl text-ink">Shops onboarded by bots</h2>
              {shops.length === 0 ? (
                <p className="mt-6 text-sm leading-relaxed text-muted">None yet. A bot can add one from a shop owner’s message.</p>
              ) : (
                <ul className="mt-6 divide-y divide-line border-y border-line">
                  {shops.map((shop) => (
                    <li key={shop.id} className="py-6">
                      <h3 className="break-words font-display text-2xl leading-tight text-ink">{shop.name}</h3>
                      <p className="mt-2 break-words text-sm text-muted">{[shop.category, shop.area, shop.hours].filter(Boolean).join(' · ')}</p>
                      {shop.address && <p className="mt-1 break-words text-sm text-muted">{shop.address}</p>}
                      {shop.products.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm text-ink">
                          {shop.products.slice(0, 3).map((product) => (
                            <li key={`${product.title}-${product.pricePence}`} className="break-words">{product.title} · {money(product.pricePence)}</li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-3 text-sm text-muted">
                        {shop.walkIn ? 'Walk-ins' : 'No walk-ins'}
                        {shop.createdAt ? ` · ${ago(shop.createdAt)}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="font-display text-3xl text-ink">Events</h2>
              <p className="mt-2 text-sm text-muted">Last 20</p>
              {events.length === 0 ? (
                <p className="mt-6 text-sm text-muted">No events yet</p>
              ) : (
                <ol className="mt-6 divide-y divide-line border-y border-line">
                  {events.map((event) => (
                    <li key={event.id} className="py-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 break-words text-sm text-muted">{eventLabel(event.type)}</p>
                        <p className="shrink-0 font-mono text-sm text-faint">{ago(event.createdAt)}</p>
                      </div>
                      <p className="mt-2 break-words text-[15px] text-ink">{[event.label, event.area].filter(Boolean).join(' · ')}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
