import { useEffect, useState } from 'preact/hooks';
import { listenReceiving, receivingNow } from '../../core/intake/receiving';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { PrintEngine } from '../../native/printEngine';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { TopBar } from '../../ui/TopBar';
import type { ScreenProps } from '../types';

const t = en.receiving;

/**
 * Receiving files (PLAN §D2, §I-4, §H2.7): shown when a share takes more than a moment to copy — words, a bar and
 * Cancel. The files then open on Received by themselves; after Cancel what arrived waits in Recent jobs.
 */
export function Receiving({ go }: ScreenProps) {
  const [r, setR] = useState(receivingNow());
  useEffect(() => {
    if (import.meta.env.MODE === 'e2e') {
      const g = globalThis as { __receivingShown?: number };
      g.__receivingShown = (g.__receivingShown ?? 0) + 1; // tests: this screen was shown
    }
    return listenReceiving(setR);
  }, []);
  // Cancel stops this share only; Back just leaves the screen and the files still arrive (gate review I9).
  const cancel = () => {
    if (r) void PrintEngine.cancelIntake({ intakeId: r.intakeId });
    go({ type: 'back' });
  };
  return (
    <main class="screen">
      <TopBar title={t.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      <p role="status">
        {r?.making
          ? fill(t.making, {
              kind: en.docs.office[r.making as keyof typeof en.docs.office] ?? en.docs.office.office,
            })
          : r
            ? fill(t.progress, { done: r.done, total: r.total })
            : t.almost}
      </p>
      {r && <progress class="progress" max={r.total || 1} value={r.done} aria-label={t.title} />}
      <p class="muted">{t.help}</p>
      <ActionBar>
        <Button variant="secondary" onClick={cancel}>
          {en.received.cancel}
        </Button>
      </ActionBar>
    </main>
  );
}
