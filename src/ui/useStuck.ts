import { useEffect, useState } from 'preact/hooks';

/**
 * Whether a sticky element is stuck at its top edge right now (it has reached its `top`): the page has scrolled up to
 * it. Used for the page bar on Ready, whose cover over the status-bar strip must only show while it is stuck (round 10).
 */
export function useStuck(el: HTMLElement | null): boolean {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = Number.parseFloat(getComputedStyle(el).top) || 0;
      setStuck(el.getBoundingClientRect().top <= top + 0.5 && window.scrollY > 0);
    };
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', soon, { passive: true });
    window.addEventListener('resize', soon);
    return () => {
      window.removeEventListener('scroll', soon);
      window.removeEventListener('resize', soon);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [el]);
  return stuck;
}
