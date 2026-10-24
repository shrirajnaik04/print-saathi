import type { Intake, SniffedType } from '../../native/printEngine';
import { problemMessages } from '../intake/messages';
import { type CropBox, isFull, validBox } from '../layout/crop';
import type { Spot } from '../layout/free';
import { passportSize } from '../layout/passport';
import { partsOf } from '../layout/tilt';
import { CUSTOM_MAX_MM, CUSTOM_MIN_MM, MAX_PASSPORT_COUNT, PASSPORT_BORDERS } from '../settings/settings';

export type JobItem = { index: number; path: string; type: SniffedType; bytes: number; sha256: string };

/** What the customer asked for (PLAN §I-2). Phase 2 ships onePerPage; the others arrive with the layout engine. */
export type JobLayout = 'onePerPage' | 'allOnOne' | 'morePages' | 'passport' | 'document' | 'idCard';

/**
 * One customer job. The TS job store is the ONLY writer of these choices; every change raises `rev`, and the native
 * store refuses a write whose rev is not newer, so a stale async result can never overwrite newer choices (§D2c).
 */
export type Job = {
  id: string;
  rev: number;
  intakeIds: string[];
  items: JobItem[];
  /** Groups of item indexes with identical content (same photo sent twice). Default: keep both (§D2b). */
  duplicates: number[][];
  layout: JobLayout;
  paper: 'A4' | 'PHOTO_4x6';
  /**
   * Paper direction (owner, 2026-10-23): upright (portrait) unless the shopkeeper chooses sideways (landscape); the app
   * never turns the paper by itself. Missing = portrait. ID cards always print on upright A4.
   */
  direction?: 'portrait' | 'landscape';
  /**
   * Print quality for photo layouts (owner, 2026-10-23): none = Normal (sent as a document: the printer's normal-speed
   * mode); 'photo' = Best photo quality (sent as photos: the printer may use its slower photo mode).
   */
  quality?: 'photo';
  colour: 'colour' | 'bw';
  /** Print style for the whole job (PLAN §F4); used only when it fits [colour] (see styleOf). */
  style?: StyleId;
  /** Crops per photo (PLAN §F1, §F5), on the photo as stored upright, so they survive Turn; printed as shown. */
  crops?: Record<number, CropBox>;
  /**
   * Straightened frames per photo (owner, 2026-10-24: the scanner app's crop, each corner free): 8 fractions of the
   * upright photo, top-left, top-right, bottom-right, bottom-left. A photo has a crop or a frame, never both.
   */
  quads?: Record<number, number[]>;
  /**
   * Photos turned to any angle (owner, round 3: the rotate handle): the tilt beyond their quarter turns, degrees
   * clockwise, −45 < t ≤ 45, 0.1° steps; never 0 stored (src/core/layout/tilt.ts).
   */
  tilts?: Record<number, number>;
  /** Black edges the detector found, per photo; applied only when the shopkeeper says "Remove black edges". */
  suggested?: Record<number, CropBox>;
  /** The shopkeeper's answer to "Black edges?" (asked once per job). */
  edges?: 'removed' | 'kept';
  copies: number;
  /** "Use more pages": Best, or exactly this many pages (PLAN §J2). */
  pages: 'best' | number;
  /** Item indexes in print order (Photo tools: move earlier / later). Always exactly the items. */
  order: number[];
  /** Quarter turns clockwise per item index (Photo tools: Turn); missing = 0. */
  turns: Record<number, 0 | 1 | 2 | 3>;
  /** Plain-English notes from receiving (files that did not arrive), shown on the Received screen. */
  notices: string[];
  /** When the printer took this job (queued or done); a printed job is never offered as "Continue" (PLAN §D4). */
  printedAt?: number;
  /**
   * A big job prints in parts (PLAN §D4): how many parts of the plan with this hash the printer took, so coming back
   * later continues with the next part instead of printing part 1 again (Phase 5 gate M1).
   */
  partsDone?: { planHash: string; done: number };
  /** The part on Android's print screen right now; it counts once the printer took it. */
  partPrinting?: { planHash: string; part: number };
  /**
   * Passport photos (PLAN §J4): which photo, how many, which size, and the part of the photo inside the frame
   * (normalised, on the photo as shown; none = the largest centred frame).
   */
  passport?: PassportChoice;
  /**
   * Documents (PLAN §J5): the pages to print, in print order ({item, page}; a photo is page 0). None = every page
   * of every file, in received order. Turns per page, keyed "item:page".
   */
  docPages?: DocPage[];
  docTurns?: Record<string, 0 | 1 | 2 | 3>;
  /** A document was chosen once (its first-time black & white default is not applied again). */
  docChosen?: boolean;
  /**
   * Adjust (owner, 2026-10-23): each photo's size the shopkeeper chose, as its long side in mm (Turn and Crop keep it).
   * The photos then flow at these sizes (Square wrap); a photo without one takes the median. None = automatic sizes.
   */
  sizes?: Record<number, number>;
  /**
   * Photos placed by hand on Adjust (owner, 2026-10-24: press and hold, then drag): each one's centre on its page (mm)
   * and its layer. Placed photos stay where they are put; photos without a spot flow on pages after them.
   */
  spots?: Record<number, Spot>;
  /** A document page's size on its sheet (Adjust): "item:page" → 0.5–1 of the size that fits. */
  docScale?: Record<string, number>;
  /** Aadhaar & ID card copy (Phase 14): the cards, front first, and how big they print. */
  idCard?: IdCardChoice;
  /** Photos the app turned upright by itself (Phase 15), with the turn it gave each; Undo takes them back. */
  autoTurned?: Record<number, 1 | 2 | 3>;
  /** The app looked at this job's photos once already: it never turns them again (after Undo either). */
  autoTurnDone?: boolean;
  /**
   * Its files were chosen on Home (the gallery or file manager): shown exactly as the phone shows them, never turned by
   * the app (owner, 2026-10-23). Files added to it later by a share keep this.
   */
  picked?: true;
  createdAt: number;
  updatedAt: number;
};

