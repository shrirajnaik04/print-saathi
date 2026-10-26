import { useEffect, useRef, useState } from 'preact/hooks';
import type { JobAction } from '../../core/job/job';
import { FULL } from '../../core/layout/crop';
import {
  boxOfSquareQuad,
  moveCorner,
  moveSideStraight,
  quadOfBox,
  shownQuad,
  uprightQuad,
} from '../../core/layout/quad';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { scanWords } from '../../i18n/scan';
import { PrintEngine } from '../../native/printEngine';
import { CropBar } from '../../ui/CropBar';
import { CropFrame } from '../../ui/CropFrame';
import { Panel } from '../../ui/Panel';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import type { ScreenProps } from '../types';
import { useJob } from '../useJob';
import { PointNudge } from './PointNudge';
import { shownPage } from './shown';

const s = scanWords;
const c = en.crop;
/** One tap of an arrow moves the chosen point this far (a fraction of the photo). */
const STEP = 0.01;
const WHOLE = quadOfBox(FULL);
/** A frame this close to the photo's edges is the whole photo (nothing to straighten). */
const isWhole = (q: number[]) => {
  const b = boxOfSquareQuad(q);
  return !!b && b.x <= 0.005 && b.y <= 0.005 && b.x + b.w >= 0.995 && b.y + b.h >= 0.995;
};
/** The page each photo showed when first looked at (this run of the app); null: none was seen. */
const looked = new Map<string, number[] | null>();

/**
 * Page n (owner, round 8: "like the DocScanner app"): the photo with the page's frame, corner circles and side bars
 * (scanned pages only), moved by dragging or with Next point and the arrows. It starts on the page the engine found,
 * else the whole photo, saying so. Turn left / right, Whole photo, Retake (a new photo in this page's place); Done keeps
 * the corners (the engine straightens the page when it prints) and goes on to Scanned pages.
 */
export function ScanPage({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const index = Number(params?.index ?? 0);
  const { job, aspects, srcOf, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  const key = `${jobId}:${index}`;
  const [found, setFound] = useState<number[] | null | undefined>(looked.get(key));
  const [edited, setEdited] = useState<number[] | null>(null);
  const [point, setPoint] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  // A new photo taken: it opens in this page's place in a moment; meanwhile this one is not finished by mistake.
  const [taking, setTaking] = useState(false);
  // One camera at a time: a quick second tap on Retake does nothing (review I4).
  const opening = useRef(false);
  const saved = job?.quads?.[index];
  useEffect(() => {
    if (!job || saved || found !== undefined) return;
    let live = true;
    const seen = (q: number[] | null) => {
      looked.set(key, q);
      if (live) setFound(q);
    };
    PrintEngine.findPage({ jobId, index }).then(
      (r) => seen(r.found && r.corners?.length === 8 ? r.corners : null),
      () => seen(null),
    );
    return () => {
      live = false;
    };
  }, [job?.id, key, !!saved]);
  if (gone) return <JobGone go={go} title={s.title} />;
  const upright = edited ?? saved ?? found ?? WHOLE;
  const turns = job?.turns[index] ?? 0;
  const a = aspects.get(index) ?? 0;
  const shown = a > 0 ? (turns % 2 === 1 ? 1 / a : a) : 0;
  const q = shownQuad(upright, turns);
  const setShown = (next: number[]) => setEdited(uprightQuad(next, turns));
  const move = (dx: number, dy: number) => {
    if (point < 4) {
      setShown(moveCorner(q, point, (q[2 * point] as number) + dx * STEP, (q[2 * point + 1] as number) + dy * STEP));
    } else {
      const side = (point - 4) as 0 | 1 | 2 | 3;
      setShown(moveSideStraight(q, side, (side % 2 === 0 ? dy : dx) * STEP));
    }
  };
  const n = job ? Math.max(1, job.order.indexOf(index) + 1) : 1;
  const done = async () => {
    const whole = isWhole(upright);
    const action: JobAction | null = whole
      ? saved
        ? { type: 'setQuad', item: index, quad: null }
        : null
      : saved?.join(',') === upright.join(',')
        ? null
        : { type: 'setQuad', item: index, quad: upright };
    if (action && !(await change(action))) return;
    shownPage.set(jobId, index);
    go(
      params?.next === 'back'
        ? { type: 'back' }
        : { type: 'replace', screen: { name: 'scanpages', params: { jobId } } },
    );
  };
  const retake = async () => {
    if (opening.current) return;
    opening.current = true;
    setNote(null);
    const r = await PrintEngine.scanPhoto({ into: jobId, retake: index }).catch(() => null);
    opening.current = false;
    // Taken: the new photo opens here in this page's place (app.tsx, scan/arrive).
    if (!r) setNote(en.home.cameraFailed);
    else if (r.noCamera || r.empty) setNote(r.noCamera ? en.home.noCamera : en.home.cameraEmpty);
    else if (r.taken === 1) setTaking(true);
  };
  // Still looking for the page: Done waits, so the corners found are never thrown away (review M3).
  const looking = !saved && found === undefined;
  return (
    <main class="screen">
      <TopBar title={fill(s.page, { n })} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      {note && <Panel kind="error" title={note} />}
      {taking && <p role="status">{s.getting}</p>}
      {saved || edited || found ? (
        <p>{s.found}</p>
      ) : found === null ? (
        <Panel kind="info" title={s.notFound} />
      ) : (
        <p role="status">{s.finding}</p>
      )}
      {shown > 0 && (
        <CropFrame
          src={srcOf(index)}
          turns={turns}
          aspect={shown}
          quad={q}
          onChange={setShown}
          side={0}
          onSide={() => {}}
          label={s.label}
          sideLabel={c.sideLabel}
          sideNames={c.sideNames}
          corners={{ point, onPoint: setPoint, label: s.cornerLabel, names: s.pointNames }}
        />
      )}
      <PointNudge point={point} onPoint={setPoint} move={move} reset={() => setEdited(null)} />
      <CropBar
        busy={busy}
        tools={[
          {
            label: c.turnLeft,
            icon: 'turnLeft',
            disabled: busy,
            onClick: () => void change({ type: 'turnItem', index, by: 3 }),
          },
          { label: c.turnRight, icon: 'turn', disabled: busy, onClick: () => void change({ type: 'turnItem', index }) },
          { label: c.whole, icon: 'whole', onClick: () => setEdited(WHOLE) },
          { label: s.retake, icon: 'scan', disabled: busy || taking, onClick: () => void retake() },
        ]}
        done={{ label: c.done, icon: 'check', disabled: !(shown > 0) || taking || looking, onClick: () => void done() }}
      />
    </main>
  );
}
