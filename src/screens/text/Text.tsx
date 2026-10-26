import { useEffect, useRef, useState } from 'preact/hooks';
import { EMPTY_TEXT, TEXT_TOO_LONG } from '../../core/intake/messages';
import { normalizeJob, TEXT_SIZES, textItemOf } from '../../core/job/job';
import { en } from '../../i18n/en';
import { PrintEngine, type TextSize as Size } from '../../native/printEngine';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { Panel } from '../../ui/Panel';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import { saveJobChange } from '../received/Received';
import type { ScreenProps } from '../types';
import { useJob } from '../useJob';

const t = en.text;
/** As the engine's (TextIntake.MAX_CHARS): a longer message is asked for as a PDF. */
const MAX_CHARS = 100_000;

/** What is wrong with [text] for printing, said in the shop's words; null when it can print. */
const problemOf = (text: string) => (!text.trim() ? EMPTY_TEXT : text.length > MAX_CHARS ? TEXT_TOO_LONG : null);

/** A new message typed or pasted but not yet Done: kept while the app is open, so Back never loses it (PLAN §H2.8). */
let draft = '';

/**
 * Text message (owner, round 8: "Some people come like this … But option should be there"): the customer's WhatsApp
 * text, pasted or typed, printed as an A4 document. From Home it becomes a new job; from Ready (Edit text) it changes
 * the job's message. Paste is a button: no press-and-hold needed.
 */
export function TextMessage({ go, params }: ScreenProps) {
  const jobId = typeof params?.jobId === 'string' ? params.jobId : '';
  const index = Number(params?.index ?? 0);
  const editing = jobId !== '' && index > 0;
  const [text, setText] = useState(editing ? '' : draft);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const typed = useRef(false);

  // A customer's message on screen: kept out of screenshots on Android 12 and older (PLAN §D6).
  useEffect(() => {
    void PrintEngine.setCustomerContentShown({ shown: true });
    return () => void PrintEngine.setCustomerContentShown({ shown: false });
  }, []);

  // Edit text: the message as it is now (never over what the shopkeeper already typed).
  useEffect(() => {
    if (!editing) return;
    let live = true;
    PrintEngine.readText({ jobId, index }).then(
      (r) => live && !typed.current && setText(r.text),
      () => live && setProblem(t.readFailed),
    );
    return () => {
      live = false;
    };
  }, [jobId, index]);

  const edit = (next: string) => {
    typed.current = true;
    setText(next);
    if (!editing) draft = next;
  };

  const paste = async () => {
    setNote(null);
    setProblem(null);
    const copied = (await PrintEngine.readClipboard().catch(() => ({ text: '' }))).text;
    if (!copied) return setNote(t.nothingCopied);
    // At the blinking line, or over the words chosen in the box.
    const el = box.current;
    const from = el?.selectionStart ?? text.length;
    const to = el?.selectionEnd ?? from;
    edit(text.slice(0, from) + copied + text.slice(to));
  };

  const done = async () => {
    if (busy) return;
    const wrong = problemOf(text);
    setNote(null);
    setProblem(wrong);
    if (wrong) return;
    setBusy(true);
    try {
      if (!editing) {
        // The new job opens by itself in place of this screen (intakeReady, app.tsx).
        await PrintEngine.textJob({ text });
        draft = '';
        return;
      }
      const job = normalizeJob((await PrintEngine.loadJob({ id: jobId })).job);
      const item = job?.items.find((i) => i.index === index);
      if (!job || !item) return setGone(true);
      const size = item.text?.size ?? 12;
      const made = await PrintEngine.textToPdf({ jobId, index, size, text });
      await saveJobChange(job, {
        type: 'setTextPdf',
        index,
        size,
        path: made.path,
        bytes: made.bytes,
        sha256: made.sha256,
      });
      go({ type: 'backTo', name: 'ready' });
    } catch {
      setProblem(t.failed);
      setBusy(false);
    }
  };

  if (gone) return <JobGone go={go} title={t.title} />;
  return (
    <main class="screen">
      <TopBar title={t.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      <p class="lead">{t.lead}</p>
      {problem && <Panel kind="error" title={problem} />}
      <label class="field">
        <span>{t.box}</span>
        <textarea
          ref={box}
          class="text-box"
          value={text}
          rows={8}
          autoComplete="off"
          spellcheck={false}
          onInput={(e) => edit((e.target as HTMLTextAreaElement).value)}
        />
      </label>
      {note && (
        <p class="muted" role="status">
          {note}
        </p>
      )}
      <ActionBar>
        <Button variant="secondary" icon="paste" disabled={busy} onClick={() => void paste()}>
          {t.paste}
        </Button>
        <Button icon="check" busy={busy} busyLabel={t.working} onClick={() => void done()}>
          {t.done}
        </Button>
      </ActionBar>
    </main>
  );
}

/** Text size (owner, round 8): how big the message's letters print; a new PDF of it is made at that size. */
export function TextSize({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  const [making, setMaking] = useState(false);
  const [wrong, setWrong] = useState(false);
  if (gone) return <JobGone go={go} title={t.size} />;
  const item = job ? textItemOf(job) : undefined;
  const now = item?.text?.size ?? 12;
  const choose = async (size: Size) => {
    if (!item || busy || making) return;
    if (size === now) return go({ type: 'backTo', name: 'ready' });
    setMaking(true);
    setWrong(false);
    try {
      const made = await PrintEngine.textToPdf({ jobId, index: item.index, size });
      const saved = await change({
        type: 'setTextPdf',
        index: item.index,
        size,
        path: made.path,
        bytes: made.bytes,
        sha256: made.sha256,
      });
      if (saved) go({ type: 'backTo', name: 'ready' });
    } catch {
      setWrong(true);
    } finally {
      setMaking(false);
    }
  };
  return (
    <main class="screen">
      <TopBar title={t.size} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {(saveFailed || wrong) && <Panel kind="error" title={t.failed} />}
      <h2>{t.sizeTitle}</h2>
      {making && <p role="status">{t.working}</p>}
      {item && (
        <div class="stack rise">
          {TEXT_SIZES.map((s) => (
            <ChoiceCard
              key={s}
              title={t.sizes[s]}
              helper={t.sizeHelp[s]}
              selected={s === now}
              preview={<span class={`text-sample text-sample-${s}`}>Aa</span>}
              onClick={() => void choose(s)}
              disabled={busy || making}
            />
          ))}
        </div>
      )}
    </main>
  );
}
