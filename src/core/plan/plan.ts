import { type Job, type StyleId, styleOf } from '../job/job';
import { shownOf } from '../layout/crop';
import { flowPages, onePerPageAt, sizeOf } from '../layout/flow';
import { pinnedPages } from '../layout/free';
import { allOnOne, bestPages, onPages } from '../layout/layouts';
import { A4, type Box, EDGE_MM, onePerPage, type Paper } from '../layout/onePerPage';
import { passportSheets, passportSize } from '../layout/passport';
import { straightAspect } from '../layout/quad';
import { innerOf, outline as turnedOutline } from '../layout/tilt';
import { MARGIN_MM, type Margins } from '../settings/settings';

export type Placement = {
  itemIndex: number;
  /** A page of a PDF (from 0); none for a photo. */
  pdfPage?: number;
  /** Normalised 0..1 in the upright, turned photo (PLAN §F1). */
  crop: { x: number; y: number; w: number; h: number };
  turns: 0 | 1 | 2 | 3;
  /** The job's print style (PLAN §F4), the same on every placement. */
  style: StyleId;
  /** Points, top-left origin, in the page's own direction. */
  box: Box;
  /**
   * An ID card (Phase 14) or a straightened photo (owner, 2026-10-24): its corners on the upright photo or page (8
   * fractions, TL TR BR BL); the engine straightens it into the box. The crop is then the whole image.
   */
  quad?: number[];
  /** A black border drawn inside the box, in points (passport photos, owner 2026-10-23). */
  border?: number;
  /**
   * A photo turned to any angle (owner, round 3): [deg] degrees clockwise beyond its quarter turns (−45…45) and its own
   * size [w] × [h] (points, the turned shape), centred in [box], which is its turned outline. The engine makes the
   * photo at 300 dpi of its own size and the print file draws it at that angle.
   */
  tilt?: { deg: number; w: number; h: number };
};

/** The one geometry both preview and print follow (PLAN §G1). Versioned; validated again natively. */
export type PrintPlan = {
  v: 1;
  jobId: string;
  rev: number;
  paper: { id: 'A4' | 'PHOTO_4x6'; wPt: number; hPt: number };
  colour: 'colour' | 'bw';
  copies: number;
  contentType: 'photo' | 'document';
  /**
   * The untouched path (PLAN §G4): the customer's own PDF is printed byte for byte. Only when nothing was changed:
   * one unlocked PDF, every page in order, no turns, Colour, 1 copy.
   */
  exact?: { itemIndex: number };
  pages: {
    orientation: 'portrait' | 'landscape';
    placements: Placement[];
    /** Thin cut lines (passport sheets), points in the page's own direction. */
    guides?: { x1: number; y1: number; x2: number; y2: number }[];
  }[];
};

const PHOTO = new Set(['jpeg', 'png', 'webp', 'gif', 'bmp']);

/** A photo's crop (kept upright) on the photo as shown turned [turns] times; the whole photo when it has none. */
function cropShown(job: Job, item: number, turns: number) {
  const c = job.crops?.[item];
  return c ? shownOf(c, turns) : { x: 0, y: 0, w: 1, h: 1 };
}

/**
 * How a photo is cut: its crop, or its straightened frame (owner, 2026-10-24), which the engine straightens into the
 * box (the whole photo is then the crop, as for ID cards).
 */
function cutOf(job: Job, item: number, turns: number): Pick<Placement, 'crop' | 'quad'> {
  const q = job.quads?.[item];
  return q ? { crop: { x: 0, y: 0, w: 1, h: 1 }, quad: q } : { crop: cropShown(job, item, turns) };
}

/** What the engine read from a customer's PDF (never a password): page sizes in points as shown. */
export type PdfFacts = {
  pages: number;
  sizes: [number, number][];
  forms: boolean;
  /** Not readable yet (its password is needed): its pages are left out. */
  locked: boolean;
  /** Opened with its password or as the app's unlocked copy: readable, but never printed as the customer's file. */
  unlocked?: boolean;
};

/** The shop printer's photo paper, from its test page (PLAN §D4 calibration): exact size and edge to keep clear. */
export type PhotoPaper = { wMils: number; hMils: number; edgeMm: number };

/**
 * A frame kept in shape [frame] (w ÷ h, on a photo of shape [aspect] as shown), inside the photo, at least 20 % of its
 * width, around the same centre: a saved or moved frame never stretches the photo (Phase 6 gate M3).
 */
