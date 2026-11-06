import { useEffect, useMemo, useState } from 'react';
import { loadFont } from '@/lib/fontface';
import { ALL_FONTS, familyName, genericFallback, getFontById } from '@/lib/fonts';
import type { Font } from '@/lib/fonts';
import { accuracy, generateQuiz, hasPlayedToday, recordAnswer, revealLine } from '@/lib/quiz';
import type { QuizStats } from '@/lib/quiz';
import { writeLocal } from '@/lib/storage';

interface Props {
  /** Always the DAILY font. Random overrides never reach the quiz. */
  daily: Font;
  today: string;
  stats: QuizStats;
  onClose: () => void;
}

const SAMPLE = 'Sphinx of black quartz, judge my vow. 0123456789';

export function Quiz({ daily, today, stats: initial, onClose }: Props) {
  const [stats, setStats] = useState(initial);
  const [ready, setReady] = useState(false);
  const quiz = useMemo(() => generateQuiz(today, daily, ALL_FONTS), [today, daily]);

  const played = hasPlayedToday(stats, today);
  // If already played, reveal the font that was actually scored.
  const answered = played ? stats.lastResult : null;
  const revealed = answered ? (getFontById(answered.fontId) ?? daily) : daily;

  useEffect(() => {
    let live = true;
    void loadFont(revealed).then((face) => live && setReady(face !== null));
    return () => {
      live = false;
    };
  }, [revealed]);

  const guess = async (id: string) => {
    const next = recordAnswer(stats, today, daily.id, id);
    setStats(next);
    await writeLocal('quiz', next);
  };

  return (
    <div className="quiz">
      <header className="header">
        <div className="brand">
          <span className="brand-icon">?</span>
          <h1>Daily Font Quiz</h1>
        </div>
        <button className="subtle-btn" onClick={onClose}>
          Back
        </button>
      </header>

      <div className="card">
        <div className="specimen-header">
          <span className="badge">Specimen</span>
          <span className="badge">Identify this font</span>
        </div>
        <div className="specimen-box">
          <p
            className="preview"
            style={
              ready ? { fontFamily: `"${familyName(revealed)}", ${genericFallback(revealed)}` } : {}
            }
          >
            {SAMPLE}
          </p>
        </div>
      </div>

      {!answered && (
        <div className="options-grid">
          {quiz.options.map((font) => (
            <button key={font.id} onClick={() => void guess(font.id)}>
              {font.name}
            </button>
          ))}
        </div>
      )}

      {answered && (
        <div className={answered.correct ? 'result good' : 'result bad'}>
          <strong>{answered.correct ? 'Correct' : 'Not quite'}</strong>
          <p>{revealLine(revealed)}</p>
          <p>
            Streak {stats.streak} (best {stats.bestStreak}) · Accuracy {accuracy(stats)}% over{' '}
            {stats.played} {stats.played === 1 ? 'game' : 'games'}
          </p>
          <p className="muted">One scored attempt per day. Resets at midnight.</p>
        </div>
      )}
    </div>
  );
}
