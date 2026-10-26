import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { scanWords } from '../../i18n/scan';
import { Button } from '../../ui/Button';

const c = en.crop;
const s = scanWords;

/**
 * A scanned page's frame without dragging (owner, round 8; PLAN §H2.4): which point the arrows move ("Point 1 of 8: top
 * left corner"), Next point, and the arrows: a corner moves any way, a side straight in or out (Up / Down for the top
 * and bottom, Left / Right for the sides; the other two are greyed). Start again goes back to the corners found.
 */
export function PointNudge({
  point,
  onPoint,
  move,
  reset,
}: {
  point: number;
  onPoint: (p: number) => void;
  /** Moves the chosen point by (dx, dy) arrow steps: right and down are positive. */
  move: (dx: number, dy: number) => void;
  reset: () => void;
}) {
  const side = point >= 4 ? point - 4 : -1;
  const upDown = side < 0 || side % 2 === 0;
  const leftRight = side < 0 || side % 2 === 1;
  return (
    <>
      <p role="status" class="corner-now">
        {fill(s.point, { k: point + 1, name: s.pointNames[point] ?? '' })}
      </p>
      <div class="nudge-grid">
        <Button variant="secondary" icon="next" onClick={() => onPoint((point + 1) % 8)}>
          {s.nextPoint}
        </Button>
        <Button variant="secondary" icon="up" disabled={!upDown} onClick={() => move(0, -1)}>
          {c.up}
        </Button>
        <Button variant="secondary" icon="left" disabled={!leftRight} onClick={() => move(-1, 0)}>
          {c.left}
        </Button>
        <Button variant="secondary" icon="right" disabled={!leftRight} onClick={() => move(1, 0)}>
          {c.right}
        </Button>
        <Button variant="secondary" icon="down" disabled={!upDown} onClick={() => move(0, 1)}>
          {c.down}
        </Button>
        <Button variant="secondary" icon="undo" onClick={reset}>
          {c.reset}
        </Button>
      </div>
    </>
  );
}
