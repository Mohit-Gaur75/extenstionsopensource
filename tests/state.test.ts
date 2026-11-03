import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  createOverride,
  hostFromUrl,
  isExpired,
  isSiteEnabled,
  nextMidnight,
  normalizeHost,
  pruneOverrides,
  resolveFont,
  sanitizeSettings,
  toggleSite,
} from '../src/lib/state';
import type { OverrideStore, Settings } from '../src/lib/state';

const NOON = new Date(2026, 10, 3, 12, 0, 0).getTime();

describe('resolveFont order', () => {
  const site = createOverride('site-font', 'site', NOON);
  const global = createOverride('global-font', 'global', NOON);

  it('prefers tab over site, global and daily', () => {
    const r = resolveFont({ dailyId: 'daily', tab: 'tab-font', site, global, now: NOON });
    expect(r).toEqual({ fontId: 'tab-font', source: 'tab' });
  });

  it('prefers site over global and daily', () => {
    expect(resolveFont({ dailyId: 'daily', site, global, now: NOON })).toEqual({
      fontId: 'site-font',
      source: 'site',
    });
  });

  it('prefers global over daily', () => {
    expect(resolveFont({ dailyId: 'daily', global, now: NOON })).toEqual({
      fontId: 'global-font',
      source: 'global',
    });
  });

  it('falls back to daily', () => {
    expect(
      resolveFont({ dailyId: 'daily', tab: null, site: null, global: null, now: NOON }),
    ).toEqual({
      fontId: 'daily',
      source: 'daily',
    });
  });

  it('skips expired overrides and falls through', () => {
    const later = nextMidnight(NOON) + 1;
    expect(resolveFont({ dailyId: 'daily', site, global, now: later }).source).toBe('daily');
  });

  it('skips unknown font ids', () => {
    const r = resolveFont({
      dailyId: 'daily',
      tab: 'gone',
      site,
      global,
      now: NOON,
      isKnown: (id) => id !== 'gone',
    });
    expect(r.source).toBe('site');
  });
});

describe('midnight expiry', () => {
  it('computes the next local midnight', () => {
    const late = new Date(2026, 10, 3, 23, 59, 59).getTime();
    expect(nextMidnight(late)).toBe(new Date(2026, 10, 4, 0, 0, 0).getTime());
    expect(nextMidnight(NOON)).toBe(new Date(2026, 10, 4, 0, 0, 0).getTime());
  });

  it('is strictly after now, even at exactly midnight', () => {
    const midnight = new Date(2026, 10, 4, 0, 0, 0).getTime();
    expect(nextMidnight(midnight)).toBe(new Date(2026, 10, 5, 0, 0, 0).getTime());
  });

  it('expires overrides exactly at local midnight', () => {
    const o = createOverride('x', 'global', NOON);
    const midnight = new Date(2026, 10, 4, 0, 0, 0).getTime();
    expect(isExpired(o, midnight - 1)).toBe(false);
    expect(isExpired(o, midnight)).toBe(true);
  });

  it('prunes expired site and global overrides, keeps live ones', () => {
    const yesterday = createOverride('old', 'site', NOON - 24 * 3600 * 1000);
    const store: OverrideStore = {
      global: createOverride('g', 'global', NOON - 24 * 3600 * 1000),
      sites: { 'old.com': yesterday, 'new.com': createOverride('n', 'site', NOON) },
    };
    const pruned = pruneOverrides(store, NOON);
    expect(pruned.global).toBeNull();
    expect(Object.keys(pruned.sites)).toEqual(['new.com']);
  });

  it('returns the same object when nothing expired', () => {
    const store: OverrideStore = { global: createOverride('g', 'global', NOON), sites: {} };
    expect(pruneOverrides(store, NOON)).toBe(store);
  });
});

describe('site rules', () => {
  const base: Settings = { ...DEFAULT_SETTINGS };

  it('normalizes hosts', () => {
    expect(normalizeHost(' WWW.Example.COM ')).toBe('example.com');
    expect(hostFromUrl('https://www.example.com/a?b')).toBe('example.com');
    expect(hostFromUrl('chrome://extensions')).toBeNull();
  });

  it('blocklist blocks the host and its subdomains', () => {
    const s = { ...base, blocklist: ['example.com'] };
    expect(isSiteEnabled(s, 'example.com')).toBe(false);
    expect(isSiteEnabled(s, 'docs.example.com')).toBe(false);
    expect(isSiteEnabled(s, 'notexample.com')).toBe(true);
  });

  it('allowlist mode only enables listed hosts', () => {
    const s: Settings = { ...base, listMode: 'allowlist', allowlist: ['a.com'] };
    expect(isSiteEnabled(s, 'a.com')).toBe(true);
    expect(isSiteEnabled(s, 'b.com')).toBe(false);
  });

  it('master switch disables everything', () => {
    expect(isSiteEnabled({ ...base, enabled: false }, 'a.com')).toBe(false);
  });

  it('toggleSite adds then removes the host', () => {
    const once = toggleSite(base, 'www.a.com');
    expect(once.blocklist).toEqual(['a.com']);
    expect(toggleSite(once, 'a.com').blocklist).toEqual([]);
  });
});

describe('sanitizeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
  });

  it('drops invalid values and keeps valid ones', () => {
    const s = sanitizeSettings({
      level: 9,
      categories: ['mono', 'bogus'],
      dyslexiaSafe: true,
      blocklist: ['A.com', 'a.com', 5, ''],
      listMode: 'allowlist',
    });
    expect(s.level).toBe(DEFAULT_SETTINGS.level);
    expect(s.categories).toEqual(['mono']);
    expect(s.dyslexiaSafe).toBe(true);
    expect(s.blocklist).toEqual(['a.com']);
    expect(s.listMode).toBe('allowlist');
  });
});
