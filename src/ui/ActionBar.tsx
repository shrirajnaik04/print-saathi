import type { ComponentChildren } from 'preact';
import { en } from '../i18n/en';
import { usePinWhileSmall } from './usePinWhileSmall';

/** Largest share of the screen a pinned bar may cover; above it the bar sits after the content instead. */
const MAX_PINNED_SHARE = 0.25;

/**
 * Bottom action area above the gesture bar. It stays pinned while it is small; with big text on a short screen it
 * would hide what the shopkeeper is reading (measured: up to 49 % of a 320×640 screen at 200 %), so it then flows after the
 * content. Re-measured when its size or the window changes (text size, rotation).
 */
export function ActionBar({ children }: { children: ComponentChildren }) {
  const [ref, pinned] = usePinWhileSmall(MAX_PINNED_SHARE, 'bottom');
  return (
    <section ref={ref} class={pinned ? 'actionbar' : 'actionbar actionbar-flow'} aria-label={en.ui.actions}>
      {children}
    </section>
  );
}
