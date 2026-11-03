import { describe, expect, it } from 'vitest';
import { ALL_FONTS, CATEGORIES, parseFonts } from '../src/lib/fonts';
import type { Font } from '../src/lib/fonts';
import { mulberry32, pickDaily, pickFont, pickRandom, shiftDate, toISODate } from '../src/lib/pick';

const fonts = [...ALL_FONTS];

function days(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftDate(start, i));
}

describe('fonts.json', () => {
  it('has 30-40 valid fonts with unique ids', () => {
    expect(fonts.length).toBeGreaterThanOrEqual(30);
    expect(fonts.length).toBeLessThanOrEqual(40);
    expect(new Set(fonts.map((f) => f.id)).size).toBe(fonts.length);
    expect(() => parseFonts(fonts)).not.toThrow();
  });

  it('has at least four fonts per category (quiz needs three distractors)', () => {
    for (const category of CATEGORIES) {
      expect(fonts.filter((f) => f.category === category).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('has fonts at every level', () => {
    for (const level of [1, 2, 3]) {
      expect(fonts.some((f) => f.cursedLevel === level)).toBe(true);
    }
  });
});

describe('mulberry32', () => {
  it('is reproducible and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('dates', () => {
  it('shifts across month and year boundaries', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('pickFont', () => {
  it('is deterministic for the same date, level and list', () => {
    for (const date of days('2026-01-01', 30)) {
      for (const level of [1, 2, 3] as const) {
        expect(pickFont(date, level, fonts).id).toBe(pickFont(date, level, fonts).id);
      }
    }
  });

  it('does not depend on the order of the font list', () => {
    const reversed = [...fonts].reverse();
    for (const date of days('2026-05-01', 20)) {
      expect(pickFont(date, 3, reversed).id).toBe(pickFont(date, 3, fonts).id);
    }
  });

  it("never returns yesterday's font", () => {
    for (const level of [1, 2, 3] as const) {
      const all = days('2026-01-01', 400);
      let previous = pickFont(shiftDate(all[0] as string, -1), level, fonts);
      for (const date of all) {
        const today = pickFont(date, level, fonts);
        expect(today.id).not.toBe(previous.id);
        previous = today;
      }
    }
  });

  it('honors an explicit prevId', () => {
    const date = '2026-02-02';
    const first = pickFont(date, 3, fonts);
    expect(pickFont(date, 3, fonts, first.id).id).not.toBe(first.id);
  });

  it('respects level: never picks a font above the level', () => {
    for (const date of days('2026-01-01', 200)) {
      expect(pickFont(date, 1, fonts).cursedLevel).toBeLessThanOrEqual(1);
      expect(pickFont(date, 2, fonts).cursedLevel).toBeLessThanOrEqual(2);
    }
  });

  it('varies across days', () => {
    const picks = new Set(days('2026-01-01', 60).map((d) => pickFont(d, 3, fonts).id));
    expect(picks.size).toBeGreaterThan(10);
  });

  it('works with a one-font pool', () => {
    const only = fonts.slice(0, 1);
    expect(pickFont('2026-01-01', 3, only).id).toBe(only[0]?.id);
  });

  it('throws on an empty list', () => {
    expect(() => pickFont('2026-01-01', 1, [])).toThrow();
  });
});

describe('pickDaily', () => {
  it('applies dyslexia-safe and category filters', () => {
    for (const date of days('2026-01-01', 60)) {
      expect(pickDaily(date, 3, fonts, { dyslexiaSafe: true }).dyslexiaSafe).toBe(true);
      expect(pickDaily(date, 3, fonts, { categories: ['mono'] }).category).toBe('mono');
    }
  });
});

describe('pickRandom', () => {
  const seeded = (seed: number) => mulberry32(seed);

  it('never returns an excluded or recent font', () => {
    const rng = seeded(1);
    const exclude = fonts.slice(0, 6).map((f) => f.id);
    for (let i = 0; i < 300; i++) {
      expect(exclude).not.toContain(pickRandom(exclude, 3, fonts, {}, rng).id);
    }
  });

  it('respects level', () => {
    const rng = seeded(2);
    for (let i = 0; i < 200; i++) {
      expect(pickRandom([], 1, fonts, {}, rng).cursedLevel).toBe(1);
    }
  });

  it('respects category filters', () => {
    const rng = seeded(3);
    for (let i = 0; i < 200; i++) {
      const f = pickRandom([], 3, fonts, { categories: ['blackletter', 'mono'] }, rng);
      expect(['blackletter', 'mono']).toContain(f.category);
    }
  });

  it('respects dyslexia-safe mode', () => {
    const rng = seeded(4);
    for (let i = 0; i < 200; i++) {
      expect(pickRandom([], 3, fonts, { dyslexiaSafe: true }, rng).dyslexiaSafe).toBe(true);
    }
  });

  it('drops the oldest recents, never the current font, when the pool is small', () => {
    const safe = fonts.filter((f) => f.dyslexiaSafe && f.cursedLevel <= 1);
    expect(safe.length).toBe(2);
    const [current, other] = safe as [Font, Font];
    const rng = seeded(5);
    for (let i = 0; i < 50; i++) {
      const picked = pickRandom([current.id, other.id], 1, fonts, { dyslexiaSafe: true }, rng);
      expect(picked.id).toBe(other.id);
    }
  });

  it('falls back instead of failing when filters match nothing', () => {
    const oneCategory = fonts.filter((f) => f.category === 'serif');
    expect(pickRandom([], 3, oneCategory, { categories: ['mono'] }).category).toBe('serif');
  });
});
