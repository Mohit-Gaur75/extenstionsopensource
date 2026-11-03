import type { Font } from './fonts';
import { hashString, mulberry32, shiftDate } from './pick';
import type { Rng } from './pick';

export const QUIZ_OPTION_COUNT = 4;

export interface Quiz {
  dateISO: string;
  correctId: string;
  /** Exactly four fonts in display order. */
  options: Font[];
}

export interface QuizResult {
  dateISO: string;
  fontId: string;
  guessId: string;
  correct: boolean;
}

export interface QuizStats {
  streak: number;
  bestStreak: number;
  played: number;
  correct: number;
  /** Date of the last scored attempt. */
  lastDate: string | null;
  lastResult: QuizResult | null;
}

export const EMPTY_STATS: QuizStats = {
  streak: 0,
  bestStreak: 0,
  played: 0,
  correct: 0,
  lastDate: null,
  lastResult: null,
};

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/**
 * Build the quiz for a date: the correct font plus three others from the same
 * category. Seeded by date and font, so reopening the popup shows the same quiz.
 * If a category has fewer than three other fonts, other categories fill the gap.
 */
export function generateQuiz(dateISO: string, correct: Font, fonts: readonly Font[]): Quiz {
  const rng = mulberry32(hashString(`${dateISO}:${correct.id}:quiz`));
  const sorted = [...fonts]
    .filter((f) => f.id !== correct.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  const same = shuffle(
    sorted.filter((f) => f.category === correct.category),
    rng,
  );
  const other = shuffle(
    sorted.filter((f) => f.category !== correct.category),
    rng,
  );
  const distractors = [...same, ...other].slice(0, QUIZ_OPTION_COUNT - 1);
  return {
    dateISO,
    correctId: correct.id,
    options: shuffle([correct, ...distractors], rng),
  };
}

/** Record one scored attempt. A miss, or a skipped day, resets the streak. */
export function recordAnswer(
  stats: QuizStats,
  dateISO: string,
  fontId: string,
  guessId: string,
): QuizStats {
  if (stats.lastDate === dateISO) return stats; // one scored attempt per day
  const correct = guessId === fontId;
  const continues = stats.lastDate === shiftDate(dateISO, -1);
  const streak = correct ? (continues ? stats.streak : 0) + 1 : 0;
  return {
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    played: stats.played + 1,
    correct: stats.correct + (correct ? 1 : 0),
    lastDate: dateISO,
    lastResult: { dateISO, fontId, guessId, correct },
  };
}

export function hasPlayedToday(stats: QuizStats, dateISO: string): boolean {
  return stats.lastDate === dateISO;
}

/** Accuracy as a whole percent, 0 when nothing has been played. */
export function accuracy(stats: QuizStats): number {
  return stats.played === 0 ? 0 : Math.round((stats.correct / stats.played) * 100);
}

/** The streak to display: it is already broken if yesterday was missed. */
export function currentStreak(stats: QuizStats, todayISO: string): number {
  if (stats.lastDate === todayISO || stats.lastDate === shiftDate(todayISO, -1))
    return stats.streak;
  return 0;
}

export function revealLine(font: Font): string {
  return `${font.name}: ${font.category}, by ${font.designer}, ${font.year}. ${font.fact}`;
}
