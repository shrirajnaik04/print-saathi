import { useEffect, useRef, useState } from 'preact/hooks';
import { normalizeJob } from '../../core/job/job';
import { paperOf } from '../../core/plan/plan';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { PrintEngine, type PrintState } from '../../native/printEngine';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { TopBar } from '../../ui/TopBar';
import { saveJobChange } from '../received/Received';
import { push, type ScreenProps } from '../types';
import { settingsStore } from '../useSettings';

const t = en.result;

/** States where the printer has the job: The shopkeeper is asked whether the paper came out right. */
const SENT: ReadonlySet<PrintState> = new Set(['sent', 'printing', 'unknown']);

const MESSAGE: Partial<Record<PrintState, { kind: 'info' | 'warn' | 'error'; text: string }>> = {
  checking: { kind: 'info', text: t.checking },
  sent: { kind: 'info', text: t.sent },
  printing: { kind: 'info', text: t.printing },
  unknown: { kind: 'warn', text: t.unknown },
  blocked: { kind: 'warn', text: t.blocked },
  savedAsFile: { kind: 'warn', text: t.savedAsFile },
  nothingPrinted: { kind: 'warn', text: t.nothingPrinted },
  wrongPaper: { kind: 'warn', text: t.wrongPaper },
  interrupted: { kind: 'warn', text: t.interrupted },
  failed: { kind: 'error', text: t.failed },
};

/** States that can still change while the printer works: keep asking (PLAN §D4 "polled while in front"). */
const LIVE: ReadonlySet<PrintState> = new Set(['checking', 'printing', 'blocked', 'unknown']);

/**
 * What happened after Android's print screen (PLAN §I-13, §J8), each with its next step. While the printer is still
 * working the screen keeps asking and updates itself (gate review #5). The print record and the print file are
 * cleared when the shopkeeper leaves this screen (generated files never outlive the print, PLAN §E); "Print again" makes the
 * file again.
 */
export function Result({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  // A big job prints in parts (PLAN §D4): the job is printed only when its last part is.
  const part = Number(params?.part ?? 0) || 0;
  const parts = Number(params?.parts ?? 1) || 1;
  // The plan the part was cut from: Ready honours the part number only for that plan (re-review N1).
  const partOf = typeof params?.partOf === 'string' ? params.partOf : undefined;
  const lastPart = part + 1 >= parts;
  const [state, setState] = useState<PrintState>((params?.state as PrintState | undefined) ?? 'unknown');
  const [said, setSaid] = useState<'no' | null>(null);
  const marked = useRef(false);

  useEffect(() => () => void PrintEngine.clearPrint(), []);

  // Ask every 2 s while the printer is still working, even when the answer repeats (gate re-review N3/N4): a
  // queued job may still turn into "needs attention" or "failed".
  useEffect(() => {
    if (!LIVE.has(state)) return;
    let live = true;
    const timer = setInterval(async () => {
      const s = await PrintEngine.printStatus().catch(() => null);
      if (!live) return;
      if (s && s.state !== 'none' && s.state !== 'inDialog') setState(s.state);
      else setState((cur) => (cur === 'checking' ? 'unknown' : cur));
    }, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [state]);

  // The printer has the job: it no longer counts as unfinished (Continue).
  useEffect(() => {
    if ((state !== 'sent' && state !== 'printing') || marked.current) return;
    marked.current = true;
    void (async () => {
      const { job } = await PrintEngine.loadJob({ id: jobId });
      const j = normalizeJob(job);
      if (!j) return;
      // A big job: this part counts as printed (gate M1); the whole job only with its last part.
      const counted = parts > 1 ? await saveJobChange(j, { type: 'partPrinted' }) : j;
      if (lastPart) await saveJobChange(counted, { type: 'markPrinted' });
      // The colour just printed becomes how the next job of this type starts (PLAN §G0 remembered choices);
      // passport photos are left out (their colour is decided per job).
      if (lastPart && j.layout !== 'passport') {
        const type = j.layout === 'document' ? 'documents' : 'photos';
        // The paper it really printed on (A4 when 4×6 was chosen but not set up, gate review I6).
        const printedOn = paperOf(j, (await PrintEngine.paperSetup().catch(() => null))?.photoPaper);
        void settingsStore.update((s) => ({
          ...s,
          defaults: {
            ...s.defaults,
            [type]: type === 'photos' ? { colour: j.colour, paper: printedOn } : { colour: j.colour },
          },
        }));
      }
    })();
  }, [state]);

  const leave = (then: () => void) => () => {
    void PrintEngine.clearPrint();
    // The job's locked-PDF passwords stay while it is on the screens (its next part, Print again) and are forgotten
    // when it is left (app.tsx, review I5/I6).
    then();
  };
  const again = leave(() =>
    go({ type: 'replace', screen: { name: 'ready', params: parts > 1 ? { jobId, part, partOf } : { jobId } } }),
  );
  const nextPart = leave(() =>
    go({ type: 'replace', screen: { name: 'ready', params: { jobId, part: part + 1, partOf } } }),
  );
  const done = leave(() => go({ type: 'home' }));
  const msg = MESSAGE[state] ?? { kind: 'warn' as const, text: t.unknown };
  const asking = SENT.has(state) && said === null;

  return (
    <main class="screen">
      <TopBar title={t.title} onBack={leave(() => go({ type: 'back' }))} onHome={done} />
      {/* Sent: a check mark draws itself once (Phase 13 motion; still on phones that reduce motion). */}
      {SENT.has(state) && state !== 'unknown' && (
        <div class="sent-mark" aria-hidden="true">
          <svg viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="24" />
            <path d="M15 27l8 8 15-16" />
          </svg>
        </div>
      )}
      <Panel kind={msg.kind} title={msg.text} />
      {said === 'no' && <Panel kind="warn" title={t.noHelp} />}
      {state !== 'checking' && asking && <h2>{t.ask}</h2>}
      {state !== 'checking' && (
        <ActionBar>
          {asking ? (
            <>
              <Button icon="check" onClick={lastPart ? done : nextPart}>
                {lastPart ? t.yes : fill(t.yesNextPart, { k: part + 2, n: parts })}
              </Button>
              <Button variant="secondary" onClick={() => setSaid('no')}>
                {t.no}
              </Button>
            </>
          ) : (
            <>
              <Button variant="print" icon="print" onClick={again}>
                {t.printAgain}
              </Button>
              <Button variant="secondary" onClick={done}>
                {t.done}
              </Button>
              {/* The print looked wrong (PLAN §J8): the owner's helper can see what happened on this phone. */}
              {said === 'no' && (
                <Button variant="secondary" onClick={() => go(push('report'))}>
                  {en.settings.report}
                </Button>
              )}
            </>
          )}
        </ActionBar>
      )}
    </main>
  );
}
