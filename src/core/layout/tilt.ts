import type { Box } from './onePerPage';

/**
 * A photo turned to any angle (owner, round 3: WPS's rotate handle). The job keeps the quarter turns it already has plus
 * a tilt of −45°…45° (degrees clockwise, 0.1° steps), so every quarter-turn rule (crops kept upright, turned shapes)
 * still holds; the tilt turns the photo further about its centre. On the page it takes the room of its turned outline.
 */

/** A placement's own box: a tilted photo's own size centred in its outline [box] (before the tilt); else [box]. */
export function ownBox(p: { box: Box; tilt?: { w: number; h: number } }): Box {
  if (!p.tilt) return p.box;
  const { w, h } = p.tilt;
  return { x: p.box.x + (p.box.w - w) / 2, y: p.box.y + (p.box.h - h) / 2, w, h };
}

/** [angle] as people read it: whole degrees from −179 to 180 (350° clockwise reads −10°). */
export function shownDegrees(angle: number): number {
  const a = ((angle % 360) + 360) % 360;
  return Math.round(a > 180 ? a - 360 : a) || 0; // never −0
}

/** The angle (degrees clockwise) of [turns] quarter turns and a [tilt]. */
export const angleOf = (turns: number, tilt: number): number => turns * 90 + tilt;

/** An angle (degrees clockwise, any value) as quarter turns and a tilt in (−45, 45], to 0.1°. */
export function partsOf(angle: number): { turns: 0 | 1 | 2 | 3; tilt: number } {
  const a = Math.round((((angle % 360) + 360) % 360) * 10) / 10;
  let q = Math.round(a / 90);
  let tilt = Math.round((a - q * 90) * 10) / 10;
  if (tilt <= -45) {
    tilt += 90;
    q -= 1;
  }
  return { turns: (((q % 4) + 4) % 4) as 0 | 1 | 2 | 3, tilt: tilt === 0 ? 0 : tilt };
}

/** [angle] clicked into straight (0°, 90°, 180°, 270°) when within [within] degrees of it. */
export function snap(angle: number, within = 3): number {
  const straight = Math.round(angle / 90) * 90 || 0; // never −0
  return Math.abs(angle - straight) <= within ? straight : angle;
}

/** The outline (bounding box) of a [w] × [h] photo turned [deg] degrees about its centre. */
export function outline(w: number, h: number, deg: number): { w: number; h: number } {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: w * c + h * s, h: w * s + h * c };
}

/**
 * The photo's own size (shape [aspect], width ÷ height) whose outline, turned [deg] degrees, is [box] (a box with the
 * outline's shape, as the layout makes it).
 */
export function innerOf(box: { w: number; h: number }, aspect: number, deg: number): { w: number; h: number } {
  const r = (deg * Math.PI) / 180;
  const h = box.w / (aspect * Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)));
  return { w: aspect * h, h };
}
