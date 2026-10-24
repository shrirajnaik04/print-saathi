import { useEffect, useRef } from 'preact/hooks';

/**
 * Feedback must appear where the shopkeeper is looking (gate review: a message below the fold made a tap look dead).
 * When [key] becomes non-null, the element with the returned ref is scrolled into view.
 */
export function useRevealOnShow<T extends HTMLElement>(key: string | null) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (key !== null) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [key]);
  return ref;
}
