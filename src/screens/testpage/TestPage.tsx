import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { en } from '../../i18n/en';
import { PrintEngine, type PrintKind, type PrintState } from '../../native/printEngine';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { Panel } from '../../ui/Panel';
import { TopBar } from '../../ui/TopBar';
import type { ScreenProps } from '../types';

const t = en.testPage;
const r = en.result;

/** The printer has the page: there is something to measure. */
const SENT: ReadonlySet<PrintState> = new Set(['sent', 'printing', 'unknown']);
/** Still settling at the printer: keep asking (gate m2), as the Result screen does. */
const LIVE: ReadonlySet<PrintState> = new Set(['checking', 'printing', 'blocked', 'unknown']);

const MESSAGE: Partial<Record<PrintState, { kind: 'info' | 'warn' | 'error'; text: string }>> = {
  sent: { kind: 'info', text: r.sent },
  printing: { kind: 'info', text: r.printing },
  unknown: { kind: 'warn', text: r.unknown },
  blocked: { kind: 'warn', text: r.blocked },
  savedAsFile: { kind: 'warn', text: r.savedAsFile },
  nothingPrinted: { kind: 'warn', text: r.nothingPrinted },
  wrongPaper: { kind: 'warn', text: r.wrongPaper },
  interrupted: { kind: 'warn', text: r.interrupted },
  failed: { kind: 'error', text: r.failed },
};

type View =
  | { step: 'choose'; note?: string }
  | { step: 'waiting'; kind: PrintKind }
  | { step: 'done'; kind: PrintKind; state: PrintState; photoSaved?: boolean; remeasure?: boolean };

/**
 * The shop test page (PLAN §D4, §I-15/16): A4 checks the printed size with a ruler; 4×6 photo paper also finds the
 * printer's photo paper size for passport photos. It is never a customer job: it has its own screen and outcome,
 * and leaving this screen forgets the print and deletes the test file.
 */
export function TestPage({ go, params }: ScreenProps) {
  const fromStart = params?.kind === 'testA4' || params?.kind === 'testPhoto';
  const [view, setView] = useState<View>(
    fromStart
      ? { step: 'done', kind: params?.kind as PrintKind, state: (params?.state as PrintState) ?? 'unknown' }
      : { step: 'choose' },
  );
  const waiting = useRef<PrintKind | null>(null);
  const checking = useRef(false);

  // After Android's print screen closes (or the app comes back to the front), find out what happened.
  useEffect(() => {
    let onScreen = true;
    const check = async () => {
      const kind = waiting.current;
      if (!kind || checking.current) return;
      checking.current = true;
      try {
        for (;;) {
          const s = await PrintEngine.printStatus();
          if (!onScreen || s.state === 'inDialog') return;
          if (s.state !== 'checking') {
            waiting.current = null;
            const state = s.state === 'none' ? 'unknown' : s.state;
            // Only what this run saved counts (re-review N4), never an older save.
            if (onScreen) setView({ step: 'done', kind, state, photoSaved: !!s.paperSaved, remeasure: !!s.remeasure });
            return;
          }
          await new Promise((res) => setTimeout(res, 700));
        }
      } catch {
        if (onScreen) setView({ step: 'done', kind, state: 'unknown' });
        waiting.current = null;
      } finally {
        checking.current = false;
      }
    };
    const closed = PrintEngine.addListener('printClosed', () => void check());
    const resumed = Capacitor.isNativePlatform() ? NativeApp.addListener('resume', () => void check()) : null;
    return () => {
      onScreen = false;
      void closed.then((h) => h.remove());
      void resumed?.then((h) => h.remove());
    };
  }, []);

  // Leaving forgets the test print and deletes its file, so it never comes back later out of context (gate m2).
  useEffect(() => () => void PrintEngine.clearPrint(), []);

  // While the printer is still settling, keep asking every 2 s (also for a test print found at app start).
  const doneState = view.step === 'done' ? view.state : null;
  useEffect(() => {
    if (view.step !== 'done' || !LIVE.has(view.state)) return;
    const kind = view.kind;
    let live = true;
    const timer = setInterval(async () => {
      const s = await PrintEngine.printStatus().catch(() => null);
      if (!live || !s || s.state === 'none' || s.state === 'inDialog' || s.state === view.state) return;
      if (live) setView({ step: 'done', kind, state: s.state, photoSaved: !!s.paperSaved, remeasure: !!s.remeasure });
    }, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [doneState]);

  const print = async (paper: 'A4' | 'PHOTO_4x6') => {
    const kind: PrintKind = paper === 'A4' ? 'testA4' : 'testPhoto';
    const res = await PrintEngine.printTestPage({ paper }).then(
      (x) => x.result,
      () => 'failed' as const,
    );
    if (res === 'started') {
      waiting.current = kind;
      setView({ step: 'waiting', kind });
    } else setView({ step: 'choose', note: res === 'busy' ? en.ready.busy : t.failed });
  };

  const leave = (then: () => void) => () => {
    void PrintEngine.clearPrint();
    then();
  };
  const again = () => {
    void PrintEngine.clearPrint();
    setView({ step: 'choose' });
  };

  return (
    <main class="screen">
      <TopBar title={t.title} onBack={leave(() => go({ type: 'back' }))} onHome={leave(() => go({ type: 'home' }))} />
      {view.step === 'choose' && (
        <>
          <p>{t.intro}</p>
          {view.note && <Panel kind="warn" title={view.note} />}
          <div class="stack">
            <ChoiceCard title={t.a4} helper={t.a4Hint} selected={false} onClick={() => void print('A4')} />
            <ChoiceCard title={t.photo} helper={t.photoHint} selected={false} onClick={() => void print('PHOTO_4x6')} />
          </div>
        </>
      )}
      {view.step === 'waiting' && <Panel kind="info" title={t.waiting} />}
      {view.step === 'done' && (
        <>
          <Panel
            kind={(MESSAGE[view.state] ?? MESSAGE.unknown)?.kind ?? 'warn'}
            title={
              // 4x6 on the wrong paper: the size must be changed here, so never "don't change anything" (gate M2).
              view.kind === 'testPhoto' && view.state === 'wrongPaper'
                ? t.photoWrongPaper
                : ((MESSAGE[view.state] ?? MESSAGE.unknown)?.text ?? r.unknown)
            }
          />
          {SENT.has(view.state) && <p>{view.kind === 'testA4' ? t.measureA4 : t.measurePhoto}</p>}
          {view.photoSaved && <Panel kind="info" title={t.photoSaved} />}
          {view.remeasure && <Panel kind="warn" title={t.remeasure} />}
          <ActionBar>
            <Button variant="secondary" icon="print" onClick={again}>
              {r.printAgain}
            </Button>
            <Button icon="check" onClick={leave(() => go({ type: 'back' }))}>
              {r.done}
            </Button>
          </ActionBar>
        </>
      )}
    </main>
  );
}
