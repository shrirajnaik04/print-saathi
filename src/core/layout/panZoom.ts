import { fitFrame } from '../plan/plan';

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Fit the face the WhatsApp way (owner, 2026-10-23): the frame stands still and the photo moves under it. [r] is the
 * part of the photo inside the frame (fractions of the photo as shown, [shown] = its width ÷ height; [frame] = the
 * frame's width ÷ height). The photo moves [dx], [dy] frame widths and heights (right and down are positive), so the
 * part inside the frame moves the other way. The frame never leaves the photo.
 */
export function panPhoto(r: Rect, dx: number, dy: number, shown: number, frame: number): Rect {
  return fitFrame({ x: r.x - dx * r.w, y: r.y - dy * r.h, w: r.w, h: r.h }, shown, frame);
}

/**
 * The photo [factor] times bigger under the frame (above 1 = zoom in), keeping the photo still at [at] (fractions of
 * the frame: where the fingers pinch; the frame's middle by default). It stops when the frame holds 20 % of the photo,
 * and when the frame holds as much of the photo as fits.
 */
export function zoomPhoto(
  r: Rect,
  factor: number,
  shown: number,
  frame: number,
  at: { x: number; y: number } = { x: 0.5, y: 0.5 },
): Rect {
  const w = r.w / factor;
  const h = r.h / factor;
  const px = r.x + at.x * r.w;
  const py = r.y + at.y * r.h;
  return fitFrame({ x: px - at.x * w, y: py - at.y * h, w, h }, shown, frame);
}
