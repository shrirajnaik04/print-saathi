import { useEffect, useState } from 'preact/hooks';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { TopBar } from '../../ui/TopBar';
import type { ScreenProps } from '../types';
import { settingsStore } from '../useSettings';

const t = en.welcome;
const h = en.help;

/** First start (PLAN §I-16, §K12): four short steps, Next / Done; Help shows the same later. Never shown again. */
export function Welcome({ go }: ScreenProps) {
  const steps: { title: string; lines: readonly string[] }[] = [
    { title: h.shareTitle, lines: h.shareSteps },
    { title: h.pinTitle, lines: [h.pinBody] },
    { title: h.setupTitle, lines: h.setupSteps },
    { title: h.printerTitle, lines: [h.printerBody] },
  ];
  const [at, setAt] = useState(0);
  const step = steps[at] as (typeof steps)[number];
  const last = at === steps.length - 1;
  // Shown once is enough: however the shopkeeper leaves (Done, Home, or the phone's Back), it never comes back (review I2).
  useEffect(() => {
    void settingsStore.update((s) => (s.welcomed ? s : { ...s, welcomed: true })).catch(() => {});
  }, []);
  const finish = () => go({ type: 'home' });
  return (
    <main class="screen">
      <TopBar title={t.title} onBack={() => (at > 0 ? setAt(at - 1) : finish())} onHome={finish} />
      <p class="muted">{fill(t.step, { n: at + 1, total: steps.length })}</p>
      <h2>{step.title}</h2>
      {step.lines.length === 1 ? (
        <p>{step.lines[0]}</p>
      ) : (
        <ol>
          {step.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
      )}
      <ActionBar>
        <Button icon={last ? 'check' : 'next'} onClick={() => (last ? finish() : setAt(at + 1))}>
          {last ? t.done : t.next}
        </Button>
      </ActionBar>
    </main>
  );
}
