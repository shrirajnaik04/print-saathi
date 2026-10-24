/** Largest text size the screens are tested at (Playwright matrix: 100–200 %). */
export const MAX_TEXT_PERCENT = 200;

/**
 * Root font size (percent) for the phone's font-scale setting. The WebView's own text zoom is pinned at 100 %
 * natively, so this is the only scaling and tests see exactly what ships (PLAN §D6).
 */
export function rootFontPercent(fontScale: number | undefined): number {
  if (fontScale === undefined || !Number.isFinite(fontScale) || fontScale <= 0) return 100;
  return Math.round(Math.min(Math.max(fontScale, 1), MAX_TEXT_PERCENT / 100) * 100);
}

export function applyTextScale(fontScale: number | undefined, root: HTMLElement = document.documentElement): void {
  root.style.fontSize = `${rootFontPercent(fontScale)}%`;
}
