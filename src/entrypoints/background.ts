import { browser } from 'wxt/browser';
import { ALL_FONTS, getFontById } from '@/lib/fonts';
import { pickRandom } from '@/lib/pick';
import {
  createOverride,
  dailyFont,
  hostFromUrl,
  nextMidnight,
  pruneOverrides,
  resolveFont,
  toggleSite,
} from '@/lib/state';
import type { OverrideMode, OverrideStore } from '@/lib/state';
import { getSettings, pushRecent, readLocal, setSettings, writeLocal } from '@/lib/storage';
import type { Message, RandomReply, TabOverrideReply } from '@/lib/storage';

const MIDNIGHT_ALARM = 'cursed-fonts-midnight';
const TAB_STORE_KEY = 'tabOverrides';

export default defineBackground(() => {
  /**
   * Tab overrides live in memory, keyed by tab id. They are mirrored to
   * storage.session (also memory-only, cleared when the browser closes) so they
   * survive the service worker being suspended.
   */
  const tabOverrides = new Map<number, string>();

  const restored = (async () => {
    try {
      const data = await browser.storage.session?.get(TAB_STORE_KEY);
      const saved = data?.[TAB_STORE_KEY] as Record<string, string> | undefined;
      for (const [id, fontId] of Object.entries(saved ?? {})) {
        if (!tabOverrides.has(Number(id))) tabOverrides.set(Number(id), fontId);
      }
    } catch {
      // storage.session unavailable: in-memory only
    }
  })();

  function persistTabs(): void {
    void browser.storage.session
      ?.set({ [TAB_STORE_KEY]: Object.fromEntries(tabOverrides) })
      .catch(() => undefined);
  }

  function tell(tabId: number, message: Message): void {
    browser.tabs.sendMessage(tabId, message).catch(() => undefined); // tab has no content script
  }

  async function notifyAllTabs(message: Message): Promise<void> {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) if (tab.id !== undefined) tell(tab.id, message);
  }

  async function loadOverrides(): Promise<OverrideStore> {
    return pruneOverrides(await readLocal('overrides'), Date.now());
  }

  // ---------- random / clear ----------

  async function applyRandom(
    tabId: number,
    hostname: string,
    mode: OverrideMode,
  ): Promise<RandomReply> {
    await restored;
    const settings = await getSettings();
    const now = Date.now();
    const overrides = await loadOverrides();
    const daily = dailyFont(ALL_FONTS, settings, now);
    const current = resolveFont({
      dailyId: daily.id,
      tab: tabOverrides.get(tabId) ?? null,
      site: overrides.sites[hostname] ?? null,
      global: overrides.global,
      pinned: settings.pinnedSites[hostname] ?? null,
      now,
      isKnown: (id) => getFontById(id) !== undefined,
    });
    const recents = await readLocal('recentRandoms');
    const font = pickRandom(
      [current.fontId, ...recents.filter((id) => id !== current.fontId)],
      settings.level,
      ALL_FONTS,
      { categories: settings.categories, dyslexiaSafe: settings.dyslexiaSafe },
    );

    // Choosing a wider scope clears narrower overrides so the new pick is visible.
    if (mode === 'tab') {
      tabOverrides.set(tabId, font.id);
      persistTabs();
    } else {
      tabOverrides.delete(tabId);
      persistTabs();
      const next: OverrideStore = { global: overrides.global, sites: { ...overrides.sites } };
      if (mode === 'site') {
        next.sites[hostname] = createOverride(font.id, 'site', now);
      } else {
        next.global = createOverride(font.id, 'global', now);
        delete next.sites[hostname];
      }
      await writeLocal('overrides', next);
    }
    await writeLocal('recentRandoms', pushRecent(recents, font.id));
    tell(tabId, { type: 'SET_FONT', fontId: font.id });
    return { fontId: font.id };
  }

  async function clearOverrides(tabId: number, hostname: string): Promise<void> {
    await restored;
    tabOverrides.delete(tabId);
    persistTabs();
    const overrides = await loadOverrides();
    const sites = { ...overrides.sites };
    delete sites[hostname];
    await writeLocal('overrides', { global: null, sites });
    tell(tabId, { type: 'REFRESH' });
  }

  // ---------- messages ----------

  function isMessage(value: unknown): value is Message {
    return typeof value === 'object' && value !== null && 'type' in value;
  }

  async function handle(
    message: Message,
    sender: { tab?: { id?: number } },
  ): Promise<TabOverrideReply | RandomReply | undefined> {
    switch (message.type) {
      case 'GET_TAB_OVERRIDE': {
        await restored;
        const id = message.tabId ?? sender.tab?.id;
        return { fontId: id === undefined ? null : (tabOverrides.get(id) ?? null) };
      }
      case 'RANDOM':
        return applyRandom(message.tabId, message.hostname, message.mode);
      case 'CLEAR_OVERRIDES':
        await clearOverrides(message.tabId, message.hostname);
        return undefined;
      default:
        return undefined;
    }
  }

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isMessage(message)) return false;
    handle(message, sender)
      .then(sendResponse)
      .catch(() => sendResponse(undefined));
    return true; // respond asynchronously
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    if (tabOverrides.delete(tabId)) persistTabs();
  });

  // ---------- midnight alarm ----------

  function scheduleMidnight(): void {
    void browser.alarms.create(MIDNIGHT_ALARM, { when: nextMidnight(Date.now()) });
  }

  async function onMidnight(): Promise<void> {
    const stored = await readLocal('overrides');
    const pruned = pruneOverrides(stored, Date.now());
    if (pruned !== stored) await writeLocal('overrides', pruned);
    scheduleMidnight();
    await notifyAllTabs({ type: 'REFRESH' }); // new day, new daily font
  }

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === MIDNIGHT_ALARM) void onMidnight();
  });

  scheduleMidnight();
  // Purge overrides that expired while the browser was closed.
  void (async () => {
    const stored = await readLocal('overrides');
    const pruned = pruneOverrides(stored, Date.now());
    if (pruned !== stored) await writeLocal('overrides', pruned);
  })();

  // ---------- keyboard shortcuts ----------

  async function activeTab(): Promise<{ id: number; hostname: string } | null> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const hostname = hostFromUrl(tab?.url);
    return tab?.id !== undefined && hostname ? { id: tab.id, hostname } : null;
  }

  browser.commands.onCommand.addListener(async (command) => {
    const tab = await activeTab();
    if (!tab) return;
    if (command === 'random-font') {
      await applyRandom(tab.id, tab.hostname, 'tab');
    } else if (command === 'toggle-site') {
      await setSettings(toggleSite(await getSettings(), tab.hostname));
    }
  });
});
