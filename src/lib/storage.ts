import { browser } from 'wxt/browser';
import type { OverrideMode, OverrideStore, Settings } from './state';
import { DEFAULT_SETTINGS, sanitizeSettings } from './state';
import type { QuizStats } from './quiz';
import { EMPTY_STATS } from './quiz';

// ---------- messages ----------

export type Message =
  /** content/popup -> background: the in-memory override for a tab. */
  | { type: 'GET_TAB_OVERRIDE'; tabId?: number }
  /** popup -> background: random pick with a scope. Background picks, stores, applies. */
  | { type: 'RANDOM'; tabId: number; hostname: string; mode: OverrideMode }
  /** popup -> background: clear tab, site and global overrides that affect this tab. */
  | { type: 'CLEAR_OVERRIDES'; tabId: number; hostname: string }
  /** background -> content: swap to this font now. */
  | { type: 'SET_FONT'; fontId: string }
  /** background -> content: re-resolve everything. */
  | { type: 'REFRESH' };

export interface TabOverrideReply {
  fontId: string | null;
}

export interface RandomReply {
  fontId: string;
}

export async function sendMessage<T>(message: Message): Promise<T> {
  return (await browser.runtime.sendMessage(message)) as T;
}

// ---------- settings (storage.sync) ----------

const SETTINGS_KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const data = await browser.storage.sync.get(SETTINGS_KEY);
  return sanitizeSettings(data[SETTINGS_KEY] ?? DEFAULT_SETTINGS);
}

export async function setSettings(settings: Settings): Promise<void> {
  await browser.storage.sync.set({ [SETTINGS_KEY]: settings });
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = sanitizeSettings({ ...(await getSettings()), ...patch });
  await setSettings(next);
  return next;
}

// ---------- local data (storage.local) ----------

interface LocalSchema {
  overrides: OverrideStore;
  recentRandoms: string[];
  quiz: QuizStats;
}

const LOCAL_DEFAULTS: LocalSchema = {
  overrides: { global: null, sites: {} },
  recentRandoms: [],
  quiz: EMPTY_STATS,
};

export async function readLocal<K extends keyof LocalSchema>(key: K): Promise<LocalSchema[K]> {
  const data = await browser.storage.local.get(key);
  return (data[key] as LocalSchema[K] | undefined) ?? LOCAL_DEFAULTS[key];
}

export async function writeLocal<K extends keyof LocalSchema>(
  key: K,
  value: LocalSchema[K],
): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}

export const LOCAL_KEYS: readonly (keyof LocalSchema)[] = ['overrides', 'recentRandoms', 'quiz'];

/** Keep the last N random picks (newest first), used to avoid repeats. */
export const RECENT_RANDOM_LIMIT = 5;

export function pushRecent(recent: readonly string[], fontId: string): string[] {
  return [fontId, ...recent.filter((id) => id !== fontId)].slice(0, RECENT_RANDOM_LIMIT);
}
