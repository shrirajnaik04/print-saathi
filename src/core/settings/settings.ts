/**
 * The shop owner's settings (PLAN §I-15). Stored by the phone in state/settings.json (never backed up); this module
 * is the only writer and reads any file field by field, so a damaged or old file never breaks a screen (§E).
 */
export type Retention = '1h' | '1d' | '7d';
/** Space kept blank around photos on A4, by Word's names (owner, 2026-10-24: "narrow, same as Word"). */
export type Margins = 'narrow' | 'normal' | 'small';
/** Each side, in mm: Word's Narrow and Normal; Small is the edge photos had before (PLAN §G0). */
export const MARGIN_MM: Record<Margins, number> = { narrow: 12.7, normal: 25.4, small: 6 };
export type PassportPreset = '35x45' | '20x25' | '2x2in' | 'custom';
/** Passport photo border widths in points (the line weights Word offers); 0 = none (owner, 2026-10-23). */
export const PASSPORT_BORDERS = [0, 0.5, 1, 1.5, 2.25, 3] as const;
export type PassportBorder = (typeof PASSPORT_BORDERS)[number];
/** A custom passport size: each side 1.5 to 10 cm (it always fits A4). */
export const CUSTOM_MIN_MM = 15;
export const CUSTOM_MAX_MM = 100;
/** A custom size, kept to 0.1 mm, or none when either side is outside 1.5–10 cm. */
export function customSize(o: unknown): { wMm: number; hMm: number } | undefined {
  const c = o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= CUSTOM_MIN_MM && v <= CUSTOM_MAX_MM;
  return ok(c.wMm) && ok(c.hMm)
    ? { wMm: Math.round((c.wMm as number) * 10) / 10, hMm: Math.round((c.hMm as number) * 10) / 10 }
    : undefined;
}
export type Colour = 'colour' | 'bw';

export type Settings = {
  v: 1;
  /** Printed in the problem report and on the test page; nowhere on customers' prints. */
  shopName: string;
  /** "Delete customer files after" (PLAN §E): 1 hour / 1 day (default) / 7 days. */
  retention: Retention;
  passport: {
    preset: PassportPreset;
    count: number;
    prices: Record<number, number>;
    /** The black border new passport jobs start with (points; 0 = none). */
    border: PassportBorder;
    /** The shop's own size, offered beside the standard ones ('custom' uses it). */
    custom?: { wMm: number; hMm: number };
  };
  /**
   * The paper new photo jobs start on (the paper printed last). No colour here: every job starts in colour (owner,
   * round 3); an older file's colours are ignored.
   */
  defaults: { photos: { paper: 'A4' | 'PHOTO_4x6' } };
  /** "Put 4×6 photo paper in the printer" on passport jobs (PLAN §J4). */
  photoPaperReminder: boolean;
  /** Advanced: "Space at paper edges" — more for printers that cut off the edge despite calibration. */
  edges: 'normal' | 'more';
  /** Photo pages on A4: Word's margins (passport sheets, ID cards, documents and 4×6 paper keep their own). */
  margins: Margins;
  /** "Allow screenshots for 15 minutes" (PLAN §D6): until this time (ms), 0 = off. */
  screenshotsUntil: number;
  /** The first-start steps were shown (PLAN §I-16): never again. */
  welcomed: boolean;
  /** "How big?" for ID cards (Phase 14): the last size used comes first. */
  cardSize: 'real' | 'big' | 'sets' | 'page';
};

/** Passport photos in one job or as the shop's usual count (owner, round 3: up to 100; extra sheets as needed). */
export const MAX_PASSPORT_COUNT = 100;
const MAX_PRICE = 99_999;
const MAX_SHOP_NAME = 40;

export const DEFAULT_SETTINGS: Settings = {
  v: 1,
  shopName: '',
  retention: '1d',
  passport: { preset: '35x45', count: 5, prices: { 5: 50 }, border: 1.5 },
  defaults: { photos: { paper: 'A4' } },
  photoPaperReminder: true,
  edges: 'normal',
  margins: 'narrow',
  screenshotsUntil: 0,
  welcomed: false,
  cardSize: 'real',
};

const obj = (o: unknown): Record<string, unknown> =>
  o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const colourOf = (o: unknown, fallback: Colour): Colour => oneOf(obj(o).colour, ['colour', 'bw'] as const, fallback);

function prices(o: unknown): Record<number, number> {
  if (o === undefined) return { ...DEFAULT_SETTINGS.passport.prices };
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(obj(o))) {
    const count = Number(k);
    const price = Math.round(Number(v));
    if (Number.isInteger(count) && count >= 1 && count <= MAX_PASSPORT_COUNT && price > 0 && price <= MAX_PRICE)
      out[count] = price;
  }
  return out;
}

/** Any stored value as valid settings; reading the result again changes nothing. */
export function normalizeSettings(o: unknown): Settings {
  const s = obj(o);
  const p = obj(s.passport);
  const d = DEFAULT_SETTINGS;
  const count = Number(p.count);
  const until = Number(s.screenshotsUntil);
  return {
    v: 1,
    shopName: typeof s.shopName === 'string' ? s.shopName.trim().slice(0, MAX_SHOP_NAME).trim() : d.shopName,
    retention: oneOf(s.retention, ['1h', '1d', '7d'] as const, d.retention),
    passport: {
      // 'custom' only with a custom size to go with it.
      preset: oneOf(
        p.preset,
        customSize(p.custom)
          ? (['35x45', '20x25', '2x2in', 'custom'] as const)
          : (['35x45', '20x25', '2x2in'] as const),
        d.passport.preset,
      ),
      count: Number.isFinite(count) ? Math.min(MAX_PASSPORT_COUNT, Math.max(1, Math.round(count))) : d.passport.count,
      prices: prices(p.prices),
      border: (PASSPORT_BORDERS as readonly number[]).includes(p.border as number)
        ? (p.border as PassportBorder)
        : d.passport.border,
      ...(customSize(p.custom) ? { custom: customSize(p.custom) } : {}),
    },
    defaults: {
      photos: {
        paper: oneOf(obj(obj(s.defaults).photos).paper, ['A4', 'PHOTO_4x6'] as const, d.defaults.photos.paper),
      },
    },
    photoPaperReminder: typeof s.photoPaperReminder === 'boolean' ? s.photoPaperReminder : d.photoPaperReminder,
    edges: oneOf(s.edges, ['normal', 'more'] as const, d.edges),
    margins: oneOf(s.margins, ['narrow', 'normal', 'small'] as const, d.margins),
    screenshotsUntil: Number.isFinite(until) && until > 0 ? Math.round(until) : 0,
    welcomed: s.welcomed === true,
    cardSize: oneOf(s.cardSize, ['real', 'big', 'sets', 'page'] as const, d.cardSize),
  };
}

/** The price to charge for [count] passport photos, if the owner set one (PLAN §K4). */
export function priceFor(s: Settings, count: number): number | undefined {
  return s.passport.prices[count];
}