export function fitFrame(r: { x: number; y: number; w: number; h: number }, aspect: number, frame: number) {
  // Lower bound last: a frame as tall as the photo (h a rounding hair above 1) still starts at 0, never at -2e-16, which
  // the engine would refuse as outside the photo (device finding, 2026-10-24).
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const maxW = Math.min(1, frame / aspect);
  const w = clamp(r.w, Math.min(0.2, maxW), maxW);
  const h = Math.min(1, (w * aspect) / frame);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
}

/** The passport frame to print: the saved one if it was made for this turn and size (re-fitted), else centred. */
export function passportFrame(job: Job, aspect: number) {
  const choice = job.passport as NonNullable<Job['passport']>;
  const size = passportSize(choice);
  const turns = job.turns?.[choice.item] ?? 0;
  const shown = turns % 2 === 1 ? 1 / aspect : aspect;
  const frame = size.wMm / size.hMm;
  const c = choice.crop;
  // The face fitted stays while the frame keeps its shape (a size 1 mm bigger keeps it; another shape starts again).
  const sameShape =
    c?.shape !== undefined ? Math.abs(c.shape - frame) < 0.005 : (c?.preset ?? choice.preset) === choice.preset;
  return c && (c.turns ?? 0) === turns && sameShape ? fitFrame(c, shown, frame) : centredFrame(shown, frame);
}