export type DocPage = { item: number; page: number };

/** How an ID card prints (Phase 14 spec "How big?"); 'page' = the whole e-Aadhaar page (PDFs only). */
export type IdCardSize = 'real' | 'big' | 'sets' | 'page' | 'custom';

/**
 * One side of a card: where it is (a photo, or a page of a PDF) and its corners there (8 fractions of the upright
 * photo or page: top-left, top-right, bottom-right, bottom-left), plus a half turn when it lies upside down.
 */
export type IdCardSide = {
  item: number;
  page?: number;
  quad: number[];
  turns: 0 | 2;
  /** false: the app was not sure of its edges ("Check the corners") until the shopkeeper sets them. None = sure. */
  sure?: boolean;
};

/** [scale]: the cards' own size on Adjust (size 'custom'), 0.7–2 times the real card. */
export type IdCardChoice = { size: IdCardSize; sets: number; cards: IdCardSide[]; scale?: number };

/** Many copies: at most this many sets (front and back) on one sheet. */
export const MAX_CARD_SETS = 10;

/** A card's corners as the engine and the plan accept them: in the image, clockwise, convex, not empty. */
export function validQuad(q: unknown): q is number[] {
  if (!Array.isArray(q) || q.length !== 8 || !q.every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
  if (q.some((v) => v < -0.02 || v > 1.02)) return false;
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const [a, b, c] = [i, (i + 1) % 4, (i + 2) % 4];
    const cross =
      (q[2 * b] - q[2 * a]) * (q[2 * c + 1] - q[2 * b + 1]) - (q[2 * b + 1] - q[2 * a + 1]) * (q[2 * c] - q[2 * b]);
    if (cross <= 0) return false;
    area += q[2 * a] * q[2 * b + 1] - q[2 * b] * q[2 * a + 1];
  }
  return Math.abs(area) / 2 >= 1e-4;
}

export type PassportChoice = {
  item: number;
  count: number;
  preset: '35x45' | '20x25' | '2x2in' | 'custom';
  /** The job's own size (preset 'custom'), mm, each side 15–100. */
  sizeMm?: { w: number; h: number };
  /** A black border inside each photo, in points (owner, 2026-10-23); 0 or none = no border. */
  border?: number;
  /**
   * Remembered with the photo's turn and the frame's shape (width ÷ height) it was made for: on another turn or shape it
   * no longer fits (older jobs remember the preset instead).
   */
  crop?: { x: number; y: number; w: number; h: number; turns?: number; preset?: string; shape?: number };
};

const validSizeMm = (s: unknown): s is { w: number; h: number } => {
  const o = s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= CUSTOM_MIN_MM && v <= CUSTOM_MAX_MM;
  return ok(o.w) && ok(o.h);
};
const validBorder = (b: unknown): b is number => (PASSPORT_BORDERS as readonly number[]).includes(b as number);

/** Only valid crops of photos in the job. */
function keepCrops(job: Pick<Job, 'items'>, crops: Record<number, unknown>): Record<number, CropBox> {
  const out: Record<number, CropBox> = {};
  for (const [k, c] of Object.entries(crops ?? {}))
    if (job.items.some((i) => i.index === Number(k)) && validBox(c))
      out[Number(k)] = { x: c.x, y: c.y, w: c.w, h: c.h };
  return out;
}

const emptyToUndefined = <T extends object>(o: T): T | undefined => (Object.keys(o).length ? o : undefined);

/** A straightened frame the engine accepts, on the photo (every corner inside it). */
const validFrame = (q: unknown): q is number[] => validQuad(q) && q.every((v) => v >= 0 && v <= 1);

/** Only valid frames of photos in the job. */
/** Tilts of photos in the job only, each in (−45, 45] and not 0 (a saved job, round 3). */
function keepTilts(job: Pick<Job, 'items'>, tilts: Record<number, unknown>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, t] of Object.entries(tilts ?? {}))
    if (
      job.items.some((i) => i.index === Number(k)) &&
      typeof t === 'number' &&
      Number.isFinite(t) &&
      t > -45 &&
      t <= 45 &&
      t !== 0
    )
      out[Number(k)] = t;
  return out;
}

function keepQuads(job: Pick<Job, 'items'>, quads: Record<number, unknown>): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const [k, q] of Object.entries(quads ?? {}))
    if (job.items.some((i) => i.index === Number(k)) && validFrame(q)) out[Number(k)] = [...q];
  return out;
}

const MAX_PAGE = 999;
const validSpot = (s: unknown): s is Spot => {
  const o = s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
  const real = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1000;
  return (
    Number.isInteger(o.page) &&
    (o.page as number) >= 0 &&
    (o.page as number) <= MAX_PAGE &&
    real(o.x) &&
    real(o.y) &&
    real(o.z)
  );
};

/** Spots of photos in the job only, each a real place; none left = none. */
function validSpots(o: unknown, indexes: readonly number[]): Record<number, Spot> | undefined {
  const out: Record<number, Spot> = {};
  for (const [k, v] of Object.entries(o && typeof o === 'object' ? o : {}))
    if (indexes.includes(Number(k)) && validSpot(v)) out[Number(k)] = { page: v.page, x: v.x, y: v.y, z: v.z };
  return emptyToUndefined(out);
}

/** Adjust sizes (long side, mm) of photos in the job only, each a real size; none left = none. */
function validSizes(o: unknown, indexes: readonly number[]): Record<number, number> | undefined {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(o && typeof o === 'object' ? o : {}))
    if (indexes.includes(Number(k)) && typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 1000)
      out[Number(k)] = v;
  return emptyToUndefined(out);
}

