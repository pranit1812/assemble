import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import { ROUTE_ORDER, type BlockOf, type RouteTag } from '@shared/genui';

type Block = BlockOf<'NearbyMap'>;
type Pin = Block['pins'][number];

const ROUTE_COLOR: Record<RouteTag, string> = {
  Own: '#2f6b4f',
  DIY: '#5a7a2e',
  Secondhand: '#a8502a',
  Local: '#b07d12',
  Parts: '#3d5a80',
  New: '#57534e',
};
const ROUTE_LABEL: Record<RouteTag, string> = {
  Own: 'Yours',
  DIY: 'DIY',
  Secondhand: 'Secondhand',
  Local: 'Local shop',
  Parts: 'Parts',
  New: 'New',
};

// NB: CARTO basemaps now answer every keyless request with an "API KEY REQUIRED" tile, so we use
// Esri's Light Gray Canvas (keyless, muted, built to sit under data) plus its label layer.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
const TILES = `${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`;
const LABELS = `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`;
const ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** "0.8 km · 10 min walk" at 5 km/h. */
function walkText(kmAway: number) {
  const d = Number.isFinite(kmAway) ? Math.max(0, kmAway) : 0;
  const mins = Math.max(1, Math.round((d / 5) * 60));
  return `${d.toFixed(1)} km · ${mins} min walk`;
}

const colorOf = (tag: RouteTag) => ROUTE_COLOR[tag] ?? ROUTE_COLOR.New;