/** The largest frame of shape [frame] (w ÷ h) centred in a photo of shape [aspect] (w ÷ h), as fractions. */
export function centredFrame(aspect: number, frame: number) {
  if (aspect > frame) {
    const w = frame / aspect;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = aspect / frame;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

/**
 * The sheet a job really prints on: the shop printer's 4×6 photo paper when chosen for photos and known (calibrated
 * by a test page on this printer), else A4. Change, Ready and Result all say this one (gate review I6).
 */
export function paperOf(job: Job, photoPaper: PhotoPaper | null | undefined): 'A4' | 'PHOTO_4x6' {
  return job.paper === 'PHOTO_4x6' && photoPaper && job.layout !== 'document' && job.layout !== 'passport'
    ? 'PHOTO_4x6'
    : 'A4';
}

/**
 * The blank space at every edge of a photo page on A4 (owner, 2026-10-24): Word's margin, never less than the edge the
 * printer itself cannot print ([a4EdgeMm], from its test page), plus the owner's extra edge (Space at paper edges).
 */
export function photoEdgeMm(margins: Margins = 'narrow', a4EdgeMm?: number, extraEdgeMm = 0): number {
  return Math.max(MARGIN_MM[margins], a4EdgeMm ?? 0) + extraEdgeMm;
}

/**
 * Builds the plan for the job's choices (PLAN §G0/G1): its layout, page count, print order and turns. [aspects] =
 * width/height per item index as the engine measured it (upright); items without one, or that are not photos, are
 * left out until they can be placed. A turned photo is laid out with its turned shape.
 * [photoPaper]: the shop printer's 4×6 paper, used for passport sheets.
 */
export function buildPlan(
  job: Job,
  aspects: ReadonlyMap<number, number>,
  photoPaper?: PhotoPaper,
  /** The edge to keep clear on A4 for this printer (its largest measured margin, ≥ 3 mm); default 6 mm. */
  a4EdgeMm?: number,
  /** Customer PDFs as the engine read them, by item index (documents). */
  docs: ReadonlyMap<number, PdfFacts> = new Map(),
  /** Settings → Space at paper edges: More adds this much clear space at every edge (mm). */
  extraEdgeMm = 0,
  /** Settings → Margins: Word's margin for photo pages on A4 (Narrow unless the owner chose another). */
  margins: Margins = 'narrow',
): PrintPlan {
  if (job.layout === 'idCard' && job.idCard) return idCardPlan(job, (a4EdgeMm ?? EDGE_MM) + extraEdgeMm, docs);
  if (job.layout === 'passport' && job.passport)
    return extraEdgeMm > 0
      ? passportPlan(
          job,
          aspects,
          photoPaper && { ...photoPaper, edgeMm: photoPaper.edgeMm + extraEdgeMm },
          (a4EdgeMm ?? 6) + extraEdgeMm,
        )
      : passportPlan(job, aspects, photoPaper, a4EdgeMm);
  // The sheet the layouts fill: A4 with Word's margin, or the shop printer's calibrated 4×6 photo paper when chosen
  // for photos (PLAN §K3; A4 when that paper is not known); more space at the edges when the owner asked for it.
  const onPhotoPaper = paperOf(job, photoPaper) === 'PHOTO_4x6';
  const sheet: Paper =
    onPhotoPaper && photoPaper
      ? {
          id: 'PHOTO_4x6',
          wPt: (photoPaper.wMils * 72) / 1000,
          hPt: (photoPaper.hMils * 72) / 1000,
          edgeMm: photoPaper.edgeMm + extraEdgeMm,
        }
      : { ...A4, edgeMm: photoEdgeMm(margins, a4EdgeMm, extraEdgeMm) };
  // A cropped photo is laid out with its cropped shape (PLAN §F1); the crop is kept upright, so its shape there is
  // the photo's times the crop's.
  const cropped = new Map(aspects);
  for (const [k, c] of Object.entries(job.crops ?? {})) {
    const a = aspects.get(Number(k));
    if (a) cropped.set(Number(k), (a * c.w) / c.h);
  }
  // A straightened photo: the shape of its straightened part (its frame's sides, measured on the photo).
  for (const [k, q] of Object.entries(job.quads ?? {})) {
    const a = aspects.get(Number(k));
    if (a) cropped.set(Number(k), straightAspect(q, a));
  }
  // Documents keep their own edge (customer PDFs have their own margins; spec 2026-10-24 Part 2).
  if (job.layout === 'document')
    return documentPlan(job, cropped, docs, extraEdgeMm > 0 ? { ...A4, edgeMm: EDGE_MM + extraEdgeMm } : A4);
  aspects = cropped;
  const byIndex = new Map(job.items.map((i) => [i.index, i]));
  const turnsOf = (index: number) => (job.turns?.[index] ?? 0) as 0 | 1 | 2 | 3;
  // Turned to any angle (owner, round 3): laid out by its turned outline; its size stays its own (as in Word).
  const tiltOf = (index: number) => job.tilts?.[index] ?? 0;
  const own = new Map<number, number>();
  const items = (job.order ?? job.items.map((i) => i.index))
    .map((index) => byIndex.get(index))
    .filter((i): i is (typeof job.items)[number] => !!i && PHOTO.has(i.type) && (aspects.get(i.index) ?? 0) > 0)
    .map((i) => {
      const a = aspects.get(i.index) as number;
      const shape = turnsOf(i.index) % 2 === 1 ? 1 / a : a;
      own.set(i.index, shape);
      const o = turnedOutline(shape, 1, tiltOf(i.index));
      return { index: i.index, aspect: o.w / o.h };
    });
  /** The long side of a photo's turned outline when its own long side is [longMm]. */
  const outlineLong = (index: number, longMm: number) => {
    const a = own.get(index) ?? 1;
    const o =
      a >= 1 ? turnedOutline(longMm, longMm / a, tiltOf(index)) : turnedOutline(longMm * a, longMm, tiltOf(index));
    return Math.max(o.w, o.h);
  };
  // Upright paper unless the shopkeeper chose sideways (owner, 2026-10-23).
  const direction = job.direction ?? 'portrait';
  const chosen = job.sizes && Object.keys(job.sizes).length > 0 ? sizeOf(job.sizes) : undefined;
  const layoutPages = (() => {
    // Sizes chosen on Adjust (owner, 2026-10-23): one on each page keeps its pages; the others flow (Square wrap).
    if (chosen) {
      const sized = items.map((i) => ({ ...i, longMm: outlineLong(i.index, chosen(i.index)) }));
      const flow = (list: typeof sized) =>
        job.layout === 'allOnOne' || job.layout === 'morePages'
          ? flowPages(list, sheet, direction)
          : onePerPageAt(list, sheet, direction);
      // Placed by hand (owner, 2026-10-24): those pages first, each photo at its spot; the rest flow after them.
      if (job.spots && Object.keys(job.spots).length > 0) {
        const { pages, rest } = pinnedPages(sized, job.spots, sheet, direction);
        const others = sized.filter((i) => rest.includes(i.index));
        return [...pages, ...(others.length ? flow(others) : [])];
      }
      return flow(sized);
    }
    switch (job.layout) {
      case 'allOnOne':
        return allOnOne(items, sheet, direction);
      case 'morePages':
        return job.pages === 'best' || job.pages === undefined
          ? bestPages(items, sheet, direction)
          : onPages(items, sheet, job.pages, direction);
      default:
        return onePerPage(items, sheet, direction, 'topLeft');
    }
  })();
  const pages = layoutPages.map((p) => ({
    orientation: p.orientation,
    placements: p.placements.map(
      (pl): Placement => ({
        itemIndex: pl.itemIndex,
        ...cutOf(job, pl.itemIndex, turnsOf(pl.itemIndex)),
        turns: turnsOf(pl.itemIndex),
        style: styleOf(job),
        box: pl.box,
        ...(tiltOf(pl.itemIndex)
          ? {
              tilt: { deg: tiltOf(pl.itemIndex), ...innerOf(pl.box, own.get(pl.itemIndex) ?? 1, tiltOf(pl.itemIndex)) },
            }
          : {}),
      }),
    ),
  }));
  return {
    v: 1,
    jobId: job.id,
    rev: job.rev,
    paper: { id: sheet.id, wPt: sheet.wPt, hPt: sheet.hPt },
    colour: job.colour,
    copies: job.copies,
    // As a document (the printer's normal-speed mode, owner 2026-10-23), unless Best photo quality was chosen. On 4×6
    // photo paper always a document, like passport sheets: exact size, never borderless (gate review I4).
    contentType: job.quality === 'photo' && sheet.id !== 'PHOTO_4x6' ? 'photo' : 'document',
    pages,
  };
}

/** Every page of every file in received order: PDFs read so far (not locked), and photos as one page each. */
export function allDocPages(job: Job, aspects: ReadonlyMap<number, number>, docs: ReadonlyMap<number, PdfFacts>) {
  const byIndex = new Map(job.items.map((i) => [i.index, i]));
  return (job.order ?? job.items.map((i) => i.index)).flatMap((index) => {
    const item = byIndex.get(index);
    if (!item) return [];
    if (item.type === 'pdf') {
      const f = docs.get(index);
      // Only pages whose size the engine read (the first 500 of a longer PDF; Ready says so).
      return f && !f.locked
        ? Array.from({ length: Math.min(f.pages, f.sizes.length) }, (_, page) => ({ item: index, page }))
        : [];
    }
    return PHOTO.has(item.type) && (aspects.get(index) ?? 0) > 0 ? [{ item: index, page: 0 }] : [];
  });
}

/**
 * Documents (PLAN §G4, §J5): one A4 sheet per page to print, the page fitted inside the edges keeping its shape (a
 * wide page on a sideways sheet), photos as pages. The untouched path is chosen only when nothing was changed.
 */
function documentPlan(
  job: Job,
  aspects: ReadonlyMap<number, number>,
  docs: ReadonlyMap<number, PdfFacts>,
  sheet: Paper = A4,
): PrintPlan {
  const byIndex = new Map(job.items.map((i) => [i.index, i]));
  const all = allDocPages(job, aspects, docs);
  const chosen = (job.docPages ?? all).filter((p) => {
    const item = byIndex.get(p.item);
    if (!item) return false;
    if (item.type === 'pdf') {
      const f = docs.get(p.item);
      return !!f && !f.locked && p.page < f.pages && p.page < f.sizes.length;
    }
    return PHOTO.has(item.type) && p.page === 0 && (aspects.get(p.item) ?? 0) > 0;
  });
  const turnsOf = (p: { item: number; page: number }) =>
    (byIndex.get(p.item)?.type === 'pdf' ? (job.docTurns?.[`${p.item}:${p.page}`] ?? 0) : (job.turns?.[p.item] ?? 0)) as
      | 0
      | 1
      | 2
      | 3;
  const shapes = chosen.map((p, n) => {
    const item = byIndex.get(p.item);
    const [w, h] = item?.type === 'pdf' ? (docs.get(p.item)?.sizes[p.page] ?? [1, 1]) : [aspects.get(p.item) ?? 1, 1];
    const t = turnsOf(p);
    return { index: n, aspect: t % 2 === 1 ? h / w : w / h };
  });
  const pdfItems = job.items.filter((i) => i.type === 'pdf');
  const photoItems = job.items.filter((i) => PHOTO.has(i.type));
  const only = pdfItems.length === 1 && photoItems.length === 0 ? pdfItems[0] : undefined;
  const f = only ? docs.get(only.index) : undefined;
  const untouched =
    !!only &&
    !!f &&
    !f.locked &&
    !f.unlocked &&
    job.colour === 'colour' &&
    styleOf(job) === 'original' &&
    job.copies === 1 &&
    !job.docScale &&
    !job.direction &&
    chosen.length === f.pages &&
    chosen.every((p, n) => p.item === only.index && p.page === n && turnsOf(p) === 0);
  // Upright paper unless the shopkeeper chooses Landscape, as for every job (spec Part 4): a wide page is fitted across
  // it. The customer's own PDF sent untouched prints as it came, so its pages are shown as they are in the file.
  const laid = onePerPage(shapes, sheet, untouched ? undefined : (job.direction ?? 'portrait'));
  const pages = laid.map((pg, n) => {
    const p = chosen[n] as { item: number; page: number };
    const isPdf = byIndex.get(p.item)?.type === 'pdf';
    return {
      orientation: pg.orientation,
      placements: [
        {
          itemIndex: p.item,
          ...(isPdf ? { pdfPage: p.page } : {}),
          ...(isPdf ? { crop: { x: 0, y: 0, w: 1, h: 1 } } : cutOf(job, p.item, turnsOf(p))),
          turns: turnsOf(p),
          style: styleOf(job),
          // Its size on Adjust (a share of the size that fits), centred where it was.
          box: scaledBox((pg.placements[0] as { box: Box }).box, job.docScale?.[`${p.item}:${p.page}`] ?? 1),
        },
      ],
    };
  });
  return {
    v: 1,
    jobId: job.id,
    rev: job.rev,
    paper: A4,
    colour: job.colour,
    copies: job.copies,
    contentType: 'document',
    ...(untouched && only ? { exact: { itemIndex: only.index } } : {}),
    pages,
  };
}

/**
 * Passport sheets (PLAN §G0, §J4): on the printer's own 4×6 photo paper when its test page found one, else on A4 (30 a
 * sheet), never on a paper the printer may not offer. A sheet is a document (no photo enlarging by the print service).
 */
function passportPlan(
  job: Job,
  aspects: ReadonlyMap<number, number>,
  photoPaper?: PhotoPaper,
  a4EdgeMm?: number,
): PrintPlan {
  const choice = job.passport as NonNullable<Job['passport']>;
  const preset = passportSize(choice);
  const turns = (job.turns?.[choice.item] ?? 0) as 0 | 1 | 2 | 3;
  const a = aspects.get(choice.item) ?? 0;
  const onPhoto = photoPaper
    ? { id: 'PHOTO_4x6' as const, wPt: (photoPaper.wMils * 72) / 1000, hPt: (photoPaper.hMils * 72) / 1000 }
    : undefined;
  // A size too big for the photo paper prints on A4 (Ready says so), never on a blank sheet.
  const direction = job.direction ?? 'portrait';
  const fits =
    !!onPhoto && !!photoPaper && passportSheets(1, onPhoto, photoPaper.edgeMm, preset, direction).perSheet > 0;
  const paper = fits && onPhoto ? onPhoto : A4;
  const edgeMm = fits && photoPaper ? photoPaper.edgeMm : (a4EdgeMm ?? 6);
  const crop = a > 0 ? passportFrame(job, a) : { x: 0, y: 0, w: 1, h: 1 };
  const sheets = a > 0 ? passportSheets(choice.count, paper, edgeMm, preset, direction).pages : [];
  // A border is the cutting guide: no grey cut lines beside it.
  const border = (choice.border ?? 0) > 0 ? choice.border : undefined;
  return {
    v: 1,
    jobId: job.id,
    rev: job.rev,
    paper,
    colour: job.colour,
    copies: 1,
    contentType: 'document',
    pages: sheets.map((s) => ({
      orientation: s.orientation,
      placements: s.boxes.map(
        (box): Placement => ({
          itemIndex: choice.item,
          crop,
          turns,
          style: styleOf(job),
          box,
          ...(border ? { border } : {}),
        }),
      ),
      ...(border ? {} : { guides: s.guides }),
    })),
  };
}

const MM = 72 / 25.4;
/** An ID-1 card (Aadhaar, PAN, voter ID, driving licence): 85.6 × 54 mm. */
export const CARD_W_MM = 85.6;
export const CARD_H_MM = 54;
const CARD_TOP_MM = 20;
const CARD_GAP_MM = 10;
const SET_GAP_MM = 5;

/**
 * How many sets fit on A4 with [edgeMm] clear at every edge: rows of front and back (or of two single cards); a row is
 * as tall as a standing card when one is turned a quarter ([standing], owner round 4).
 */
export function maxCardSets(edgeMm: number, sides: number, standing = false): number {
  const rowH = standing ? CARD_W_MM : CARD_H_MM;
  const rows = Math.max(1, Math.floor((297 - 2 * edgeMm + SET_GAP_MM) / (rowH + SET_GAP_MM)));
  return sides >= 2 ? rows : rows * 2;
}

/**
 * A card's size on paper (mm) at [scale] of the real card: lying, 85.6 × 54; turned a quarter it stands, 54 × 85.6
 * (vertical ID cards, owner round 4).
 */
export function cardBox(turns: number, scale = 1): { w: number; h: number } {
  return turns % 2 === 1
    ? { w: CARD_H_MM * scale, h: CARD_W_MM * scale }
    : { w: CARD_W_MM * scale, h: CARD_H_MM * scale };
}

/** The thin cut lines around a box (its outline). */
function outline(b: Box) {
  return [
    { x1: b.x, y1: b.y, x2: b.x + b.w, y2: b.y },
    { x1: b.x + b.w, y1: b.y, x2: b.x + b.w, y2: b.y + b.h },
    { x1: b.x, y1: b.y + b.h, x2: b.x + b.w, y2: b.y + b.h },
    { x1: b.x, y1: b.y, x2: b.x, y2: b.y + b.h },
  ];
}

/**
 * Aadhaar & ID card copy (Phase 14 spec "How big?"), always on A4 portrait, as a document (exact size, never
 * enlarged by the print service):
 * - real: each card exactly 85.6 × 54 mm, centred, stacked 10 mm apart from 20 mm below the top, cut lines around;
 * - big: both enlarged equally to the largest that fits (at most 2×), stacked 10 mm apart, centred, no cut lines;
 * - sets: real-size sets (front left, back right) in rows 5 mm apart, as many as asked and fit, cut lines;
 * - page: the whole e-Aadhaar page, fitted inside the edges.
 */
/**
 * The cards' size as drawn in an ID card [plan], as a share of the real card: a card's long side over 85.6 mm, standing
 * or lying; a chosen size the plan held down to what fits is the size that prints (review I2, round 4).
 */
export function drawnCardScale(plan: PrintPlan): number {
  const b = plan.pages[0]?.placements[0]?.box;
  return b ? Math.max(b.w, b.h) / (CARD_W_MM * MM) : 1;
}

export function idCardPlan(job: Job, edgeMm: number, docs: ReadonlyMap<number, PdfFacts> = new Map()): PrintPlan {
  const choice = job.idCard as NonNullable<Job['idCard']>;
  const style: StyleId = styleOf(job) === 'ocv' ? 'bw' : styleOf(job);
  const card = (i: number, box: Box): Placement => {
    const c = choice.cards[i] as (typeof choice.cards)[number];
    return {
      itemIndex: c.item,
      ...(c.page !== undefined ? { pdfPage: c.page } : {}),
      crop: { x: 0, y: 0, w: 1, h: 1 },
      turns: c.turns,
      style,
      box,
      quad: c.quad,
    };
  };
  const wMm = 210;
  const hMm = 297;
  const sides = choice.cards.length;
  const page = (placements: Placement[], guides?: ReturnType<typeof outline>) => ({
    orientation: 'portrait' as const,
    placements,
    ...(guides && guides.length ? { guides } : {}),
  });
  // Each card's own shape (a card turned a quarter stands), one under another at [scale], centred across, from [top] mm.
  const sizes = choice.cards.map((c) => cardBox(c.turns));
  const widest = Math.max(...sizes.map((s) => s.w));
  const sumH = sizes.reduce((t, s) => t + s.h, 0);
  const gaps = CARD_GAP_MM * (sides - 1);
  const fit = Math.min((wMm - 2 * edgeMm) / widest, (hMm - 2 * edgeMm - gaps) / sumH);
  const stack = (scale: number, top: number): Box[] => {
    let y = top;
    return sizes.map((s) => {
      const w = s.w * scale;
      const h = s.h * scale;
      const b = { x: ((wMm - w) / 2) * MM, y: y * MM, w: w * MM, h: h * MM };
      y += h + CARD_GAP_MM;
      return b;
    });
  };
  let pages: PrintPlan['pages'];
  if (choice.size === 'page' && choice.cards[0]?.page !== undefined) {
    const c = choice.cards[0];
    const size = docs.get(c.item)?.sizes[c.page as number] ?? [595.2755905511812, 841.8897637795275];
    const room = { w: (wMm - 2 * edgeMm) * MM, h: (hMm - 2 * edgeMm) * MM };
    const s = Math.min(room.w / size[0], room.h / size[1]);
    const box = { w: size[0] * s, h: size[1] * s, x: 0, y: 0 };
    box.x = (A4.wPt - box.w) / 2;
    box.y = (A4.hPt - box.h) / 2;
    pages = [page([{ itemIndex: c.item, pdfPage: c.page, crop: { x: 0, y: 0, w: 1, h: 1 }, turns: 0, style, box }])];
  } else if (choice.size === 'custom') {
    // Adjust (owner, 2026-10-23): both cards at the chosen share of the real size, as large as fits, with cut lines.
    const scale = Math.min(choice.scale ?? 1, fit);
    const boxes = stack(scale, (hMm - (sumH * scale + gaps)) / 2);
    pages = [
      page(
        boxes.map((b, i) => card(i, b)),
        boxes.flatMap(outline),
      ),
    ];
  } else if (choice.size === 'big') {
    const scale = Math.min(2, fit);
    const boxes = stack(scale, (hMm - (sumH * scale + gaps)) / 2);
    pages = [page(boxes.map((b, i) => card(i, b)))];
  } else if (choice.size === 'sets') {
    const max = maxCardSets(
      edgeMm,
      sides,
      sizes.some((s) => s.h > s.w),
    );
    const sets = Math.min(max, Math.max(1, choice.sets));
    // Slots in reading order, two to a row: front and back of each set, or two single cards. A row is as tall as its
    // taller card; each card sits in the middle of it.
    const order = Array.from({ length: sides >= 2 ? sets * 2 : sets }, (_, k) => (sides >= 2 ? k % 2 : 0));
    const pair = [sizes[0], sizes[sides >= 2 ? 1 : 0]] as { w: number; h: number }[];
    const [a, b] = pair as [{ w: number; h: number }, { w: number; h: number }];
    const rowH = Math.max(a.h, b.h);
    const left = (wMm - (a.w + SET_GAP_MM + b.w)) / 2;
    const boxes = order.map((_, k) => {
      const s = k % 2 === 0 ? a : b;
      const rowTop = edgeMm + Math.floor(k / 2) * (rowH + SET_GAP_MM);
      return {
        x: (k % 2 === 0 ? left : left + a.w + SET_GAP_MM) * MM,
        y: (rowTop + (rowH - s.h) / 2) * MM,
        w: s.w * MM,
        h: s.h * MM,
      };
    });
    pages = [
      page(
        order.map((i, k) => card(i, boxes[k] as Box)),
        boxes.flatMap(outline),
      ),
    ];
  } else {
    const boxes = stack(1, Math.max(edgeMm, CARD_TOP_MM));
    pages = [
      page(
        boxes.map((b, i) => card(i, b)),
        boxes.flatMap(outline),
      ),
    ];
  }
  return {
    v: 1,
    jobId: job.id,
    rev: job.rev,
    paper: { id: 'A4', wPt: A4.wPt, hPt: A4.hPt },
    colour: job.colour,
    copies: job.copies,
    contentType: 'document',
    pages,
  };
}

/** [b] at [s] of its size, about its centre. */
function scaledBox(b: Box, s: number): Box {
  if (s === 1) return b;
  return { x: b.x + (b.w * (1 - s)) / 2, y: b.y + (b.h * (1 - s)) / 2, w: b.w * s, h: b.h * s };
}

/** Canonical JSON (sorted keys) so the same plan always hashes the same. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

/**
 * 64-bit FNV-1a of the plan without its rev: names out/<planHash>/ and tags every render (PLAN §D2c). Two revisions
 * with identical geometry share one print file; any choice that changes the output changes the hash.
 */
export function planHash(plan: PrintPlan): string {
  const { rev: _rev, ...rest } = plan;
  let h = 0xcbf29ce484222325n;
  for (const ch of new TextEncoder().encode(canonical(rest))) {
    h ^= BigInt(ch);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}
