import { Capacitor } from '@capacitor/core';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { sendUnlocked, unlockPdf } from '../../core/docs/unlock';
import type { DocPage } from '../../core/job/job';
import { styleOf } from '../../core/job/job';
import { FULL, shownOf } from '../../core/layout/crop';
import { allDocPages } from '../../core/plan/plan';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { passwords } from '../../native/passwords';
import { PrintEngine } from '../../native/printEngine';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { PaperPreview, turnedStyle } from '../../ui/PaperPreview';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import { saveJobChange } from '../received/Received';
import { push, type ScreenProps } from '../types';
import { useDocs } from '../useDocs';
import { useJob } from '../useJob';

const d = en.docs;
const u = en.unlock;

/** "Page 3", or "File 2, page 3" when the job has several files. */
function pageName(p: DocPage, files: number[], many: boolean) {
  return many ? fill(d.filePageN, { f: files.indexOf(p.item) + 1, n: p.page + 1 }) : fill(d.pageN, { n: p.page + 1 });
}

/**
 * Unlock PDF (PLAN §I-12, §J5): the e-Aadhaar helper (4 letters made CAPITALS + year of birth on the number pad) or
 * Other password. Suggestions, autocorrect and autofill are off; Show writes the password large below the field,
 * which stays a password field. The password lives only in memory (PLAN §G5). Phones whose built-in engine can't
 * open locked PDFs unlock the file in the app and send the copy in chunks (ADR-002 option i).
 */
