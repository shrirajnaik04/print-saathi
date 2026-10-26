import { useRef, useState } from 'preact/hooks';
import { type JobAction, type JobItem, type StyleId, styleOf } from '../../core/job/job';
import { straightAspect } from '../../core/layout/quad';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { scanWords } from '../../i18n/scan';
import { PHOTO_TYPES, PrintEngine } from '../../native/printEngine';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { Panel } from '../../ui/Panel';
import { turnedStyle } from '../../ui/PaperPreview';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import { push, type ScreenProps } from '../types';
import { useJob } from '../useJob';
import { useStraightImages } from '../useStraightImages';
import { shownPage } from './shown';

const s = scanWords;
const r = en.ready;
/** Look, for every page (owner, round 8: the DocScanner app's filters): Clean colour first, the scan job's own. */
const LOOKS: { style: StyleId; colour: 'colour' | 'bw' }[] = [
  { style: 'clean', colour: 'colour' },
  { style: 'original', colour: 'colour' },
  { style: 'bw', colour: 'bw' },
  { style: 'sharp', colour: 'bw' },
  { style: 'ocv', colour: 'bw' },
];

/**
 * Scanned pages (owner, round 8): the straightened pages one at a time (Page n of N with Previous / Next), each with Scan
 * another page, Fix edges, Turn, Move earlier / later and Delete (with Undo); the look of every page; Finish → Ready.
 */
