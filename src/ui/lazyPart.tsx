import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/**
 * A part of a screen off the start path (startup JS budget, PLAN §C): its code loads the first time it is shown, and
 * nothing is drawn until then (round 9: the Office card on Received and Ready).
 */
export function lazyPart<P extends object>(
  load: () => Promise<(p: P) => JSX.Element | null>,
): (p: P) => JSX.Element | null {
  let part: ((p: P) => JSX.Element | null) | undefined;
  let loading: Promise<void> | undefined;
  return function Lazy(props: P) {
    const [, setLoaded] = useState(0);
    useEffect(() => {
      if (part) return;
      loading ??= load().then(
        (p) => {
          part = p;
        },
        () => {
          loading = undefined; // the next showing tries again
        },
      );
      let live = true;
      void loading.then(() => live && setLoaded((n) => n + 1));
      return () => {
        live = false;
      };
    }, []);
    const Part = part;
    return Part ? <Part {...props} /> : null;
  };
}
