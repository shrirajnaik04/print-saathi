import { useEffect, useState } from 'preact/hooks';

/** A wide screen held sideways (tablets, a phone in landscape): Adjust's tools sit beside the page (ui.css breakpoint). */
export const WIDE_SIDEWAYS = '(min-width: 45rem) and (orientation: landscape)';

/** Whether the media [query] matches, following changes (rotation, window size, text size in rem queries). */
export function useMatches(query: string): boolean {
  const now = () => typeof matchMedia === 'function' && matchMedia(query).matches;
  const [on, setOn] = useState(now);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(query);
    const change = () => setOn(m.matches);
    change();
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, [query]);
  return on;
}
