/**
 * Zoom on Adjust (owner, round 4: "allow making the page zoom in and zoom out so that we can even work on smaller images
 * precisely"): Zoom in / Zoom out go a step at a time; two fingers may stop anywhere between 100 % and 400 %.
 */
export const ZOOM_STEPS = [1, 1.5, 2, 3, 4] as const;
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

/** The step above (by 1) or below (by -1) [z], which a pinch may have left between steps. */
export function nextZoom(z: number, by: 1 | -1): number {
  const near = 1e-6;
  if (by === 1) return ZOOM_STEPS.find((s) => s > z + near) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((s) => s < z - near) ?? ZOOM_MIN;
}
