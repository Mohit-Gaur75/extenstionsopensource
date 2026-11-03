import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { loadFont } from '@/lib/fontface';
import { ALL_FONTS, familyName, genericFallback, getFontById } from '@/lib/fonts';
import type { Font } from '@/lib/fonts';
import { currentStreak, hasPlayedToday } from '@/lib/quiz';
import type { QuizStats } from '@/lib/quiz';
import { toISODate } from '@/lib/pick';
import {
  dailyFont,
  hostFromUrl,
  isSiteEnabled,
  pruneOverrides,
  resolveFont,
  sourceLabel,
  toggleSite,
} from '@/lib/state';
import type { OverrideMode, OverrideStore, Resolution, Settings } from '@/lib/state';
import { getSettings, readLocal, sendMessage, setSettings, updateSettings } from '@/lib/storage';
import type { RandomReply, TabOverrideReply } from '@/lib/storage';
import { Quiz } from './Quiz';

interface TabInfo {
  id: number;
  hostname: string;
}

interface Snapshot {
  settings: Settings;
  stats: QuizStats;
  tab: TabInfo | null;
  daily: Font;
  resolution: Resolution;
  today: string;
}

const SAMPLE = 'The quick brown fox jumps over the lazy dog 0123456789';
const SPIN_MS = 1000;
const LEVEL_NAMES = ['', 'Tasteful', 'Quirky', 'Unhinged'] as const;
const SCOPES: ReadonlyArray<{ value: OverrideMode; label: string }> = [
  { value: 'tab', label: 'This tab only' },
  { value: 'site', label: 'This site' },
  { value: 'global', label: 'Everywhere (until midnight)' },
];

async function loadSnapshot(): Promise<Snapshot> {
  const now = Date.now();
  const [settings, storedOverrides, stats] = await Promise.all([
    getSettings(),
    readLocal('overrides'),
    readLocal('quiz'),
  ]);
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  const hostname = hostFromUrl(active?.url);
  const tab: TabInfo | null =
    active?.id !== undefined && hostname ? { id: active.id, hostname } : null;
  const overrides: OverrideStore = pruneOverrides(storedOverrides, now);
  const tabReply = tab
    ? await sendMessage<TabOverrideReply>({ type: 'GET_TAB_OVERRIDE', tabId: tab.id }).catch(
        (): TabOverrideReply => ({ fontId: null }),
      )
    : { fontId: null };
  const daily = dailyFont(ALL_FONTS, settings, now);
  const resolution = resolveFont({
    dailyId: daily.id,
    tab: tabReply.fontId,
    site: tab ? (overrides.sites[tab.hostname] ?? null) : null,
    global: overrides.global,
    now,
    isKnown: (id) => getFontById(id) !== undefined,
  });
  return { settings, stats, tab, daily, resolution, today: toISODate(new Date(now)) };
}

function previewStyle(font: Font | null, ready: boolean): React.CSSProperties {
  return font && ready ? { fontFamily: `"${familyName(font)}", ${genericFallback(font)}` } : {};
}

/** Cycle random font names for ~1s, slowing down, then land on `target`. */
function runSpin(target: Font, show: (font: Font | null) => void, done: () => void): void {
  let delay = 40;
  let elapsed = 0;
  const step = (): void => {
    if (elapsed >= SPIN_MS) {
      show(null);
      done();
      return;
    }
    show(ALL_FONTS[Math.floor(Math.random() * ALL_FONTS.length)] ?? target);
    elapsed += delay;
    delay *= 1.2;
    window.setTimeout(step, delay);
  };
  step();
}

