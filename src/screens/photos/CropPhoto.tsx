import { useEffect, useState } from 'preact/hooks';
import type { JobAction } from '../../core/job/job';
import { FULL } from '../../core/layout/crop';
import { recropSpot } from '../../core/layout/free';
import { boxOfSquareQuad, moveCorner, quadOfBox, shownQuad, straightAspect, uprightQuad } from '../../core/layout/quad';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { Button } from '../../ui/Button';
import { CropBar } from '../../ui/CropBar';
import { CropFrame } from '../../ui/CropFrame';
import { Panel } from '../../ui/Panel';
import { turnedStyle } from '../../ui/PaperPreview';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import type { ScreenProps } from '../types';
import { useJob } from '../useJob';
import { useStraightImages } from '../useStraightImages';

const t = en.photos;
const c = en.crop;
/** One tap of an arrow moves the chosen corner this far (a fraction of the photo). */
const STEP = 0.01;
const WHOLE = quadOfBox(FULL);
/** A frame this close to the photo's edges is the whole photo (no crop at all). */
const nearWhole = (b: { x: number; y: number; w: number; h: number }) =>
  b.x <= 0.005 && b.y <= 0.005 && b.x + b.w >= 0.995 && b.y + b.h >= 0.995;

/**
 * Crop (owner, 2026-10-24: the scanner app's crop): the photo as it prints (turned) with a frame whose corners move
 * freely — dragged, or one corner at a time with the arrows (PLAN §H2.5). Square with the photo it is a plain crop; a
 * slanted frame is straightened when printed (shown below as it will print). It starts on the frame or crop the photo
 * has, else the black edges found, else the whole photo. Turn left / right turn the photo itself, the frame with it.
 * The customer's file never changes.
 */
