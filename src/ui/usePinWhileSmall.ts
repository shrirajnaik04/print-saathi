import { useLayoutEffect, useState } from 'preact/hooks';

/**
 * Whether a bar may stay pinned: while it takes at most [maxShare] of the screen's height, so it never hides what the shopkeeper
 * is reading (big text on a short screen makes bars tall). Re-measured when its size or the window changes. Returns
 * the ref to put on the bar (works for a bar that appears later) and the answer.
 *
 * While pinned at [edge], the page's scroll padding at that edge is the bar's height, so a control reached with a
 * keyboard or switch access scrolls clear of the bar instead of sitting under it (WCAG 2.4.11, Phase 11 review I6).
 */
export function usePinWhileSmall(
  maxShare: number,
  edge: 'top' | 'bottom',
): [(el: HTMLElement | null) => void, boolean] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [pinned, setPinned] = useState(true);
  useLayoutEffect(() => {
    if (!el) return;
    const root = document.documentElement.style;
    const name = `--pinned-${edge}`;
    const measure = () => {
      const pin = el.offsetHeight <= window.innerHeight * maxShare;
      setPinned(pin);
      if (pin) root.setProperty(name, `${el.offsetHeight + 8}px`);
      else root.removeProperty(name);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      root.removeProperty(name);
    };
  }, [el, maxShare, edge]);
  return [setEl, pinned];
}