function youIcon(areaLabel: string) {
  const label = areaLabel ? `You · ${esc(areaLabel)}` : 'You';
  return L.divIcon({
    className: 'am-icon',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<div class="am-you"><span class="am-you__halo"></span><span class="am-you__ping"></span><span class="am-you__dot"></span><span class="am-you__label">${label}</span></div>`,
  });
}

function pinIcon(p: Pin) {
  const size = p.picked ? 20 : 13;
  const chip = p.picked ? `<span class="am-pin__chip">${esc(p.label)}</span>` : '';
  return L.divIcon({
    className: 'am-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
    html: `<div class="am-pin${p.picked ? ' am-pin--picked' : ''}" style="--pin:${colorOf(p.tag)}"><span class="am-pin__dot"></span>${chip}</div>`,
  });
}

function popupHtml(p: Pin) {
  return `<div style="--pin:${colorOf(p.tag)}">
    <div class="am-pop__tag">${esc(ROUTE_LABEL[p.tag] ?? p.tag)}${p.picked ? ' · picked' : ''}</div>
    <div class="am-pop__label">${esc(p.label)}</div>
    ${p.sub ? `<div class="am-pop__sub">${esc(p.sub)}</div>` : ''}
    <div class="am-pop__dist">${walkText(p.distanceKm)}</div>
  </div>`;
}

const validPins = (pins: Pin[] | undefined) =>
  (pins ?? []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));

export function NearbyMap({ block, onPinClick }: { block: Block; onPinClick?: (componentId?: string) => void }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const clickRef = useRef(onPinClick);
  clickRef.current = onPinClick;

  const pins = validPins(block?.pins);
  const center: [number, number] =
    block?.center && Number.isFinite(block.center[0]) && Number.isFinite(block.center[1])
      ? block.center
      : [51.545, -0.0553]; // Hackney fallback
  // Only rebuild pins when the content actually changes (not on every parent re-render).
  const sig = JSON.stringify([center, block?.areaLabel, pins]);

  // Create the map once.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const map = L.map(el, {
      center,
      zoom: 14,
      zoomControl: false,
      scrollWheelZoom: false, // never trap page scroll
      dragging: !L.Browser.mobile, // one-finger swipes scroll the page on phones; pinch still zooms
      keyboard: true,
      zoomSnap: 0.25,
      maxZoom: 18,
      minZoom: 10,
    });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxNativeZoom: 16, maxZoom: 18 }).addTo(map);
    L.tileLayer(LABELS, { maxNativeZoom: 16, maxZoom: 18 }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;

    // Keep Leaflet in sync with the container size (tabs, accordions, breakpoint changes).
    let wasEmpty = el.clientWidth === 0 || el.clientHeight === 0;
    const ro = new ResizeObserver(() => {
      if (!mapRef.current) return;
      const empty = el.clientWidth === 0 || el.clientHeight === 0;
      map.invalidateSize({ pan: false });
      if (wasEmpty && !empty) fitRef.current?.();
      wasEmpty = empty;
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)draw shopper + pins whenever the block content changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const here = L.latLng(center[0], center[1]);
    L.marker(here, {
      icon: youIcon(block?.areaLabel ?? ''),
      interactive: false,
      keyboard: false,
      zIndexOffset: -1000, // pins always stay visible above the shopper label
    }).addTo(layer);

    // Picked pins drawn last so their label chips sit on top.
    const ordered = [...pins].sort((a, b) => Number(!!a.picked) - Number(!!b.picked));
    for (const p of ordered) {
      const m = L.marker([p.lat, p.lng], {
        icon: pinIcon(p),
        keyboard: true, // focusable; Enter opens the popup
        title: `${p.label}${p.sub ? ` · ${p.sub}` : ''} (${walkText(p.distanceKm)})`,
        riseOnHover: true,
        zIndexOffset: p.picked ? 1000 : 0,
      });
      m.bindPopup(popupHtml(p), {
        className: 'am-popup',
        maxWidth: 240,
        autoPanPadding: [24, 24],
      });
      m.on('click', () => clickRef.current?.(p.componentId));
      // Leaflet 1.9 opens the popup on Enter but does not fire 'click', so mirror it for keyboard users.
      m.on('keypress', (e: L.LeafletKeyboardEvent) => {
        if (e.originalEvent.key === 'Enter' || e.originalEvent.keyCode === 13) clickRef.current?.(p.componentId);
      });
      m.addTo(layer);
    }

    const fit = () => {
      const el = elRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return; // resize observer refits later
      if (!pins.length) {
        map.setView(here, 15, { animate: false });
        return;
      }
      const bounds = L.latLngBounds([here, ...pins.map((p) => L.latLng(p.lat, p.lng))]);
      map.fitBounds(bounds, {
        paddingTopLeft: [36, 56],
        paddingBottomRight: [72, 48],
        maxZoom: 15,
        animate: false,
      });
    };
    fitRef.current = fit;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const maxKm = pins.reduce((m, p) => Math.max(m, Number.isFinite(p.distanceKm) ? p.distanceKm : 0), 0);
  const radius = Math.max(1, Math.ceil(maxKm));
  const countText = pins.length
    ? `${pins.length} ${pins.length === 1 ? 'place' : 'places'} within ${radius} km`
    : 'Nothing nearby yet';
  const tags = ROUTE_ORDER.filter((t) => pins.some((p) => p.tag === t));
  const areaLabel = block?.areaLabel || 'you';

  return (
    <figure
      role="region"
      aria-label={pins.length ? `Map: ${countText} of ${areaLabel}` : `Map around ${areaLabel}`}
      className="relative isolate m-0 h-[280px] overflow-hidden rounded-2xl border border-line bg-paper shadow-soft sm:h-[360px]"
    >
      <div ref={elRef} className="am-map absolute inset-0" aria-label={`Map around ${areaLabel}`} />

      <div className="pointer-events-none absolute left-3 top-3 z-[1000] inline-flex items-center gap-2 rounded-full border border-line bg-card/90 px-3 py-1 text-xs font-medium text-ink shadow-soft backdrop-blur-sm">
        <span className="relative flex size-2">
          <span className="absolute inset-0 rounded-full bg-accent opacity-30" />
          <span className="relative m-auto size-1.5 rounded-full bg-accent" />
        </span>
        {countText}
      </div>

      {tags.length > 0 && (
        <div className="pointer-events-none absolute bottom-4 left-3 z-[1000] flex items-center gap-3 rounded-full border border-line bg-card/90 px-3 py-1 text-[11px] text-muted shadow-soft backdrop-blur-sm">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-full ring-[1.5px] ring-white"
                style={{ background: ROUTE_COLOR[t] }}
                aria-hidden
              />
              {ROUTE_LABEL[t]}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
