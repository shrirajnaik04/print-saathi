import { useRef, useState } from 'preact/hooks';
import { moveCorner, moveQuad, moveSide, scaleQuad } from '../core/layout/quad';
import { fill } from '../i18n/fill';
import { trackGesture } from './gestures';
import { turnedStyle } from './PaperPreview';

/** How much bigger the magnifier shows the picture, and its size (px). */
const ZOOM = 2.5;
const LOUPE = 112;

type Drag = { kind: 'corner' | 'side'; k: number; id: number; x: number; y: number; from: number[]; el: HTMLElement };

type Props = {
  /** The picture (a file the WebView may show), drawn turned [turns] quarter turns clockwise. */
  src: string | undefined;
  turns: number;
  /** The picture's shape as shown (width ÷ height, after the turns). */
  aspect: number;
  /** The frame on the picture as shown: 8 fractions, top-left, top-right, bottom-right, bottom-left. */
  quad: number[];
  onChange: (quad: number[]) => void;
  /** The corner the arrow buttons move (0–3), and choosing one by tapping it. */
  chosen: number;
  onChoose: (k: number) => void;
  /** The picture's name for screen readers, and each corner's ("The top left corner"). */
  label: string;
  cornerLabel: string;
  cornerNames: readonly string[];
};

const pct = (v: number) => `${Math.round(v * 10000) / 100}%`;

/**
 * The scanner app's crop frame (owner, 2026-10-24): the picture as it prints, the part outside the frame dimmed, a
 * round handle at each corner (each moves on its own: a slanted photo is straightened) and a pill in the middle of each
 * side (moves that side). One finger elsewhere on the picture moves the frame, two make it bigger or smaller. While a
 * handle is held, a magnifier shows what is under the finger. The screen's arrow buttons do the same (PLAN §H2.4).
 */
