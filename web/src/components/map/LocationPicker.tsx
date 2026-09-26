import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AREAS, DEFAULT_AREA, findArea, km, type Area } from '@shared/areas';

const KEY = 'assemble.area';

/** The shopper's saved area (localStorage 'assemble.area'), or Hackney. */
export function loadArea(): Area {
  try {
    const id = localStorage.getItem(KEY);
    return (id && AREAS.find((a) => a.id === id)) || DEFAULT_AREA;
  } catch {
    return DEFAULT_AREA;
  }
}

function saveArea(a: Area) {
  try {
    localStorage.setItem(KEY, a.id);
  } catch {
    /* private mode etc: ignore */
  }
}

function nearestArea(lat: number, lng: number): Area {
  let best = DEFAULT_AREA;
  let bestKm = Infinity;
  for (const a of AREAS) {
    const d = km({ lat, lng }, a);
    if (d < bestKm) {
      bestKm = d;
      best = a;
    }
  }
  return best;
}

function filterAreas(q: string): Area[] {
  const s = q.trim().toLowerCase();
  if (!s) return AREAS;
  const compact = s.replace(/\s+/g, '');
  const hits = AREAS.filter((a) => {
    const pc = a.postcode.toLowerCase();
    return (
      a.name.toLowerCase().includes(s) ||
      a.id.includes(s) ||
      pc.startsWith(compact) ||
      compact.startsWith(pc)
    );
  });
  const best = findArea(s);
  if (best) return [best, ...hits.filter((a) => a.id !== best.id)];
  return hits;
}

function PinGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
      <circle cx="8" cy="8" r="2.25" fill="currentColor" />
      <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 .75v2.5M8 12.75v2.5M.75 8h2.5M12.75 8h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function LocationPicker({ value, onChange }: { value: Area; onChange: (a: Area) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [locating, setLocating] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const results = useMemo(() => filterAreas(query), [query]);

  const close = (refocus = true) => {
    setOpen(false);
    setQuery('');
    setActive(0);
    if (refocus) btnRef.current?.focus();
  };

  const choose = (a: Area) => {
    saveArea(a);
    onChange(a);
    close();
  };

  // Click outside + Escape close the popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const locateMe = () => {
    const fallback = () => {
      setLocating(false);
      choose(DEFAULT_AREA);
    };
    if (typeof navigator === 'undefined' || !navigator.geolocation) return fallback();
    setLocating(true);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          choose(nearestArea(pos.coords.latitude, pos.coords.longitude));
        },
        fallback,
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
      );
    } catch {
      fallback();
    }
  };

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const a = results[active];
      if (a) choose(a);
    }
  };

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink shadow-soft transition-colors hover:border-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden>📍</span>
        <span className="font-medium">{value.name}</span>
        <span className="text-faint">·</span>
        <span className="font-mono text-xs text-muted">{value.postcode}</span>
        <svg
          viewBox="0 0 12 12"
          className={`ml-0.5 size-3 text-faint transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose your area"
          className="rise absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-card p-2 shadow-soft"
          style={{ boxShadow: '0 1px 2px rgb(28 25 23 / .04), 0 18px 40px -16px rgb(28 25 23 / .28)' }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Postcode or area"
            aria-label="Postcode or area"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />

          <button
            type="button"
            onClick={locateMe}
            disabled={locating}
            className="mt-1.5 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-accent transition-colors hover:bg-accent-soft disabled:cursor-wait disabled:opacity-70"
          >
            <span className={locating ? 'pulse-dot' : ''}>
              <PinGlyph />
            </span>
            {locating ? 'Finding you…' : 'Use my location'}
          </button>

          <div className="mx-3 my-1 h-px bg-line" />

          <ul ref={listRef} id={listId} role="listbox" className="max-h-60 overflow-y-auto overscroll-contain py-0.5">
            {results.length === 0 && (
              <li className="px-3 py-3 text-sm text-muted">
                No match yet. Try an area like <span className="text-ink">Dalston</span> or a postcode like{' '}
                <span className="font-mono text-ink">E8</span>.
              </li>
            )}
            {results.map((a, i) => {
              const current = a.id === value.id;
              return (
                <li
                  key={a.id}
                  id={`${listId}-${a.id}`}
                  data-idx={i}
                  role="option"
                  aria-selected={current}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(a)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
                    i === active ? 'bg-paper' : ''
                  }`}
                >
                  <span className={`flex-1 truncate ${current ? 'font-medium text-ink' : 'text-ink'}`}>{a.name}</span>
                  <span className="font-mono text-xs text-muted">{a.postcode}</span>
                  <span className={`w-3 text-accent ${current ? '' : 'invisible'}`} aria-hidden>
                    ✓
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