/** Print styles (PLAN §F4): three in colour, three in black & white. */
export type StyleId = 'original' | 'vibrant' | 'soft' | 'bw' | 'sharp' | 'ocv';
export const COLOUR_STYLES: readonly StyleId[] = ['original', 'vibrant', 'soft'];
export const BW_STYLES: readonly StyleId[] = ['bw', 'sharp', 'ocv'];

/**
 * The style the print uses: the job's own when it fits its colour, else the plain one (Original in colour, Black &
 * White in grey). Passport photos are never styled (PLAN §U: nothing changed except crop and scale).
 */
export function styleOf(job: Pick<Job, 'colour' | 'style' | 'layout'>): StyleId {
  const group = job.colour === 'bw' ? BW_STYLES : COLOUR_STYLES;
  if (job.layout === 'passport') return group[0] as StyleId;
  return job.style && group.includes(job.style) ? job.style : (group[0] as StyleId);
}

export type JobAction =
  | { type: 'setLayout'; layout: JobLayout }
  | { type: 'setColour'; colour: 'colour' | 'bw' }
  | { type: 'setDirection'; direction: 'portrait' | 'landscape' }
  | { type: 'setQuality'; quality: 'normal' | 'photo' }
  /** Adjust: the photos' sizes (long side, mm); null = automatic sizes again. */
  | { type: 'setSizes'; sizes: Record<number, number> | null }
  /** Adjust: a document page's size on its sheet (0.5–1, in 5 % steps; 1 = as it fits). */
  | { type: 'setDocScale'; item: number; page: number; scale: number }
  /** Adjust: the ID cards' size, 0.7–2 times the real card in 10 % steps (1 = real size). */
  | { type: 'setIdCardScale'; scale: number }
  /** A4 or the shop printer's 4×6 photo paper for photo layouts (PLAN §K3; passport has its own paper rule). */
  | { type: 'setPaper'; paper: 'A4' | 'PHOTO_4x6' }
  | { type: 'setStyle'; style: StyleId }
  | { type: 'setSuggestions'; crops: Record<number, CropBox> }
  | { type: 'answerEdges'; remove: boolean }
  | { type: 'setCrop'; item: number; crop: CropBox | null }
  /** The scanner-style crop (owner, 2026-10-24): a straightened frame on the upright photo; null = none. */
  | { type: 'setQuad'; item: number; quad: number[] | null }
  /** A photo turned to [angle] (degrees clockwise, any value): its quarter turns and its tilt (round 3). */
  | { type: 'rotateItem'; index: number; angle: number }
  | { type: 'setCopies'; copies: number }
  | { type: 'removeItem'; index: number }
  /** Undo of a removal: the item back at position [at] of the print order. */
  | { type: 'restoreItem'; item: JobItem; at: number; pages?: 'best' | number; size?: number; spot?: Spot }
  /** The first photo moved by hand: every photo is fixed where it is now, at its size (owner, 2026-10-24). */
  | { type: 'setSpots'; spots: Record<number, Spot>; sizes: Record<number, number> }
  /** A photo placed by hand: its page and centre (mm), on top of the others; [size] = its long side (mm). */
  | { type: 'placeItem'; item: number; page: number; x: number; y: number; size?: number }
  /** Several changes made as one (one new revision): a resize and its new place, a crop and its new size. */
  | { type: 'all'; actions: JobAction[] }
  | { type: 'setPages'; pages: 'best' | number }
  /** [among]: the items the screen shows (photos); the move passes over everything else. */
  | { type: 'moveItem'; index: number; by: -1 | 1; among?: number[] }
  /** Turn: a quarter clockwise, or [by] 3 = a quarter anticlockwise (Turn left, the scanner-style crop). */
  | { type: 'turnItem'; index: number; by?: 1 | 3 }
  | { type: 'markPrinted' }
  /** PRINT PART k: the part (from 0) of the full plan [planHash] went to Android's print screen. */
  | { type: 'partStarted'; planHash: string; part: number }
  /** The printer took the part that was started. */
  | { type: 'partPrinted' }
  /** Passport photos of [item]: layout passport; count and size kept unless given (default 5, 35 × 45 mm). */
  | {
      type: 'setPassport';
      item: number;
      count?: number;
      preset?: PassportChoice['preset'];
      /** The owner's starting size, count and border (Settings), used only when the job has no passport choice yet. */
      defaults?: {
        count: number;
        preset: PassportChoice['preset'];
        border?: number;
        custom?: { wMm: number; hMm: number };
      };
    }
  | { type: 'setPassportCount'; count: number }
  /** Passport photo border (points, one of PASSPORT_BORDERS; 0 = none). */
  | { type: 'setPassportBorder'; border: number }
  /** Passport photo size: a preset, or 'custom' with its size in mm (each side 15–100). */
  | { type: 'setPassportSize'; preset: PassportChoice['preset']; sizeMm?: { w: number; h: number } }
  | { type: 'setPassportCrop'; crop: { x: number; y: number; w: number; h: number } | null }
  /**
   * New files arrived → Add to this job (PLAN §I-17): [items] (already placed in this job's folder) come after the
   * job's own, printed last. Choices that only covered the old files start again.
   */
  | { type: 'addItems'; items: JobItem[]; intakeId: string; notices: string[] }
  /** Print as a document: every page of every file ([colour] the first time: the owner's, else black & white, §V3). */
  | { type: 'setDocument'; colour?: 'colour' | 'bw' }
  /** Pages to print, in this order. */
  | { type: 'setDocPages'; pages: DocPage[] }
  /** Move the page at position [at] of the printed pages ([shown]: the pages on screen) earlier or later. */
  | { type: 'moveDocPage'; at: number; by: -1 | 1; shown: DocPage[] }
  | { type: 'turnDocPage'; item: number; page: number }
  /** ID card copy (Phase 14): these cards, front first; the size is kept unless given (default real size). */
  | { type: 'setIdCards'; cards: IdCardSide[]; size?: IdCardSize }
  | { type: 'setIdCardSize'; size: IdCardSize; sets?: number }
  | { type: 'swapIdCards' }
  | { type: 'setIdCardQuad'; at: number; quad: number[] }
  | { type: 'turnIdCard'; at: number }
  /**
   * Phase 15: the turns that make these photos upright, found by the app. Only photos nobody turned by hand get one;
   * the job is marked looked-at either way.
   */
  | { type: 'autoTurn'; turns: Record<number, 1 | 2 | 3> }
  | { type: 'undoAutoTurn' };

