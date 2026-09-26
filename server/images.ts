// Product photos: seed/images.json maps item ids to curated Unsplash/Pexels categories.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'seed', 'images.json');
let cache: { categories: Record<string, { url: string }>; items: Record<string, string> } | null = null;
let loadedAt = 0;

export function imageFor(itemId: string | null | undefined): string | undefined {
  if (!itemId) return undefined;
  if (!cache || Date.now() - loadedAt > 30_000) {
    try { cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; } catch { cache = null; }
    loadedAt = Date.now();
  }
  const cat = cache?.items?.[itemId];
  return cat ? cache?.categories?.[cat]?.url : undefined;
}