export function CropPhoto({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const index = Number(params?.index ?? 0);
  const { job, aspects, srcOf, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  // The frame being made, on the upright photo (so a turn keeps it on the same part of the photo).
  const [edited, setEdited] = useState<number[] | null>(null);
  const [chosen, setChosen] = useState(0);
  // Where the frame starts: its straightened frame, else its crop, else (unless the shopkeeper removed the edges and
  // then chose the whole photo) the edges found, else the whole photo (gate M-1).
  const start =
    job?.quads?.[index] ??
    quadOfBox(job?.crops?.[index] ?? (job?.edges === 'removed' ? undefined : job?.suggested?.[index]) ?? FULL);
  const upright = edited ?? start;
  const square = boxOfSquareQuad(upright);
  // The straightened result, a moment after the corners stop moving (the engine makes it; never on every move).
  const [settled, setSettled] = useState<number[] | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(upright), 350);
    return () => clearTimeout(timer);
  }, [upright.join(',')]);
  const slanted = settled && !boxOfSquareQuad(settled) ? settled : null;
  const preview = useStraightImages(jobId, slanted ? [{ item: index, quad: slanted }] : undefined, 480);
  if (gone) return <JobGone go={go} title={t.crop} />;
  const turns = job?.turns[index] ?? 0;
  const a = aspects.get(index) ?? 0;
  const shown = a > 0 ? (turns % 2 === 1 ? 1 / a : a) : 0;
  const q = shownQuad(upright, turns);
  const at = job ? job.order.filter((i) => srcOf(i)).indexOf(index) : -1;
  // From a document's page tools: the page's own name ("Page 3", "File 2, page 1"), from numbers in the stack only.
  const fileNo = Number(params?.file ?? 0);
  const pageNo = Number(params?.page ?? 0);
  const title =
    pageNo > 0
      ? fill(t.cropOf, {
          page: fileNo > 0 ? fill(en.docs.filePageN, { f: fileNo, n: pageNo }) : fill(en.docs.pageN, { n: pageNo }),
        })
      : fill(t.cropTitle, { n: Math.max(1, at + 1) });
  const setShown = (next: number[]) => setEdited(uprightQuad(next, turns));
  const nudge = (dx: number, dy: number) =>
    setShown(moveCorner(q, chosen, (q[2 * chosen] as number) + dx, (q[2 * chosen + 1] as number) + dy));
  const done = async () => {
    const box = boxOfSquareQuad(upright);
    const whole = !!box && nearWhole(box);
    const cut: JobAction = whole
      ? job?.quads?.[index]
        ? { type: 'setQuad', item: index, quad: null }
        : { type: 'setCrop', item: index, crop: null }
      : box
        ? { type: 'setCrop', item: index, crop: box }
        : { type: 'setQuad', item: index, quad: upright };
    // A photo placed by hand keeps the part left where it was, at its print scale (Word's crop; review I4).
    const spot = job?.spots?.[index];
    const long = job?.sizes?.[index];
    const was = { crop: job?.crops?.[index], quad: job?.quads?.[index] };
    const now = whole ? {} : box ? { crop: box } : { quad: upright };
    const at = spot && long && a > 0 ? recropSpot(spot, long, a, turns, was, now) : null;
    const saved = await change(
      spot && at ? { type: 'all', actions: [cut, { type: 'placeItem', item: index, page: spot.page, ...at }] } : cut,
    );
    if (saved) go({ type: 'back' });
  };
  const straightSrc = slanted && !square ? preview({ item: index, quad: slanted }) : undefined;
  const straightShape = square || !(a > 0) ? 0 : straightAspect(upright, a);
  return (
    <main class="screen">
      <TopBar title={title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      <p>{t.cropHint}</p>
      {shown > 0 && (
        <CropFrame
          src={srcOf(index)}
          turns={turns}
          aspect={shown}
          quad={q}
          onChange={setShown}
          chosen={chosen}
          onChoose={setChosen}
          label={t.cropLabel}
          cornerLabel={c.cornerLabel}
          cornerNames={c.cornerNames}
        />
      )}
      <p role="status" class="corner-now">
        {fill(c.corner, { k: chosen + 1, name: c.cornerNames[chosen] ?? '' })}
      </p>
      <div class="nudge-grid">
        <Button variant="secondary" icon="next" onClick={() => setChosen((chosen + 1) % 4)}>
          {c.nextCorner}
        </Button>
        <Button variant="secondary" icon="up" onClick={() => nudge(0, -STEP)}>
          {c.up}
        </Button>
        <Button variant="secondary" icon="left" onClick={() => nudge(-STEP, 0)}>
          {c.left}
        </Button>
        <Button variant="secondary" icon="right" onClick={() => nudge(STEP, 0)}>
          {c.right}
        </Button>
        <Button variant="secondary" icon="down" onClick={() => nudge(0, STEP)}>
          {c.down}
        </Button>
        <Button variant="secondary" icon="undo" onClick={() => setEdited(null)}>
          {c.reset}
        </Button>
      </div>
      {!square && (
        <>
          <h2>{c.preview}</h2>
          <div
            class="straight-shot"
            style={{ aspectRatio: `${turns % 2 === 1 ? 1 / straightShape : straightShape}` }}
            role="img"
            aria-label={c.previewLabel}
          >
            {straightSrc ? (
              <span class="paper-photo paper-turned" style={{ left: 0, top: 0, width: '100%', height: '100%' }}>
                <img
                  src={straightSrc}
                  alt=""
                  style={turnedStyle(turns, turns % 2 === 1 ? 1 / straightShape : straightShape, 1)}
                />
              </span>
            ) : (
              <span class="thumb-note">{straightSrc === null ? c.noPicture : c.making}</span>
            )}
          </div>
        </>
      )}
      <CropBar
        busy={busy}
        tools={[
          { label: c.cancel, icon: 'close', onClick: () => go({ type: 'back' }) },
          { label: c.whole, icon: 'whole', onClick: () => setEdited(WHOLE) },
          {
            label: c.turnLeft,
            icon: 'turnLeft',
            disabled: busy,
            onClick: () => void change({ type: 'turnItem', index, by: 3 }),
          },
          { label: c.turnRight, icon: 'turn', disabled: busy, onClick: () => void change({ type: 'turnItem', index }) },
        ]}
        done={{ label: c.done, icon: 'check', disabled: !(shown > 0), onClick: () => void done() }}
      />
    </main>
  );
}
