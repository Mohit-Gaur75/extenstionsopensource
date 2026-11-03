import { describe, expect, it } from 'vitest';
import { ALL_FONTS } from '../src/lib/fonts';
import { shiftDate, pickFont } from '../src/lib/pick';
import { EMPTY_STATS, accuracy, currentStreak, generateQuiz, recordAnswer } from '../src/lib/quiz';

const fonts = [...ALL_FONTS];

describe('generateQuiz', () => {
  it('always has 4 unique options, one correct, rest from the same category', () => {
    for (let i = 0; i < 120; i++) {
      const date = shiftDate('2026-01-01', i);
      const correct = pickFont(date, 3, fonts);
      const quiz = generateQuiz(date, correct, fonts);
      expect(quiz.options).toHaveLength(4);
      expect(new Set(quiz.options.map((f) => f.id)).size).toBe(4);
      expect(quiz.options.filter((f) => f.id === correct.id)).toHaveLength(1);
      expect(quiz.correctId).toBe(correct.id);
      for (const option of quiz.options) expect(option.category).toBe(correct.category);
    }
  });

  it('is stable for the same date and font', () => {
    const correct = pickFont('2026-06-01', 3, fonts);
    const a = generateQuiz('2026-06-01', correct, fonts).options.map((f) => f.id);
    const b = generateQuiz('2026-06-01', correct, fonts).options.map((f) => f.id);
    expect(a).toEqual(b);
  });

  it('fills from other categories when a category is too small', () => {
    const correct = fonts.find((f) => f.category === 'mono');
    if (!correct) throw new Error('fixture');
    const small = [correct, ...fonts.filter((f) => f.category === 'serif')];
    const quiz = generateQuiz('2026-01-01', correct, small);
    expect(quiz.options).toHaveLength(4);
    expect(quiz.options.filter((f) => f.id === correct.id)).toHaveLength(1);
  });
});

describe('recordAnswer', () => {
  it('builds a streak on consecutive correct days', () => {
    let s = recordAnswer(EMPTY_STATS, '2026-01-01', 'a', 'a');
    s = recordAnswer(s, '2026-01-02', 'b', 'b');
    s = recordAnswer(s, '2026-01-03', 'c', 'c');
    expect(s.streak).toBe(3);
    expect(s.bestStreak).toBe(3);
    expect(s.correct).toBe(3);
    expect(s.played).toBe(3);
  });

  it('resets the streak on a miss but keeps the best', () => {
    let s = recordAnswer(EMPTY_STATS, '2026-01-01', 'a', 'a');
    s = recordAnswer(s, '2026-01-02', 'b', 'b');
    s = recordAnswer(s, '2026-01-03', 'c', 'wrong');
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(2);
    expect(s.lastResult?.correct).toBe(false);
    s = recordAnswer(s, '2026-01-04', 'd', 'd');
    expect(s.streak).toBe(1);
  });

  it('restarts the streak after a skipped day', () => {
    let s = recordAnswer(EMPTY_STATS, '2026-01-01', 'a', 'a');
    s = recordAnswer(s, '2026-01-03', 'c', 'c');
    expect(s.streak).toBe(1);
  });

  it('allows only one scored attempt per day', () => {
    const first = recordAnswer(EMPTY_STATS, '2026-01-01', 'a', 'wrong');
    const second = recordAnswer(first, '2026-01-01', 'a', 'a');
    expect(second).toBe(first);
    expect(second.played).toBe(1);
  });

  it('computes accuracy and the displayed streak', () => {
    expect(accuracy(EMPTY_STATS)).toBe(0);
    let s = recordAnswer(EMPTY_STATS, '2026-01-01', 'a', 'a');
    s = recordAnswer(s, '2026-01-02', 'b', 'x');
    expect(accuracy(s)).toBe(50);
    const ok = recordAnswer(EMPTY_STATS, '2026-01-01', 'a', 'a');
    expect(currentStreak(ok, '2026-01-02')).toBe(1);
    expect(currentStreak(ok, '2026-01-03')).toBe(0);
  });
});