export function CropFrame({
  src,
  turns,
  aspect,
  quad,
  onChange,
  chosen,
  onChoose,
  label,
  cornerLabel,
  cornerNames,
}: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const gesture = useRef(trackGesture());
  // Where the magnifier looks (fractions of the picture), and the picture's size then (px).
  const [loupe, setLoupe] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const pt = (q: number[], k: number) => [q[2 * k] as number, q[2 * k + 1] as number] as const;
  const mid = (q: number[], s: number) => {
    const [ax, ay] = pt(q, s);
    const [bx, by] = pt(q, (s + 1) % 4);
    return [(ax + bx) / 2, (ay + by) / 2] as const;
  };
  const lookAt = (q: number[], d: Drag) => (d.kind === 'corner' ? pt(q, d.k) : mid(q, d.k));

  const startHandle = (kind: Drag['kind'], k: number) => (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    // One finger at a time; a drag whose handle was redrawn away never blocks the next one.
    if (drag.current && !drag.current.el.isConnected) drag.current = null;
    if (drag.current) return;
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture?.(e.pointerId);
    if (kind === 'corner') onChoose(k);
    const d: Drag = { kind, k, id: e.pointerId, x: e.clientX, y: e.clientY, from: quad, el };
    drag.current = d;
    const r = stage.current?.getBoundingClientRect();
    const [x, y] = lookAt(quad, d);
    if (r) setLoupe({ x, y, w: r.width, h: r.height });
  };
  const moveHandle = (e: PointerEvent) => {
    const d = drag.current;
    const r = stage.current?.getBoundingClientRect();
    if (!d || !r || d.id !== e.pointerId) return;
    const dx = (e.clientX - d.x) / r.width;
    const dy = (e.clientY - d.y) / r.height;
    const next =
      d.kind === 'corner'
        ? moveCorner(d.from, d.k, (d.from[2 * d.k] as number) + dx, (d.from[2 * d.k + 1] as number) + dy)
        : moveSide(d.from, d.k as 0 | 1 | 2 | 3, dx, dy);
    onChange(next);
    const [x, y] = lookAt(next, d);
    setLoupe({ x, y, w: r.width, h: r.height });
  };
  const endHandle = (e: PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setLoupe(null);
  };
  // Elsewhere on the picture: one finger moves the frame, two make it bigger or smaller.
  const onStageDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.scan-handle') || drag.current) return;
    if (!gesture.current.down(e.pointerId, e.clientX, e.clientY)) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onStageMove = (e: PointerEvent) => {
    const r = stage.current?.getBoundingClientRect();
    const step = gesture.current.move(e.pointerId, e.clientX, e.clientY);
    if (!r || !step) return;
    const moved = moveQuad(quad, step.dx / r.width, step.dy / r.height);
    onChange(step.kind === 'pinch' ? scaleQuad(moved, step.factor) : moved);
  };
  const onStageUp = (e: PointerEvent) => gesture.current.up(e.pointerId);

  const corners = [0, 1, 2, 3].map((k) =>
    pt(quad, k)
      .map((v) => v * 100)
      .join(','),
  );
  const points = corners.join(' ');
  const picture = (
    <span
      class="paper-photo paper-turned"
      style={{ left: 0, top: 0, width: '100%', height: '100%' }}
      aria-hidden="true"
    >
      <img src={src} alt="" style={turnedStyle(turns, aspect, 1)} />
    </span>
  );
  const lines = (
    <svg class="scan-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path class="scan-dim" fill-rule="evenodd" d={`M0 0H100V100H0Z M${corners.join(' L')}Z`} />
      <polygon points={points} />
    </svg>
  );
  // The magnifier sits at the top-left, or at the top-right while the finger is in the top-left third.
  const right = !!loupe && loupe.x < 1 / 3 && loupe.y < 1 / 3;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: an extra (drag or pinch the frame); the corner buttons and arrows do the same
    <div
      ref={stage}
      class="crop-stage scan-stage"
      style={{ aspectRatio: `${aspect}`, '--a': `${aspect}` }}
      onPointerDown={onStageDown}
      onPointerMove={onStageMove}
      onPointerUp={onStageUp}
      onPointerCancel={onStageUp}
      onLostPointerCapture={onStageUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Named for screen readers here, not on the stage: the corner buttons inside it must not be inside an image. */}
      <span class="scan-picture" role="img" aria-label={label}>
        {picture}
      </span>
      {lines}
      {[0, 1, 2, 3].map((s) => {
        const [x, y] = mid(quad, s);
        const [ax, ay] = pt(quad, s);
        const [bx, by] = pt(quad, (s + 1) % 4);
        // Along its side as it looks on screen (x fractions are [aspect] times as long as y fractions).
        const angle = (Math.atan2(by - ay, (bx - ax) * aspect) * 180) / Math.PI;
        return (
          <span
            key={`side-${s}`}
            class="scan-handle scan-side"
            style={{ left: pct(x), top: pct(y), '--angle': `${angle}deg` }}
            aria-hidden="true"
            onPointerDown={startHandle('side', s)}
            onPointerMove={moveHandle}
            onPointerUp={endHandle}
            onPointerCancel={endHandle}
            onLostPointerCapture={endHandle}
          />
        );
      })}
      {/* In reading order (top left, top right, bottom left, bottom right): how a screen reader goes through them. */}
      {[0, 1, 3, 2].map((k) => {
        const [x, y] = pt(quad, k);
        return (
          <button
            key={`corner-${k}`}
            type="button"
            class={k === chosen ? 'scan-handle scan-corner scan-corner-on' : 'scan-handle scan-corner'}
            style={{ left: pct(x), top: pct(y) }}
            aria-label={fill(cornerLabel, { name: cornerNames[k] ?? '' })}
            aria-pressed={k === chosen}
            onClick={() => onChoose(k)}
            onPointerDown={startHandle('corner', k)}
            onPointerMove={moveHandle}
            onPointerUp={endHandle}
            onPointerCancel={endHandle}
            onLostPointerCapture={endHandle}
          />
        );
      })}
      {loupe && (
        <div class={right ? 'scan-loupe scan-loupe-right' : 'scan-loupe'} aria-hidden="true">
          <div
            class="scan-loupe-view"
            style={{
              width: `${loupe.w * ZOOM}px`,
              height: `${loupe.h * ZOOM}px`,
              left: `${LOUPE / 2 - loupe.x * loupe.w * ZOOM}px`,
              top: `${LOUPE / 2 - loupe.y * loupe.h * ZOOM}px`,
            }}
          >
            {picture}
            {lines}
          </div>
          <span class="scan-loupe-plus" />
        </div>
      )}
    </div>
  );
}
