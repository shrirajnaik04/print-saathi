import { en } from '../../i18n/en';
import { DEFAULT_SETTINGS } from '../settings/settings';
import type { PrintPlan } from './plan';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "A4", or "A4 Landscape" when the shopkeeper chose sideways paper (owner, 2026-10-23). */
const paperWords = (plan: PrintPlan, name: string) =>
  plan.pages.length > 0 && plan.pages.every((p) => p.orientation === 'landscape')
    ? `${name} ${en.ready.landscape}`
    : name;

/** "1 photo · 1 PDF · 4 pages · A4 · Black & white · 1 copy": a document job in counter words (PLAN §J5). */
/** "Colour", or "Black & white · Sharp Black" when the job has a print style other than the plain one (PLAN §F4). */
function colourWords(plan: PrintPlan): string[] {
  const style = plan.pages[0]?.placements[0]?.style;
  const words = [plan.colour === 'bw' ? en.ready.bw : en.ready.colour];
  return style && style !== 'original' && style !== 'bw' ? [...words, en.style.names[style]] : words;
}

/**
 * [textItems]: PDFs made of a customer's text message (owner, round 8): "Text message", not "1 PDF". [scanned]: a scan
 * job's photographed pages: "Scanned pages".
 */
export function documentLine(
  plan: PrintPlan,
  pdfItems: ReadonlySet<number>,
  textItems: ReadonlySet<number> = new Set(),
  scanned = false,
  /** Round 9: PDFs the engine made of Office files, by item, with their kind: "Word file", "2 Excel files". */
  officeKinds: ReadonlyMap<number, string> = new Map(),
): string {
  const t = en.ready;
  const items = new Set(plan.pages.flatMap((p) => p.placements.map((x) => x.itemIndex)));
  const texts = [...items].filter((i) => textItems.has(i)).length;
  const kinds = [...items].flatMap((i) =>
    officeKinds.has(i) && !textItems.has(i) ? [officeKinds.get(i) as string] : [],
  );
  const office = [...new Set(kinds)].map((k) => {
    const name = en.docs.office[k as keyof typeof en.docs.office] ?? en.docs.office.office;
    const n = kinds.filter((x) => x === k).length;
    return n === 1 ? name : `${n} ${name}s`;
  });
  const pdfs = [...items].filter((i) => pdfItems.has(i) && !textItems.has(i) && !officeKinds.has(i)).length;
  const photos = items.size - pdfs - texts - kinds.length;
  return [
    ...office,
    ...(scanned ? [en.docs.scanned] : photos > 0 ? [count(photos, t.photo, t.photos)] : []),
    ...(texts > 0 ? [texts === 1 ? en.docs.text : en.docs.texts.replace('{n}', String(texts))] : []),
    ...(pdfs > 0 ? [pdfs === 1 ? en.docs.pdf : en.docs.pdfs.replace('{n}', String(pdfs))] : []),
    count(plan.pages.length, t.page, t.pages),
    paperWords(plan, t.a4),
    ...colourWords(plan),
    count(plan.copies, t.copy, t.copies),
  ].join(' · ');
}

/** "5 passport photos · 4×6 photo paper · Colour · 1 sheet · Charge ₹50" (PLAN §J4); [prices] from Settings (§K4). */
export function passportLine(
  plan: PrintPlan,
  prices: Readonly<Record<number, number>> = DEFAULT_SETTINGS.passport.prices,
): string {
  const p = en.passport;
  const n = plan.pages.reduce((s, pg) => s + pg.placements.length, 0);
  const price = prices[n];
  return [
    n === 1 ? p.onePhoto : p.photos.replace('{n}', String(n)),
    paperWords(plan, plan.paper.id === 'PHOTO_4x6' ? p.paper4x6 : p.a4),
    ...colourWords(plan),
    plan.pages.length === 1 ? p.sheet : p.sheets.replace('{n}', String(plan.pages.length)),
    ...(price ? [p.charge.replace('{price}', String(price))] : []),
  ].join(' · ');
}

/** "ID card · real size · A4 · Colour · 1 copy" (Phase 14 spec Part 2, Ready). */
export function idCardLine(plan: PrintPlan, size: 'real' | 'big' | 'sets' | 'page' | 'custom', scale?: number): string {
  const t = en.ready;
  return [
    en.cards.summary,
    size === 'custom' ? `${Math.round((scale ?? 1) * 100)} %` : en.cards.sizeNames[size],
    t.a4,
    ...colourWords(plan),
    count(plan.copies, t.copy, t.copies),
  ].join(' · ');
}

/**
 * [line] with "Glossy" right before its colour when glossy photo paper was chosen (owner, round 4: a reminder only, so
 * the plan does not carry it).
 */
export function withPaperType(line: string, glossy: boolean): string {
  if (!glossy) return line;
  const parts = line.split(' · ');
  const at = parts.findIndex((p) => p === en.ready.colour || p === en.ready.bw);
  if (at < 0) return line;
  return [...parts.slice(0, at), en.paperType.short, ...parts.slice(at)].join(' · ');
}

/** "3 photos · 3 pages · A4 · Colour · 1 copy": what will print, in the words the shopkeeper uses (PLAN §I-5). */
export function summaryLine(plan: PrintPlan): string {
  const t = en.ready;
  const photos = new Set(plan.pages.flatMap((p) => p.placements.map((x) => x.itemIndex))).size;
  return [
    count(photos, t.photo, t.photos),
    count(plan.pages.length, t.page, t.pages),
    paperWords(plan, plan.paper.id === 'PHOTO_4x6' ? en.passport.paper4x6 : t.a4),
    ...colourWords(plan),
    count(plan.copies, t.copy, t.copies),
  ].join(' · ');
}
