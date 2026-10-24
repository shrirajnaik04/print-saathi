import type { JobLayout } from '../job/job';

/** PLAN §F6, calibrated on real prints: below these a photo may print blurry. */
const MIN_DPI: Record<'photos' | 'document' | 'passport', number> = { photos: 100, document: 120, passport: 200 };

/** The items whose photo reached fewer dots per inch at its box than its job type needs, in item order. */
export function blurryItems(layout: JobLayout, dpi: Readonly<Record<number, number>>): number[] {
  // ID cards like passport photos (Phase 14 spec Part 2: at most 200 dpi before "may print blurry").
  const min =
    layout === 'passport' || layout === 'idCard'
      ? MIN_DPI.passport
      : layout === 'document'
        ? MIN_DPI.document
        : MIN_DPI.photos;
  return Object.entries(dpi)
    .filter(([, d]) => Number.isFinite(d) && d < min)
    .map(([k]) => Number(k))
    .sort((a, b) => a - b);
}
