import { useRef, useState } from 'preact/hooks';
import { type CropBox, dragCorner, FULL, isFull, moveBox, scaleBox, shownOf, uprightOf } from '../../core/layout/crop';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { trackGesture } from '../../ui/gestures';
import { Panel } from '../../ui/Panel';
import { turnedStyle } from '../../ui/PaperPreview';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import type { ScreenProps } from '../types';
import { useJob } from '../useJob';

const t = en.photos;
const p = en.passport;
const STEP = 0.02;
type Corner = 'tl' | 'tr' | 'bl' | 'br';

/**
 * Crop (PLAN §I-9, §H2.5): the photo as it prints (turned), with a frame the shopkeeper moves with big buttons — Move ↑ ↓ ← →,
 * Bigger, Smaller, Whole photo — or by dragging a corner (an extra, never the only way). It starts on the crop the
 * photo has, else the black edges found, else the whole photo. The customer's file never changes.
 */
export function CropPhoto({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const index = Number(params?.index ?? 0);
  const { job, aspects, srcOf, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  const [edited, setEdited] = useState<CropBox | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ corner: Corner; x: number; y: number; from: CropBox; id: number; el: HTMLElement } | null>(
    null,
  );
  const [dragging, setDragging] = useState<Corner | null>(null);
  const gesture = useRef(trackGesture());
  if (gone) return <JobGone go={go} title={t.crop} />;
  const turns = job?.turns[index] ?? 0;
  const a = aspects.get(index) ?? 0;
  const shown = a > 0 ? (turns % 2 === 1 ? 1 / a : a) : 0;
  // The photo's crop; else, unless the shopkeeper removed the edges and then chose the whole photo, the edges found (gate M-1).
  const stored = job?.crops?.[index] ?? (job?.edges === 'removed' ? undefined : job?.suggested?.[index]) ?? FULL;
  const r = edited ?? shownOf(stored, turns);
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
  const pct = (v: number) => `${Math.round(v * 10000) / 100}%`;
  const apply = async () => {
    if (await change({ type: 'setCrop', item: index, crop: isFull(r) ? null : uprightOf(r, turns) }))
      go({ type: 'back' });
  };
  // One finger drags one corner; a second finger, a cancelled touch or a lost capture ends nothing else (gate M-3).
  const start = (corner: Corner) => (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    // One finger at a time: a second finger never takes over. A drag whose handle is gone (the photo area was
    // redrawn) never blocks the next one.
    if (drag.current && !drag.current.el.isConnected) drag.current = null;
    if (drag.current) return;
    // No text selection or native drag may start: the browser would cancel this pointer after one move.
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    drag.current = { corner, x: e.clientX, y: e.clientY, from: r, id: e.pointerId, el };
    setDragging(corner);
  };
  const end = (e: PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(null); // redraw: a corner hidden on a small frame goes away when let go
  };
  const moveDrag = (e: PointerEvent) => {
    const d = drag.current;
    const box = stage.current?.getBoundingClientRect();
    if (!d || !box || d.id !== e.pointerId) return;
    setEdited(dragCorner(d.from, d.corner, (e.clientX - d.x) / box.width, (e.clientY - d.y) / box.height));
  };
  // One finger on the photo (not on a corner) moves the frame; two fingers make it bigger or smaller (owner,
  // 2026-10-23). Extras: the buttons do the same (PLAN §H2.4).
  const onStageDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.crop-handle') || drag.current) return;
    if (!gesture.current.down(e.pointerId, e.clientX, e.clientY)) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onStageMove = (e: PointerEvent) => {
    const box = stage.current?.getBoundingClientRect();
    const step = gesture.current.move(e.pointerId, e.clientX, e.clientY);
    if (!box || !step) return;
    setEdited((cur) => {
      const moved = moveBox(cur ?? r, step.dx / box.width, step.dy / box.height);
      return step.kind === 'pinch' ? scaleBox(moved, step.factor) : moved;
    });
  };
  const onStageUp = (e: PointerEvent) => gesture.current.up(e.pointerId);
  return (
    <main class="screen">
      <TopBar title={title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      <p>{t.cropHint}</p>
      {shown > 0 && (
        <div
          ref={stage}
          class="crop-stage"
          style={{ aspectRatio: `${shown}`, '--a': `${shown}` }}
          role="img"
          aria-label={t.cropLabel}
          onPointerDown={onStageDown}
          onPointerMove={onStageMove}
          onPointerUp={onStageUp}
          onPointerCancel={onStageUp}
          onLostPointerCapture={onStageUp}
        >
          <span class="paper-photo paper-turned" style={{ left: 0, top: 0, width: '100%', height: '100%' }}>
            <img src={srcOf(index)} alt="" style={turnedStyle(turns, shown, 1)} />
          </span>
          <span class="passport-frame" style={{ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) }}>
            {/* A small frame shows two handles only, so they never sit on top of each other (gate M-3); the other two
                stay in place, hidden, so a corner being dragged is never removed mid-drag (re-review I-B). */}
            {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
              <span
                key={c}
                class={`crop-handle crop-handle-${c}${
                  (r.w < 0.3 || r.h < 0.3) && (c === 'tr' || c === 'bl') && dragging !== c ? ' crop-handle-off' : ''
                }`}
                aria-hidden="true"
                onPointerDown={start(c)}
                onPointerMove={moveDrag}
                onPointerUp={end}
                onPointerCancel={end}
                onLostPointerCapture={end}
              />
            ))}
          </span>
        </div>
      )}
      <div class="nudge-grid">
        <Button variant="secondary" icon="up" onClick={() => setEdited(moveBox(r, 0, -STEP))}>
          {p.up}
        </Button>
        <Button variant="secondary" icon="down" onClick={() => setEdited(moveBox(r, 0, STEP))}>
          {p.down}
        </Button>
        <Button variant="secondary" icon="left" onClick={() => setEdited(moveBox(r, -STEP, 0))}>
          {p.left}
        </Button>
        <Button variant="secondary" icon="right" onClick={() => setEdited(moveBox(r, STEP, 0))}>
          {p.right}
        </Button>
        <Button variant="secondary" icon="plus" onClick={() => setEdited(scaleBox(r, 1.1))}>
          {p.bigger}
        </Button>
        <Button variant="secondary" icon="minus" onClick={() => setEdited(scaleBox(r, 1 / 1.1))}>
          {p.smaller}
        </Button>
      </div>
      <div class="nudge-grid">
        <Button variant="secondary" onClick={() => setEdited(FULL)}>
          {t.whole}
        </Button>
        <Button variant="secondary" icon="undo" onClick={() => setEdited(null)}>
          {p.reset}
        </Button>
      </div>
      <ActionBar>
        <Button icon="check" busy={busy} disabled={!(shown > 0)} onClick={() => void apply()}>
          {t.apply}
        </Button>
      </ActionBar>
    </main>
  );
}
