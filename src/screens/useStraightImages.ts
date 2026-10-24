import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'preact/hooks';
import { passwords } from '../native/passwords';
import { PrintEngine } from '../native/printEngine';

/** A straightened part of a photo or PDF page: its corners on the upright image (TL, TR, BR, BL). */
export type Straight = { item: number; page?: number; quad: number[] };

/**
 * The straightened image of each part (made by the engine; ID cards, and photos straightened in the crop screen, owner
 * 2026-10-24), refreshed when its corners change.
 */
export function useStraightImages(jobId: string, parts: readonly Straight[] | undefined, width = 640) {
  const [images, setImages] = useState<Record<string, string | null>>({});
  const key = (c: Straight) => `${c.item}:${c.page ?? ''}:${c.quad.join(',')}`;
  useEffect(() => {
    let live = true;
    for (const c of parts ?? []) {
      const k = key(c);
      if (k in images) continue;
      void PrintEngine.cardImage({
        jobId,
        item: c.item,
        ...(c.page !== undefined ? { page: c.page } : {}),
        quad: c.quad,
        width,
        password: passwords.forJob(jobId)[c.item],
      }).then(
        ({ path }) => live && setImages((m) => ({ ...m, [k]: path })),
        () => live && setImages((m) => ({ ...m, [k]: null })),
      );
    }
    return () => {
      live = false;
    };
  }, [jobId, parts?.map(key).join('|')]);
  /** The picture; undefined while it is being made, null when it could not be made (review m14). */
  return (c: Straight): string | null | undefined => {
    const p = images[key(c)];
    if (p === null) return null;
    return p ? (p.startsWith('data:') ? p : Capacitor.convertFileSrc(p)) : undefined;
  };
}
