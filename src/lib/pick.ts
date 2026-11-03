import type { Font, FontFilter, Level } from './fonts';
import { eligibleFonts, filterByLevel } from './fonts';

export type Rng = () => number;

/** 32-bit FNV-1a hash of a string. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG: returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local calendar date as YYYY-MM-DD. */
export function toISODate(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Shift a YYYY-MM-DD string by whole days using local calendar math. */
export function shiftDate(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  return toISODate(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
}

/** Pool for a level: stable order (sorted by id) so results do not depend on input order. */
function levelPool(fonts: readonly Font[], level: Level): Font[] {
  const byLevel = filterByLevel(fonts, level);
  const pool = byLevel.length > 0 ? byLevel : [...fonts];
  return pool.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const CHAIN_ANCHOR = '2024-01-01';
const MIN_LOOKBACK_DAYS = 60;
const MAX_CHAIN_DAYS = 20000;

function seededPick(dateISO: string, pool: readonly Font[], excludeId?: string): Font {
  const candidates = pool.length > 1 ? pool.filter((f) => f.id !== excludeId) : [...pool];
  const rng = mulberry32(hashString(dateISO));
  const picked = candidates[Math.floor(rng() * candidates.length)];
  if (!picked) throw new Error('pickFont: no fonts available');
  return picked;
}

/**
 * Deterministic daily pick. Same date + level + font list always gives the same
 * font, and the result never equals the previous day's pick.
 * Fonts with cursedLevel above `level` are not eligible.
 * `prevId` overrides the computed yesterday pick (used when it is already known).
 */
export function pickFont(
  dateISO: string,
  level: Level,
  fonts: readonly Font[],
  prevId?: string,
): Font {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error(`pickFont: bad date "${dateISO}"`);
  const pool = levelPool(fonts, level);
  if (pool.length === 0) throw new Error('pickFont: no fonts available');
  if (prevId !== undefined) return seededPick(dateISO, pool, prevId);

  // Each day avoids the previous day's pick, which is computed the same way. To keep
  // that exact for every date, walk forward from a fixed anchor day (about 1000 cheap steps).
  const earliest = shiftDate(dateISO, -MAX_CHAIN_DAYS);
  const candidate = shiftDate(dateISO, -MIN_LOOKBACK_DAYS);
  let day = candidate < CHAIN_ANCHOR ? candidate : CHAIN_ANCHOR;
  if (day < earliest) day = earliest;
  let previous: Font | undefined;
  for (;;) {
    previous = seededPick(day, pool, previous?.id);
    if (day === dateISO) return previous;
    day = shiftDate(day, 1);
  }
}

/** Today's font for the user's settings-derived filter. */
export function pickDaily(
  dateISO: string,
  level: Level,
  fonts: readonly Font[],
  filter: FontFilter = {},
): Font {
  return pickFont(dateISO, level, eligibleFonts(fonts, filter));
}

/**
 * Random pick for the Random button. Respects level, category filters and
 * dyslexia-safe mode. `exclude` lists font ids to avoid: the current font first,
 * then recent picks, newest first. If that leaves nothing, the oldest recents are
 * dropped one by one; the first id (the current font) is avoided whenever possible.
 */
export function pickRandom(
  exclude: readonly string[],
  level: Level,
  fonts: readonly Font[],
  filter: FontFilter = {},
  rng: Rng = Math.random,
): Font {
  const pool = levelPool(eligibleFonts(fonts, filter), level);
  for (let keep = exclude.length; keep >= 1; keep--) {
    const blocked = new Set(exclude.slice(0, keep));
    const candidates = pool.filter((f) => !blocked.has(f.id));
    const picked = candidates[Math.floor(rng() * candidates.length)];
    if (picked) return picked;
  }
  const picked = pool[Math.floor(rng() * pool.length)];
  if (!picked) throw new Error('pickRandom: no fonts available');
  return picked;
}