export function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [scope, setScope] = useState<OverrideMode>('tab');
  const [spinFont, setSpinFont] = useState<Font | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'main' | 'quiz'>('main');
  const [readyId, setReadyId] = useState<string | null>(null);

  const reload = useCallback(async () => setSnap(await loadSnapshot()), []);

  useEffect(() => {
    let live = true;
    void loadSnapshot().then((s) => {
      if (live) setSnap(s);
    });
    return () => {
      live = false;
    };
  }, []);

  const shown = snap ? (getFontById(snap.resolution.fontId) ?? snap.daily) : null;
  const previewFont = spinFont ?? shown;

  useEffect(() => {
    if (!previewFont) return;
    let live = true;
    void loadFont(previewFont).then((face) => {
      if (live && face) setReadyId(previewFont.id);
    });
    return () => {
      live = false;
    };
  }, [previewFont]);

  if (!snap || !shown || !previewFont) return <main className="popup">Loading…</main>;

  const { settings, stats, tab, daily, resolution, today } = snap;
  const siteOn = tab ? isSiteEnabled(settings, tab.hostname) : false;
  const quizDone = hasPlayedToday(stats, today);
  const nameVisible = resolution.source !== 'daily' || quizDone || settings.alwaysShowName;
  const canAct = tab !== null && settings.enabled && siteOn && !busy;

  const patch = async (change: Partial<Settings>) => {
    await updateSettings(change);
    await reload();
  };

  const random = async () => {
    if (!tab) return;
    setBusy(true);
    ALL_FONTS.forEach((f) => void loadFont(f)); // warm the faces used by the spin
    const { fontId } = await sendMessage<RandomReply>({
      type: 'RANDOM',
      tabId: tab.id,
      hostname: tab.hostname,
      mode: scope,
    });
    const target = getFontById(fontId) ?? daily;
    runSpin(target, setSpinFont, () => {
      setBusy(false);
      void reload();
    });
  };

  const back = async () => {
    if (!tab) return;
    await sendMessage({ type: 'CLEAR_OVERRIDES', tabId: tab.id, hostname: tab.hostname });
    await reload();
  };

  if (view === 'quiz') {
    return (
      <main className="popup">
        <Quiz
          daily={daily}
          today={today}
          stats={stats}
          onClose={() => {
            setView('main');
            void reload();
          }}
        />
      </main>
    );
  }

  const label = spinFont ? spinFont.name : nameVisible ? shown.name : '❓ Mystery font';
  return (
    <main className="popup">
      <header className="row">
        <h1>Cursed Fonts</h1>
        <label className="switch" title="Master on/off">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => void patch({ enabled: e.target.checked })}
          />
          <span>{settings.enabled ? 'On' : 'Off'}</span>
        </label>
      </header>

      <section className="card">
        <div className="source">{spinFont ? 'Rolling…' : sourceLabel(resolution.source)}</div>
        <div className="row">
          <strong className="font-name">{label}</strong>
          <button className="primary" disabled={!canAct} onClick={() => void random()}>
            🎲 Random
          </button>
        </div>
        <p
          className={spinFont ? 'preview spinning' : 'preview'}
          style={previewStyle(previewFont, readyId === previewFont.id)}
        >
          {spinFont ? spinFont.name : SAMPLE}
        </p>
        <div className="row">
          <select
            aria-label="Random scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as OverrideMode)}
          >
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {resolution.source !== 'daily' && (
            <button disabled={!tab || busy} onClick={() => void back()}>
              ↩ Back to today&apos;s font
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <label className="row">
          <span>{tab ? `Enabled on ${tab.hostname}` : 'Not available on this page'}</span>
          <input
            type="checkbox"
            disabled={!tab || !settings.enabled}
            checked={siteOn}
            onChange={() =>
              tab && void setSettings(toggleSite(settings, tab.hostname)).then(reload)
            }
          />
        </label>
        <label className="column">
          <span>
            Cursed level: <strong>{LEVEL_NAMES[settings.level]}</strong>
          </span>
          <input
            type="range"
            min={1}
            max={3}
            step={1}
            value={settings.level}
            onChange={(e) => void patch({ level: Number(e.target.value) as Settings['level'] })}
          />
        </label>
      </section>

      <footer className="row">
        <span>🔥 Streak: {currentStreak(stats, today)}</span>
        {!settings.alwaysShowName && (
          <button onClick={() => setView('quiz')}>
            {quizDone ? 'Quiz result' : 'Guess today’s font'}
          </button>
        )}
        <a href="#options" onClick={() => void browser.runtime.openOptionsPage()}>
          Options
        </a>
      </footer>
    </main>
  );
}