export function ScanPages({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, aspects, srcOf, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  const [shownItem, setShownItem] = useState<number | undefined>(() => shownPage.get(jobId));
  const [removed, setRemoved] = useState<{ item: JobItem; at: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // A page taken: it opens on its corners in a moment (app.tsx, scan/arrive).
  const [taking, setTaking] = useState(false);
  // One camera at a time: a quick second tap on Scan another page does nothing (review I4).
  const opening = useRef(false);
  const pages = job ? job.order.filter((i) => job.items.some((it) => it.index === i && PHOTO_TYPES.has(it.type))) : [];
  const at = Math.max(
    0,
    shownItem !== undefined && pages.includes(shownItem) ? pages.indexOf(shownItem) : pages.length - 1,
  );
  const item = pages[at];
  const quad = item !== undefined ? job?.quads?.[item] : undefined;
  const straight = useStraightImages(jobId, item !== undefined && quad ? [{ item, quad }] : undefined, 640);
  if (gone) return <JobGone go={go} title={s.title} />;
  const show = (k: number) => {
    const it = pages[k];
    if (it === undefined) return;
    setShownItem(it);
    shownPage.set(jobId, it);
  };
  const a = item !== undefined ? (aspects.get(item) ?? 0) : 0;
  const turns = item !== undefined ? (job?.turns[item] ?? 0) : 0;
  const upright = a > 0 ? (quad ? straightAspect(quad, a) : a) : 0;
  const shape = turns % 2 === 1 ? 1 / upright : upright;
  const src = item === undefined ? undefined : quad ? straight({ item, quad }) : srcOf(item);
  const another = async () => {
    if (opening.current) return;
    opening.current = true;
    setNote(null);
    const res = await PrintEngine.scanPhoto({ into: jobId }).catch(() => null);
    opening.current = false;
    if (!res) setNote(en.home.cameraFailed);
    else if (res.noCamera || res.empty) setNote(res.noCamera ? en.home.noCamera : en.home.cameraEmpty);
    else if (res.taken === 1) setTaking(true);
  };
  const moveBy = (by: -1 | 1) => {
    const other = pages[at + by];
    if (item === undefined || other === undefined || !job) return;
    const moved: JobAction = { type: 'moveItem', index: item, by, among: pages };
    // Pages to print chosen: they follow, in the new order.
    const swap = (p: { item: number; page: number }) =>
      p.item === item ? { ...p, item: other } : p.item === other ? { ...p, item } : p;
    void change(
      job.docPages ? { type: 'all', actions: [moved, { type: 'setDocPages', pages: job.docPages.map(swap) }] } : moved,
    );
  };
  const remove = async () => {
    const it = job?.items.find((i) => i.index === item);
    if (!job || !it) return;
    const was = job.order.indexOf(it.index);
    if (await change({ type: 'removeItem', index: it.index })) setRemoved({ item: it, at: was });
  };
  const undo = async () => {
    if (removed && (await change({ type: 'restoreItem', item: removed.item, at: removed.at }))) {
      setShownItem(removed.item.index);
      shownPage.set(jobId, removed.item.index);
      setRemoved(null);
    }
  };
  const look = job ? { style: styleOf(job), colour: job.colour } : null;
  return (
    <main class="screen">
      <TopBar title={s.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && <Panel kind="error" title={r.loadFailed} action={{ label: r.tryAgain, onClick: retry }} />}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      {note && <Panel kind="error" title={note} />}
      {removed && <Panel kind="info" title={s.deleted} action={{ label: s.undo, onClick: () => void undo() }} />}
      {job && pages.length === 0 && <Panel kind="info" title={s.none} />}
      {pages.length > 0 && (
        <div class="pager">
          <Button variant="secondary" icon="back" disabled={at === 0} onClick={() => show(at - 1)} label={r.prevPage}>
            {r.prevShort}
          </Button>
          <p role="status" class="pager-status">
            {fill(r.pageLabel, { n: at + 1, total: pages.length })}
          </p>
          <Button
            variant="secondary"
            icon="next"
            disabled={at >= pages.length - 1}
            onClick={() => show(at + 1)}
            label={r.nextPage}
          >
            {r.nextShort}
          </Button>
        </div>
      )}
      {item !== undefined && shape > 0 && (
        <div
          class="straight-shot scan-shot"
          style={{ aspectRatio: `${shape}`, '--a': `${shape}` }}
          role="img"
          aria-label={fill(s.shownLabel, { n: at + 1 })}
        >
          {src ? (
            <span class="paper-photo paper-turned" style={{ left: 0, top: 0, width: '100%', height: '100%' }}>
              <img src={src} alt="" style={turnedStyle(turns, shape, 1)} />
            </span>
          ) : (
            <span class="thumb-note">{src === null ? en.crop.noPicture : en.crop.making}</span>
          )}
        </div>
      )}
      <div class="scan-tools">
        <Button icon="scan" busy={taking} busyLabel={s.getting} disabled={busy} onClick={() => void another()}>
          {s.another}
        </Button>
        {item !== undefined && (
          <>
            <Button
              variant="secondary"
              icon="crop"
              onClick={() => go(push('scanpage', { jobId, index: item, next: 'back' }))}
            >
              {s.fix}
            </Button>
            <Button
              variant="secondary"
              icon="turn"
              disabled={busy}
              onClick={() => void change({ type: 'turnItem', index: item })}
            >
              {s.turn}
            </Button>
            <Button variant="secondary" icon="earlier" disabled={busy || at === 0} onClick={() => moveBy(-1)}>
              {s.earlier}
            </Button>
            <Button
              variant="secondary"
              icon="later"
              disabled={busy || at >= pages.length - 1}
              onClick={() => moveBy(1)}
            >
              {s.later}
            </Button>
            <Button variant="secondary" icon="remove" disabled={busy} onClick={() => void remove()}>
              {s.delete}
            </Button>
          </>
        )}
      </div>
      {look && (
        <>
          <h2>{s.look}</h2>
          <div class="stack">
            {LOOKS.map((l) => (
              <ChoiceCard
                key={l.style}
                title={en.style.names[l.style]}
                helper={en.style.helpers[l.style]}
                selected={look.colour === l.colour && look.style === l.style}
                disabled={busy}
                onClick={() =>
                  void change({
                    type: 'all',
                    actions: [
                      { type: 'setColour', colour: l.colour },
                      { type: 'setStyle', style: l.style },
                    ],
                  })
                }
              />
            ))}
          </div>
        </>
      )}
      <ActionBar>
        <Button icon="check" disabled={pages.length === 0} onClick={() => go(push('ready', { jobId }))}>
          {pages.length === 1 ? s.finishOne : fill(s.finish, { n: pages.length })}
        </Button>
      </ActionBar>
    </main>
  );
}
