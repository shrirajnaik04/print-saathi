import { en } from '../i18n/en';
import { fill } from '../i18n/fill';
import { Button } from './Button';

const c = en.crop;

/**
 * The crop frame's buttons (owner, round 3: the middle bars only): which side the arrows move ("Side 1 of 4: top"), Next
 * side, and the arrows that move it, Up / Down for the top and bottom, Left / Right for the sides (the other two are
 * greyed), [step] a tap; Start again. The button way to do what the bars do (PLAN §H2.4).
 */
export function SideNudge({
  side,
  onSide,
  move,
  reset,
  step,
}: {
  side: 0 | 1 | 2 | 3;
  onSide: (s: 0 | 1 | 2 | 3) => void;
  /** Moves the chosen side by [d] (fractions of the photo): down or right is positive. */
  move: (d: number) => void;
  reset: () => void;
  step: number;
}) {
  const across = side % 2 === 0; // top and bottom move up and down
  return (
    <>
      <p role="status" class="corner-now">
        {fill(c.side, { k: side + 1, name: c.sideNames[side] ?? '' })}
      </p>
      <div class="nudge-grid">
        <Button variant="secondary" icon="next" onClick={() => onSide(((side + 1) % 4) as 0 | 1 | 2 | 3)}>
          {c.nextSide}
        </Button>
        <Button variant="secondary" icon="up" disabled={!across} onClick={() => move(-step)}>
          {c.up}
        </Button>
        <Button variant="secondary" icon="left" disabled={across} onClick={() => move(-step)}>
          {c.left}
        </Button>
        <Button variant="secondary" icon="right" disabled={across} onClick={() => move(step)}>
          {c.right}
        </Button>
        <Button variant="secondary" icon="down" disabled={!across} onClick={() => move(step)}>
          {c.down}
        </Button>
        <Button variant="secondary" icon="undo" onClick={reset}>
          {c.reset}
        </Button>
      </div>
    </>
  );
}