export function Unlock({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const item = Number(params?.item ?? -1);
  // ID card copy unlocks an e-Aadhaar from its own screen and goes back there (Phase 14).
  const backTo = params?.back === 'cards' ? 'cards' : 'ready';
  const { job, gone } = useJob(jobId);
  const docs = useDocs(jobId, job);
  const [mode, setMode] = useState<'aadhaar' | 'other'>('aadhaar');
  const [letters, setLetters] = useState('');
  const [year, setYear] = useState('');
  const [other, setOther] = useState('');
  const [shown, setShown] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (gone) return <JobGone go={go} title={u.title} />;
  const leaveOut = async () => {
    if (!job || busy) return;
    setBusy(true);
    try {
      await saveJobChange(job, { type: 'removeItem', index: item });
      go({ type: 'backTo', name: backTo });
    } catch {
      setNote(en.change.saveFailed);
      setBusy(false);
    }
  };
  const password = mode === 'aadhaar' ? `${letters}${year}` : other;

  const unlock = async () => {
    if (busy) return;
    // The helper needs both parts; a short name is used whole, so only the year has a fixed length.
    if (mode === 'aadhaar' && (!letters || !/^\d{4}$/.test(year))) return setNote(letters ? u.needYear : u.needLetters);
    if (!password) return setNote(u.empty);
    setBusy(true);
    setNote(null);
    try {
      if (docs.tier === 'NONE') {
        // No built-in unlock on this phone: unlock the file here and send the copy (the one bridge exception).
        const path = job?.items.find((i) => i.index === item)?.path;
        if (!path) return setNote(u.failed);
        const bytes = new Uint8Array(await (await fetch(Capacitor.convertFileSrc(path))).arrayBuffer());
        const r = await unlockPdf(bytes, password);
        if (r.state === 'wrong') return setNote(mode === 'aadhaar' ? u.wrong : u.wrongOther);
        if (r.state === 'unsupported') return setNote(d.unsupported);
        if (r.state !== 'ok') return setNote(r.state === 'tooBig' ? u.tooBig : u.failed);
        const sent = await sendUnlocked((o) => PrintEngine.writeUnlocked({ jobId, item, ...o }), r.bytes);
        if (!sent) return setNote(u.failed);
      } else {
        const r = await PrintEngine.documentFacts({
          jobId,
          passwords: { ...passwords.forJob(jobId), [item]: password },
        });
        const state = r.items.find((x) => x.index === item)?.state;
        if (state === 'password') return setNote(mode === 'aadhaar' ? u.wrong : u.wrongOther);
        if (state !== 'ok') return setNote(state === 'tooBig' ? u.tooBig : u.failed);
        passwords.set(jobId, item, password);
      }
      go({ type: 'backTo', name: backTo });
    } catch {
      setNote(u.failed);
    } finally {
      setBusy(false);
    }
  };

  const noHelp = { autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: false } as const;
  return (
    <main class="screen">
      <TopBar title={u.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {mode === 'aadhaar' ? (
        <>
          <p>{u.hint}</p>
          {/* Keys: each field is its own element (a reused one kept maxlength 4 → 0 for the password). */}
          <label class="field" key="letters">
            <span>{u.letters}</span>
            <input
              type="text"
              {...noHelp}
              maxLength={4}
              value={letters}
              onInput={(e) =>
                setLetters(
                  (e.target as HTMLInputElement).value
                    .replace(/[^a-z]/gi, '')
                    .toUpperCase()
                    .slice(0, 4),
                )
              }
            />
          </label>
          <label class="field" key="year">
            <span>{u.year}</span>
            <input
              type="text"
              inputMode="numeric"
              {...noHelp}
              maxLength={4}
              value={year}
              onInput={(e) => setYear((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4))}
            />
          </label>
          <Button variant="secondary" onClick={() => setMode('other')}>
            {u.other}
          </Button>
        </>
      ) : (
        <>
          <label class="field" key="password">
            <span>{u.password}</span>
            <input
              type="password"
              {...noHelp}
              value={other}
              onInput={(e) => setOther((e.target as HTMLInputElement).value)}
            />
          </label>
          <Button variant="secondary" onClick={() => setShown((s) => !s)}>
            {shown ? u.hide : u.show}
          </Button>
          {shown && <p class="password-shown">{other}</p>}
          <Button variant="secondary" onClick={() => setMode('aadhaar')}>
            {u.aadhaar}
          </Button>
        </>
      )}
      {note && <Panel kind="warn" title={note} />}
      <ActionBar>
        <Button icon="check" onClick={() => void unlock()} busy={busy} busyLabel={u.unlocking}>
          {u.unlock}
        </Button>
        {/* No password from the customer (PLAN §J8): the other files still print. */}
        <Button variant="secondary" disabled={busy} onClick={() => void leaveOut()}>
          {en.ready.printWithoutFile}
        </Button>
      </ActionBar>
    </main>
  );
}

/** A page's small image, asked from the engine only once its tile is on screen (a PDF can have 500 pages). */
function PageImage({ src, onSeen }: { src?: string; onSeen?: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (src || !onSeen) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return onSeen();
    const io = new IntersectionObserver(
      (seen) => {
        if (!seen.some((e) => e.isIntersecting)) return;
        io.disconnect();
        onSeen();
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src]);
  return src ? <img src={src} alt="" /> : <span ref={ref} class="page-blank" />;
}

/** The pages of a document job, their images and the files they come from, for the page screens. */
function useDocPages(jobId: string) {
  const j = useJob(jobId);
  const docs = useDocs(jobId, j.job);
  const all = useMemo(() => (j.job ? allDocPages(j.job, j.aspects, docs.facts) : []), [j.job, j.aspects, docs.facts]);
  const isPdf = (p: DocPage) => j.job?.items.find((i) => i.index === p.item)?.type === 'pdf';
  const files = [...new Set(all.map((q) => q.item))];
  return {
    ...j,
    docs,
    all,
    /** Nothing to choose until every PDF is read and none is locked (review I2): a choice made before would leave
     * the locked file's pages out for good. */
    waiting: !j.job || docs.items === null,
    locked: docs.anyLocked,
    name: (p: DocPage) => pageName(p, files, files.length > 1),
    srcOf: (p: DocPage) => (isPdf(p) ? docs.srcOfPage(p.item, p.page) : j.srcOf(p.item)),
    seen: (p: DocPage) => (isPdf(p) ? () => docs.want([p]) : undefined),
    turnsOf: (p: DocPage) => (isPdf(p) ? (j.job?.docTurns?.[`${p.item}:${p.page}`] ?? 0) : (j.job?.turns[p.item] ?? 0)),
    /** Width and height of the page as the customer's file has it (a photo: its shape). */
    sizeOf: (p: DocPage): [number, number] => {
      if (isPdf(p)) return docs.facts.get(p.item)?.sizes[p.page] ?? [595, 841];
      // A photo page: its shape as it prints, cut by its crop (gate I-3).
      const c = j.job?.crops?.[p.item];
      return [(j.aspects.get(p.item) ?? 1) * (c ? c.w / c.h : 1), 1];
    },
    isPdf,
  };
}

/** Shown instead of the pages while a PDF is still read or locked. */
function NotYet({ v }: { v: ReturnType<typeof useDocPages> }) {
  if (v.locked) return <Panel kind="warn" title={d.unlockFirst} />;
  return <p>{d.reading}</p>;
}

/** Pages to print (PLAN §I-7): a tick per page with its small image; All pages / No pages. */
export function DocPages({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const v = useDocPages(jobId);
  const { job, all, busy, saveFailed, change } = v;
  const key = (p: DocPage) => `${p.item}:${p.page}`;
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const chosen = picked ?? new Set((job?.docPages ?? all).map(key));
  const [note, setNote] = useState(false);
  if (v.gone) return <JobGone go={go} title={d.pagesToPrint} />;
  const ready = !v.waiting && !v.locked;
  // The longest PDF's own page count (it may have more than the 500 that can be printed).
  const longest = Math.max(0, ...[...v.docs.facts.values()].map((f) => f.pages));
  const toggle = (p: DocPage) => {
    const next = new Set(chosen);
    if (next.has(key(p))) next.delete(key(p));
    else next.add(key(p));
    setPicked(next);
  };
  const done = async () => {
    if (!ready) return go({ type: 'back' });
    if (chosen.size === 0) return setNote(true);
    // Keep the shopkeeper's order for pages already chosen; newly ticked pages join in file order.
    const order = [...(job?.docPages ?? []), ...all].filter(
      (p, i, arr) => arr.findIndex((q) => key(q) === key(p)) === i,
    );
    if (await change({ type: 'setDocPages', pages: order.filter((p) => chosen.has(key(p))) }))
      go({ type: 'backTo', name: 'ready' });
  };
  return (
    <main class="screen">
      <TopBar title={d.pagesToPrint} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      {!ready ? (
        <NotYet v={v} />
      ) : (
        <>
          <p>{longest > 300 ? fill(d.manyPages, { n: longest }) : d.pickHint}</p>
          <div class="nudge-grid">
            <Button variant="secondary" onClick={() => setPicked(new Set(all.map(key)))}>
              {d.allPages}
            </Button>
            <Button variant="secondary" onClick={() => setPicked(new Set())}>
              {d.noPages}
            </Button>
          </div>
          {note && <Panel kind="warn" title={d.noneChosen} />}
          <div class="photo-grid">
            {all.map((p) => {
              const name = v.name(p);
              return (
                <label key={key(p)} class="photo-pick page-pick">
                  <PageImage src={v.srcOf(p)} onSeen={v.seen(p)} />
                  <span>
                    <input type="checkbox" checked={chosen.has(key(p))} onChange={() => toggle(p)} aria-label={name} />{' '}
                    {name}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
      <ActionBar>
        <Button icon="check" busy={busy} onClick={() => void done()}>
          {en.change.done}
        </Button>
      </ActionBar>
    </main>
  );
}

/** Page order (PLAN §J5 "reordering"): every page to print as one big button; a tap opens its tools. */
export function DocOrder({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const v = useDocPages(jobId);
  if (v.gone) return <JobGone go={go} title={d.pageOrder} />;
  const shown = v.job?.docPages ?? v.all;
  return (
    <main class="screen">
      <TopBar title={d.pageOrder} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {v.waiting || v.locked ? (
        <NotYet v={v} />
      ) : (
        <div class="photo-grid">
          {shown.map((p, at) => {
            const name = v.name(p);
            return (
              <button
                key={`${p.item}:${p.page}`}
                type="button"
                class="photo-pick"
                aria-label={name}
                onClick={() => go(push('doctools', { jobId, at }))}
              >
                <PageImage src={v.srcOf(p)} onSeen={v.seen(p)} />
                <span>{name}</span>
              </button>
            );
          })}
        </div>
      )}
      <ActionBar>
        <Button icon="check" onClick={() => go({ type: 'backTo', name: 'ready' })}>
          {en.change.done}
        </Button>
      </ActionBar>
    </main>
  );
}

/** One page's tools (like Photo tools): Move earlier, Move later, Turn; Done goes back to the page list. */
export function DocTools({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const v = useDocPages(jobId);
  const { job, busy, saveFailed, change } = v;
  const shown = job?.docPages ?? v.all;
  // The page is kept in the stack (not only here), so coming back from Crop finds the same page (re-review m-1).
  const at = Number(params?.at ?? 0);
  const p = v.waiting || v.locked ? undefined : shown[at];
  useEffect(() => {
    if (p) v.seen(p)?.();
  }, [p?.item, p?.page]);
  if (v.gone) return <JobGone go={go} title={d.pageOrder} />;
  const move = async (by: -1 | 1) => {
    // The tools follow the page.
    if (await change({ type: 'moveDocPage', at, by, shown }))
      go({ type: 'replace', screen: { name: 'doctools', params: { jobId, at: at + by } } });
  };
  const src = p ? v.srcOf(p) : undefined;
  const turns = p ? v.turnsOf(p) : 0;
  // The page as it will print: its own shape, turned.
  const [pw, ph] = p ? v.sizeOf(p) : [595, 841];
  const [bw, bh] = turns % 2 ? [ph, pw] : [pw, ph];
  return (
    <main class="screen">
      <TopBar
        title={p ? v.name(p) : d.pageOrder}
        onBack={() => go({ type: 'back' })}
        onHome={() => go({ type: 'home' })}
      />
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      {!p && <NotYet v={v} />}
      {src && p && !v.isPdf(p) && (
        // A photo page as it prints: cut by its crop and turned, grey for black & white, drawn like Ready.
        <div class="doc-page-preview">
          <PaperPreview
            wPt={bw}
            hPt={bh}
            placements={[
              {
                itemIndex: p.item,
                crop: shownOf(job?.crops?.[p.item] ?? FULL, turns),
                turns: turns as 0 | 1 | 2 | 3,
                style: job ? styleOf(job) : 'original',
                box: { x: 0, y: 0, w: bw, h: bh },
              },
            ]}
            srcOf={() => src}
            label={v.name(p)}
            grey={job?.colour === 'bw'}
          />
        </div>
      )}
      {src && p && v.isPdf(p) && (
        <div class="crop-stage" style={{ aspectRatio: `${bw} / ${bh}` }}>
          <span class="paper-photo paper-turned" style={{ left: 0, top: 0, width: '100%', height: '100%' }}>
            <img src={src} alt="" style={turnedStyle(turns, bw, bh)} />
          </span>
        </div>
      )}
      <div class="stack">
        <Button variant="secondary" icon="earlier" disabled={busy || !p || at === 0} onClick={() => void move(-1)}>
          {en.photos.earlier}
        </Button>
        <Button
          variant="secondary"
          icon="later"
          disabled={busy || !p || at >= shown.length - 1}
          onClick={() => void move(1)}
        >
          {en.photos.later}
        </Button>
        <Button
          variant="secondary"
          icon="turn"
          disabled={busy || !p}
          onClick={() => p && void change({ type: 'turnDocPage', item: p.item, page: p.page })}
        >
          {en.photos.turn}
        </Button>
        {p && !v.isPdf(p) && (
          // A photo page can be cropped here too (PLAN §J6; gate I-3: a wrong "Remove black edges" is never permanent).
          <Button
            variant="secondary"
            icon="crop"
            onClick={() => {
              const files = [...new Set(v.all.map((q) => q.item))];
              const many = files.length > 1;
              go(
                push('cropphoto', {
                  jobId,
                  index: p.item,
                  page: p.page + 1,
                  ...(many ? { file: files.indexOf(p.item) + 1 } : {}),
                }),
              );
            }}
          >
            {en.photos.crop}
            {job?.crops?.[p.item] ? ` · ${en.photos.cropped}` : ''}
          </Button>
        )}
      </div>
      <ActionBar>
        <Button icon="check" onClick={() => go({ type: 'back' })}>
          {en.change.done}
        </Button>
      </ActionBar>
    </main>
  );
}
