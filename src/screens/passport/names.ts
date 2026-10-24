import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';

/** Millimetres as centimetres, the way a ruler reads them: 34.4 → "3.44", 35 → "3.5", 100 → "10". */
export const cmOf = (mm: number) => String(Math.round(mm * 10) / 100);

/** A passport size's name: a standard one, or "Custom: 3.44 × 4.23 cm". */
export function sizeName(preset: string, sizeMm?: { w: number; h: number }): string {
  if (preset === 'custom' && sizeMm) return fill(en.passport.customOf, { w: cmOf(sizeMm.w), h: cmOf(sizeMm.h) });
  return en.settings.sizes[preset as keyof typeof en.settings.sizes] ?? en.settings.sizes['35x45'];
}

/** A border's name in plain words with its weight, e.g. "Normal (1½ pt)"; none = "No border". */
export function borderName(border: number | undefined): string {
  return en.passport.borders[String(border ?? 0) as keyof typeof en.passport.borders] ?? en.passport.borders['0'];
}