const DEFAULT_PASSPORT_COUNT = 5;
const clampCount = (n: number) => Math.min(MAX_PASSPORT_COUNT, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));
const validCrop = (c: { x: number; y: number; w: number; h: number }) =>
  [c.x, c.y, c.w, c.h].every(Number.isFinite) &&
  c.x >= 0 &&
  c.y >= 0 &&
  c.w > 0 &&
  c.h > 0 &&
  c.x + c.w <= 1 + 1e-9 &&
  c.y + c.h <= 1 + 1e-9;

const clampSets = (n: unknown) =>
  Math.min(MAX_CARD_SETS, Math.max(1, Math.round(typeof n === 'number' && Number.isFinite(n) ? n : 1)));

const MIN_COPIES = 1;
const MAX_COPIES = 99;

function duplicateGroups(items: JobItem[]): number[][] {
  const byHash = new Map<string, number[]>();
  for (const it of items) byHash.set(it.sha256, [...(byHash.get(it.sha256) ?? []), it.index]);
  return [...byHash.values()].filter((g) => g.length > 1);
}

/** [colour]: how new photo jobs start (Settings → Paper and colour, PLAN §V3). */
export function jobFromIntake(
  id: string,
  intake: Intake,
  nowMs: number,
  colour: 'colour' | 'bw' = 'colour',
  /** How new photo jobs start: A4 or the shop printer's 4×6 photo paper (Settings, PLAN §K3). */
  paper: 'A4' | 'PHOTO_4x6' = 'A4',
): Job {
  const items = intake.files.map((f) => ({
    index: f.index,
    path: f.path,
    type: f.sniffedType,
    bytes: f.bytes,
    sha256: f.sha256,
  }));
  return {
    id,
    rev: 1,
    intakeIds: [intake.intakeId],
    items,
    duplicates: duplicateGroups(items),
    layout: 'onePerPage',
    paper,
    colour,
    copies: 1,
    pages: 'best',
    order: items.map((i) => i.index),
    turns: {},
    notices: problemMessages(intake),
    ...(intake.pick ? { picked: true as const } : {}),
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}

function clampPages(pages: 'best' | number, items: number): 'best' | number {
  return pages === 'best' ? 'best' : Math.max(1, Math.min(Math.max(1, items), Math.round(pages)));
}

/**
 * A stored job as this version reads it: jobs saved before Phase 3 get Best, received order and no turns; anything
 * that is not a job gives null.
 */
export function normalizeJob(o: unknown): Job | null {
  if (!o || typeof o !== 'object') return null;
  const j = o as Partial<Job>;
  if (typeof j.id !== 'string' || !Array.isArray(j.items)) return null;
  // Corrupt entries are dropped and odd values read as defaults, so a damaged file never breaks a screen.
  const items = j.items.filter(
    (i): i is JobItem => !!i && typeof i === 'object' && Number.isInteger((i as JobItem).index),
  );
  const indexes = items.map((i) => i.index);
  const stored = Array.isArray(j.order) ? j.order.map(Number) : [];
  const order =
    stored.every(Number.isInteger) && [...stored].sort().join() === [...indexes].sort().join() ? stored : indexes;
  const pages =
    typeof j.pages === 'number' && Number.isFinite(j.pages) && j.pages >= 1
      ? clampPages(j.pages, items.length)
      : 'best';
  const copies =
    typeof j.copies === 'number' && Number.isFinite(j.copies)
      ? Math.min(MAX_COPIES, Math.max(MIN_COPIES, Math.round(j.copies)))
      : MIN_COPIES;
  const turns: Job['turns'] = {};
  for (const [k, v] of Object.entries(j.turns ?? {}))
    if (v === 0 || v === 1 || v === 2 || v === 3) turns[Number(k)] = v;
  const partsDone =
    j.partsDone &&
    typeof j.partsDone.planHash === 'string' &&
    Number.isInteger(j.partsDone.done) &&
    j.partsDone.done >= 0
      ? j.partsDone
      : undefined;
  const partPrinting =
    j.partPrinting && typeof j.partPrinting.planHash === 'string' && Number.isInteger(j.partPrinting.part)
      ? j.partPrinting
      : undefined;
  const docPages = Array.isArray(j.docPages)
    ? j.docPages.filter(
        (p): p is DocPage =>
          !!p && typeof p === 'object' && indexes.includes(p.item) && Number.isInteger(p.page) && p.page >= 0,
      )
    : undefined;
  const docTurns: Record<string, 0 | 1 | 2 | 3> = {};
  for (const [k, v] of Object.entries(j.docTurns ?? {}))
    if (/^\d+:\d+$/.test(k) && (v === 0 || v === 1 || v === 2 || v === 3)) docTurns[k] = v;
  const pp = j.passport;
  const passport =
    pp &&
    Number.isInteger(pp.item) &&
    indexes.includes(pp.item) &&
    (['35x45', '20x25', '2x2in'].includes(pp.preset) || (pp.preset === 'custom' && validSizeMm(pp.sizeMm)))
      ? {
          item: pp.item,
          count: clampCount(pp.count),
          preset: pp.preset,
          ...(pp.preset === 'custom' && pp.sizeMm ? { sizeMm: { w: pp.sizeMm.w, h: pp.sizeMm.h } } : {}),
          ...(validBorder(pp.border) ? { border: pp.border } : {}),
          ...(pp.crop && validCrop(pp.crop) ? { crop: pp.crop } : {}),
        }
      : undefined;
  const ic = j.idCard;
  const cards = Array.isArray(ic?.cards)
    ? ic.cards
        .filter(
          (c): c is IdCardSide =>
            !!c &&
            typeof c === 'object' &&
            indexes.includes(c.item) &&
            validQuad(c.quad) &&
            (c.page === undefined || (Number.isInteger(c.page) && c.page >= 0)),
        )
        .slice(0, 2)
        .map((c) => ({ ...c, turns: c.turns === 2 ? (2 as const) : (0 as const), sure: c.sure !== false }))
    : [];
  const cardScale =
    typeof ic?.scale === 'number' && Number.isFinite(ic.scale) && ic.scale >= 0.7 && ic.scale <= 2
      ? ic.scale
      : undefined;
  const idCard =
    ic && ['real', 'big', 'sets', 'page', 'custom'].includes(ic.size) && cards.length > 0
      ? ic.size === 'custom' && cardScale === undefined
        ? { size: 'real' as const, sets: clampSets(ic.sets), cards }
        : { size: ic.size, sets: clampSets(ic.sets), cards, ...(ic.size === 'custom' ? { scale: cardScale } : {}) }
      : undefined;
  const docScale: Record<string, number> = {};
  for (const [k, v] of Object.entries(j.docScale ?? {}))
    if (/^\d+:\d+$/.test(k) && typeof v === 'number' && v >= 0.5 && v < 1) docScale[k] = v;
  return {
    ...(j as Job),
    items,
    pages,
    order,
    turns,
    copies,
    idCard,
    layout: j.layout === 'idCard' && !idCard ? 'onePerPage' : (j.layout as JobLayout),
    autoTurned: emptyToUndefined(
      Object.fromEntries(
        Object.entries(j.autoTurned ?? {}).filter(
          ([k, v]) => indexes.includes(Number(k)) && (v === 1 || v === 2 || v === 3) && turns[Number(k)] === v,
        ),
      ) as Record<number, 1 | 2 | 3>,
    ),
    autoTurnDone: j.autoTurnDone === true,
    direction: j.direction === 'portrait' || j.direction === 'landscape' ? j.direction : undefined,
    quality: j.quality === 'photo' ? 'photo' : undefined,
    picked: j.picked === true ? true : undefined,
    sizes: validSizes(j.sizes, indexes),
    spots: validSpots(j.spots, indexes),
    docScale: emptyToUndefined(docScale),
    duplicates: duplicateGroups(items),
    partsDone,
    partPrinting,
    passport,
    docPages,
    docTurns,
    style: [...COLOUR_STYLES, ...BW_STYLES].includes(j.style as StyleId) ? (j.style as StyleId) : undefined,
    crops: emptyToUndefined(keepCrops({ items } as Job, j.crops ?? {})),
    quads: emptyToUndefined(keepQuads({ items } as Job, j.quads ?? {})),
    tilts: emptyToUndefined(keepTilts({ items } as Job, (j as { tilts?: Record<number, unknown> }).tilts ?? {})),
    suggested: emptyToUndefined(keepCrops({ items } as Job, j.suggested ?? {})),
    edges: j.edges === 'removed' || j.edges === 'kept' ? j.edges : undefined,
  };
}

/** Pure reducer: returns the same object when nothing changes (no rev bump), else a copy with rev + 1. */
export function jobReducer(job: Job, action: JobAction, nowMs: number): Job {
  // Several changes as one: each applied in turn, one new revision for all.
  if (action.type === 'all') {
    let j = job;
    for (const a of action.actions) j = jobReducer(j, a, nowMs);
    return j === job ? job : { ...j, rev: job.rev + 1, updatedAt: nowMs };
  }
  let next: Partial<Job> | null = null;
  switch (action.type) {
    case 'setLayout':
      // Another layout starts again from automatic sizes and places (Adjust).
      if (action.layout !== job.layout) next = { layout: action.layout, sizes: undefined, spots: undefined };
      break;
    case 'setSizes': {
      // Automatic: tidy rows again at automatic sizes, nothing placed by hand.
      if (action.sizes === null) {
        if (job.sizes || job.spots) next = { sizes: undefined, spots: undefined };
        break;
      }
      const sizes = validSizes(
        action.sizes,
        job.items.map((i) => i.index),
      );
      if (sizes && JSON.stringify(sizes) !== JSON.stringify(job.sizes ?? {})) next = { sizes };
      break;
    }
    case 'setDocScale': {
      if (!job.items.some((i) => i.index === action.item) || !Number.isFinite(action.scale)) break;
      const key = `${action.item}:${action.page}`;
      const scale = Math.min(1, Math.max(0.5, Math.round(action.scale * 20) / 20));
      const { [key]: _was, ...rest } = job.docScale ?? {};
      const docScale = scale === 1 ? rest : { ...rest, [key]: scale };
      if (JSON.stringify(docScale) !== JSON.stringify(job.docScale ?? {}))
        next = { docScale: emptyToUndefined(docScale) };
      break;
    }
    case 'setIdCardScale': {
      if (!job.idCard || !Number.isFinite(action.scale)) break;
      const scale = Math.min(2, Math.max(0.7, Math.round(action.scale * 10) / 10));
      const { scale: _was, ...rest } = job.idCard;
      next = { idCard: scale === 1 ? { ...rest, size: 'real' } : { ...rest, size: 'custom', scale } };
      break;
    }
    case 'setColour':
      // The plain style of the chosen colour (review focus 3: never "Vibrant in grey").
      if (action.colour !== job.colour)
        next = { colour: action.colour, style: action.colour === 'bw' ? 'bw' : 'original' };
      break;
    case 'setSuggestions': {
      if (job.edges !== undefined) break; // answered: a late save never brings back the question's suggestions
      const crops = keepCrops(job, action.crops);
      if (JSON.stringify(crops) !== JSON.stringify(job.suggested ?? {})) next = { suggested: crops };
      break;
    }
    case 'answerEdges':
      // Remove: the suggestions become crops, but a crop the shopkeeper made by hand stays.
      // A straightened photo keeps its frame: never a crop beside it.
      next = action.remove
        ? {
            edges: 'removed',
            crops: Object.fromEntries(
              Object.entries({ ...(job.suggested ?? {}), ...(job.crops ?? {}) }).filter(
                ([k]) => !job.quads?.[Number(k)],
              ),
            ),
          }
        : { edges: 'kept' };
      break;
    case 'setCrop': {
      if (!job.items.some((i) => i.index === action.item)) break;
      const rest = { ...(job.crops ?? {}) };
      delete rest[action.item];
      if (action.crop === null || isFull(action.crop)) {
        if (job.crops?.[action.item]) next = { crops: rest };
      } else if (validBox(action.crop)) {
        const quads = { ...(job.quads ?? {}) };
        delete quads[action.item];
        next = { crops: { ...rest, [action.item]: action.crop }, quads: emptyToUndefined(quads) };
      }
      break;
    }
    case 'setQuad': {
      if (!job.items.some((i) => i.index === action.item)) break;
      const quads = { ...(job.quads ?? {}) };
      delete quads[action.item];
      if (action.quad === null) {
        if (job.quads?.[action.item]) next = { quads: emptyToUndefined(quads) };
      } else if (validFrame(action.quad)) {
        const crops = { ...(job.crops ?? {}) };
        delete crops[action.item];
        next = { quads: { ...quads, [action.item]: [...action.quad] }, crops: emptyToUndefined(crops) };
      }
      break;
    }
    case 'setStyle': {
      if (job.layout === 'passport' || ![...COLOUR_STYLES, ...BW_STYLES].includes(action.style)) break;
      const colour = BW_STYLES.includes(action.style) ? 'bw' : 'colour';
      if (action.style !== styleOf(job) || colour !== job.colour) next = { style: action.style, colour };
      break;
    }
    case 'setCopies': {
      const copies = Math.min(MAX_COPIES, Math.max(MIN_COPIES, Math.round(action.copies)));
      if (copies !== job.copies) next = { copies };
      break;
    }
    case 'markPrinted':
      // The whole job printed: its part progress is done with, so printing it again starts at part 1.
      if (job.printedAt === undefined || job.partsDone || job.partPrinting)
        next = { printedAt: job.printedAt ?? nowMs, partsDone: undefined, partPrinting: undefined };
      break;
    case 'setDocument':
      if (job.layout !== 'document')
        next = {
          layout: 'document',
          ...(job.docPages === undefined && !job.docChosen
            ? { colour: action.colour ?? 'colour', docChosen: true }
            : {}),
        };
      break;
    case 'setDocPages': {
      const pages = action.pages.filter(
        (p) => Number.isInteger(p.page) && p.page >= 0 && job.items.some((i) => i.index === p.item),
      );
      next = { docPages: pages };
      break;
    }
    case 'moveDocPage': {
      const pages = job.docPages ?? action.shown;
      const to = action.at + action.by;
      if (!pages || action.at < 0 || action.at >= pages.length || to < 0 || to >= pages.length) break;
      const copy = [...pages];
      [copy[action.at], copy[to]] = [copy[to] as DocPage, copy[action.at] as DocPage];
      next = { docPages: copy };
      break;
    }
    case 'setIdCards': {
      const cards = action.cards
        .filter((c) => job.items.some((i) => i.index === c.item) && validQuad(c.quad))
        .slice(0, 2)
        .map((c) => ({ ...c, turns: c.turns === 2 ? (2 as const) : (0 as const), sure: c.sure !== false }));
      if (cards.length === 0) break;
      next = {
        layout: 'idCard',
        idCard: {
          size: action.size ?? job.idCard?.size ?? 'real',
          sets: job.idCard?.sets ?? 1,
          cards,
          // The cards' own size stays (Print front only and its Undo, review 2026-10-24).
          ...(job.idCard?.scale !== undefined ? { scale: job.idCard.scale } : {}),
        },
      };
      break;
    }
    case 'setIdCardSize':
      if (!job.idCard) break;
      next = {
        idCard: {
          ...job.idCard,
          size: action.size,
          sets: action.sets === undefined ? job.idCard.sets : clampSets(action.sets),
        },
      };
      break;
    case 'swapIdCards':
      if (!job.idCard || job.idCard.cards.length < 2) break;
      next = { idCard: { ...job.idCard, cards: [...job.idCard.cards].reverse() } };
      break;
    case 'setIdCardQuad': {
      const c = job.idCard?.cards[action.at];
      if (!job.idCard || !c || !validQuad(action.quad)) break;
      next = {
        idCard: {
          ...job.idCard,
          // Corners the shopkeeper set by hand are sure.
          cards: job.idCard.cards.map((x, i) => (i === action.at ? { ...x, quad: action.quad, sure: true } : x)),
        },
      };
      break;
    }
    case 'turnIdCard': {
      const c = job.idCard?.cards[action.at];
      if (!job.idCard || !c) break;
      next = {
        idCard: {
          ...job.idCard,
          cards: job.idCard.cards.map((x, i) => (i === action.at ? { ...x, turns: x.turns === 2 ? 0 : 2 } : x)),
        },
      };
      break;
    }
    case 'turnDocPage': {
      // A photo among the pages keeps its turns where every photo does (the plan reads them there).
      if (job.items.find((i) => i.index === action.item)?.type !== 'pdf') {
        if (!job.items.some((i) => i.index === action.item)) break;
        next = { turns: { ...job.turns, [action.item]: (((job.turns[action.item] ?? 0) + 1) % 4) as 0 | 1 | 2 | 3 } };
        break;
      }
      const key = `${action.item}:${action.page}`;
      const t = (((job.docTurns?.[key] ?? 0) + 1) % 4) as 0 | 1 | 2 | 3;
      next = { docTurns: { ...job.docTurns, [key]: t } };
      break;
    }
    case 'setPassport': {
      if (!job.items.some((i) => i.index === action.item)) break;
      const same = job.passport?.item === action.item;
      let preset = action.preset ?? job.passport?.preset ?? action.defaults?.preset ?? '35x45';
      const custom = action.defaults?.custom;
      const sizeMm =
        job.passport?.sizeMm ??
        (custom && validSizeMm({ w: custom.wMm, h: custom.hMm }) ? { w: custom.wMm, h: custom.hMm } : undefined);
      if (preset === 'custom' && !sizeMm) preset = '35x45';
      const border = job.passport?.border ?? action.defaults?.border ?? 1.5;
      next = {
        layout: 'passport',
        // Passport photos start in colour, whatever photo jobs start in (review I3); the shopkeeper's later choice stays.
        ...(job.passport ? {} : { colour: 'colour' as const }),
        passport: {
          item: action.item,
          count: clampCount(action.count ?? job.passport?.count ?? action.defaults?.count ?? DEFAULT_PASSPORT_COUNT),
          preset,
          ...(preset === 'custom' && sizeMm ? { sizeMm } : {}),
          border: validBorder(border) ? border : 1.5,
          // Another photo starts with its own centred frame.
          ...(same && job.passport?.crop ? { crop: job.passport.crop } : {}),
        },
      };
      break;
    }
    case 'setPassportCount': {
      if (!job.passport) break;
      const count = clampCount(action.count);
      if (count !== job.passport.count) next = { passport: { ...job.passport, count } };
      break;
    }
    case 'setPassportCrop': {
      if (!job.passport) break;
      const { crop: _old, ...rest } = job.passport;
      const turns = job.turns?.[rest.item] ?? 0;
      const size = passportSize(rest);
      next = {
        passport:
          action.crop && validCrop(action.crop)
            ? { ...rest, crop: { ...action.crop, turns, preset: rest.preset, shape: size.wMm / size.hMm } }
            : rest,
      };
      break;
    }
    case 'setQuality': {
      if (action.quality !== 'normal' && action.quality !== 'photo') break;
      const quality = action.quality === 'photo' ? 'photo' : undefined;
      if (quality !== job.quality) next = { quality };
      break;
    }
    case 'setDirection': {
      if (action.direction !== 'portrait' && action.direction !== 'landscape') break;
      // Kept as chosen: an explicit Portrait differs from none (the customer's own PDF goes untouched only with none).
      // Places by hand were on the other page shape: the photos go back to rows.
      if (job.direction !== action.direction) next = { direction: action.direction, spots: undefined };
      break;
    }
    case 'setPassportBorder': {
      if (!job.passport || !validBorder(action.border) || job.passport.border === action.border) break;
      next = { passport: { ...job.passport, border: action.border } };
      break;
    }
    case 'setPassportSize': {
      if (!job.passport) break;
      const { sizeMm: _was, ...rest } = job.passport;
      if (action.preset === 'custom') {
        if (!validSizeMm(action.sizeMm)) break;
        const round = (v: number) => Math.round(v * 10) / 10;
        next = {
          passport: { ...rest, preset: 'custom', sizeMm: { w: round(action.sizeMm.w), h: round(action.sizeMm.h) } },
        };
      } else if (['35x45', '20x25', '2x2in'].includes(action.preset))
        next = { passport: { ...rest, preset: action.preset } };
      break;
    }
    case 'partStarted':
      next = { partPrinting: { planHash: action.planHash, part: action.part } };
      break;
    case 'partPrinted': {
      const p = job.partPrinting;
      if (!p) break;
      const before = job.partsDone?.planHash === p.planHash ? job.partsDone.done : 0;
      next = { partsDone: { planHash: p.planHash, done: Math.max(before, p.part + 1) }, partPrinting: undefined };
      break;
    }
    case 'removeItem': {
      const items = job.items.filter((i) => i.index !== action.index);
      if (items.length !== job.items.length)
        next = {
          items,
          duplicates: duplicateGroups(items),
          order: job.order.filter((i) => i !== action.index),
          pages: clampPages(job.pages, items.length),
          sizes: validSizes(
            job.sizes ?? {},
            items.map((i) => i.index),
          ),
          // The passport photo gone: no passport job without its photo (gate m2).
          // Only a passport job changes layout; another layout keeps what the shopkeeper chose (re-review N1).
          ...(job.passport?.item === action.index
            ? { passport: undefined, ...(job.layout === 'passport' ? { layout: 'onePerPage' as const } : {}) }
            : {}),
        };
      break;
    }
    case 'restoreItem': {
      if (job.items.some((i) => i.index === action.item.index)) break;
      const items = [...job.items, action.item].sort((a, b) => a.index - b.index);
      const order = [...job.order];
      order.splice(Math.max(0, Math.min(action.at, order.length)), 0, action.item.index);
      next = {
        items,
        order,
        duplicates: duplicateGroups(items),
        ...(action.pages !== undefined ? { pages: clampPages(action.pages, items.length) } : {}),
        // Its size from Adjust comes back with it (review, 2026-10-24); automatic sizes stay automatic.
        ...(job.sizes && action.size !== undefined
          ? {
              sizes: validSizes(
                { ...job.sizes, [action.item.index]: action.size },
                items.map((i) => i.index),
              ),
            }
          : {}),
        // Its place by hand too, while the others are still placed by hand.
        ...(job.spots && action.spot && validSpot(action.spot)
          ? { spots: { ...job.spots, [action.item.index]: { ...action.spot } } }
          : {}),
      };
      break;
    }
    case 'setSpots': {
      const indexes = job.items.map((i) => i.index);
      const spots = validSpots(action.spots, indexes);
      if (!spots) break;
      next = { spots, sizes: validSizes({ ...(job.sizes ?? {}), ...action.sizes }, indexes) };
      break;
    }
    case 'placeItem': {
      const spot = { page: action.page, x: action.x, y: action.y, z: 0 };
      if (!job.items.some((i) => i.index === action.item) || !validSpot(spot)) break;
      // On top of every other photo.
      spot.z = Math.max(0, ...Object.values(job.spots ?? {}).map((s) => s.z)) + 1;
      const sizes =
        action.size !== undefined
          ? validSizes(
              { ...(job.sizes ?? {}), [action.item]: action.size },
              job.items.map((i) => i.index),
            )
          : job.sizes;
      next = { spots: { ...(job.spots ?? {}), [action.item]: spot }, sizes };
      break;
    }
    case 'addItems': {
      if (action.items.length === 0) break;
      // Never a number the job still mentions (a removed photo's turn and crop are kept for its Undo).
      const used = [
        ...job.items.map((i) => i.index),
        ...job.order,
        ...[job.turns, job.crops ?? {}, job.suggested ?? {}, job.quads ?? {}, job.spots ?? {}, job.tilts ?? {}].flatMap(
          (r) => Object.keys(r).map(Number),
        ),
        ...(job.passport ? [job.passport.item] : []),
        ...Object.keys(job.docTurns ?? {}).map((k) => Number(k.split(':')[0])),
      ].filter(Number.isFinite);
      const first = Math.max(0, ...used) + 1;
      // The numbers the files were given (their file names) when all are free; else new ones after every number.
      const taken = new Set(used);
      const free = action.items.every(
        (it, k, all) =>
          Number.isInteger(it.index) &&
          it.index > 0 &&
          !taken.has(it.index) &&
          all.findIndex((o) => o.index === it.index) === k,
      );
      const added = free
        ? action.items.map((it) => ({ ...it }))
        : action.items.map((it, k) => ({ ...it, index: first + k }));
      const items = [...job.items, ...added];
      next = {
        items,
        order: [...job.order, ...added.map((i) => i.index)],
        duplicates: duplicateGroups(items),
        intakeIds: [...new Set([...job.intakeIds, action.intakeId])],
        notices: [...job.notices, ...action.notices],
        pages: clampPages(job.pages, items.length),
        docPages: undefined,
        edges: undefined,
        suggested: undefined,
        printedAt: undefined,
        partsDone: undefined,
        partPrinting: undefined,
      };
      break;
    }
    case 'setPaper':
      if (action.paper !== job.paper && (action.paper === 'A4' || action.paper === 'PHOTO_4x6'))
        next = { paper: action.paper, sizes: undefined, spots: undefined };
      break;
    case 'setPages': {
      const pages = clampPages(action.pages, job.items.length);
      if (pages !== job.pages) next = { pages, sizes: undefined, spots: undefined };
      break;
    }
    case 'moveItem': {
      // Swap with the nearest neighbour the screen shows (gate review #5: never with a hidden file).
      const shown = action.among ? job.order.filter((i) => action.among?.includes(i)) : job.order;
      const at = shown.indexOf(action.index);
      const other = shown[at + action.by];
      if (at < 0 || other === undefined) break;
      const order = [...job.order];
      const a = order.indexOf(action.index);
      const b = order.indexOf(other);
      order[a] = other;
      order[b] = action.index;
      next = { order };
      break;
    }
    case 'rotateItem': {
      if (!job.items.some((i) => i.index === action.index) || !Number.isFinite(action.angle)) break;
      const { turns, tilt } = partsOf(action.angle);
      const { [action.index]: _was, ...others } = job.tilts ?? {};
      const { [action.index]: _auto, ...auto } = job.autoTurned ?? {};
      next = {
        turns: { ...job.turns, [action.index]: turns },
        tilts: emptyToUndefined(tilt === 0 ? others : { ...others, [action.index]: tilt }),
        autoTurned: emptyToUndefined(auto),
      };
      break;
    }
    case 'turnItem': {
      if (!job.items.some((i) => i.index === action.index)) break;
      const turn = (((job.turns[action.index] ?? 0) + (action.by === 3 ? 3 : 1)) % 4) as 0 | 1 | 2 | 3;
      // A turn by hand wins: the photo is no longer one the app turned (Undo leaves it alone).
      const { [action.index]: _was, ...auto } = job.autoTurned ?? {};
      next = { turns: { ...job.turns, [action.index]: turn }, autoTurned: emptyToUndefined(auto) };
      break;
    }
    case 'autoTurn': {
      if (job.autoTurnDone) break;
      // Never an ID card job (its cards have their own way up), nor a passport photo already framed.
      const framed = job.layout === 'passport' && !!job.passport?.crop;
      const turns = { ...job.turns };
      const auto: Record<number, 1 | 2 | 3> = {};
      if (job.layout !== 'idCard' && !framed)
        for (const [k, t] of Object.entries(action.turns)) {
          const index = Number(k);
          const photo = job.items.find((i) => i.index === index && i.type !== 'pdf');
          if (!photo || (job.turns[index] ?? 0) !== 0 || ![1, 2, 3].includes(t)) continue;
          turns[index] = t;
          auto[index] = t;
        }
      next = { autoTurnDone: true, turns, autoTurned: emptyToUndefined(auto) };
      break;
    }
    case 'undoAutoTurn': {
      if (!job.autoTurned) break;
      const turns = { ...job.turns };
      for (const [k, t] of Object.entries(job.autoTurned)) if (turns[Number(k)] === t) delete turns[Number(k)];
      next = { turns, autoTurned: undefined };
      break;
    }
  }
  return next ? { ...job, ...next, rev: job.rev + 1, updatedAt: nowMs } : job;
}
