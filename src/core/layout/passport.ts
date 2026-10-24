/** PLAN §G0 / §K4: passport photo sizes. 35 × 45 mm is the default (India). */
export const PASSPORT_PRESETS = {
  '35x45': { id: '35x45', wMm: 35, hMm: 45 },
  '20x25': { id: '20x25', wMm: 20, hMm: 25 },
  '2x2in': { id: '2x2in', wMm: 50.8, hMm: 50.8 },
} as const;
export type PassportPreset = (typeof PASSPORT_PRESETS)[keyof typeof PASSPORT_PRESETS];
/** A passport photo size: a preset, or the shop's own (custom). */
export type PassportSize = { id: string; wMm: number; hMm: number };

/** The size a passport choice prints at: its preset, or its own custom size. */
export function passportSize(choice: { preset: string; sizeMm?: { w: number; h: number } }): PassportSize {
  if (choice.preset === 'custom' && choice.sizeMm) return { id: 'custom', wMm: choice.sizeMm.w, hMm: choice.sizeMm.h };
  return PASSPORT_PRESETS[choice.preset as keyof typeof PASSPORT_PRESETS] ?? PASSPORT_PRESETS['35x45'];
}

const MM = 72 / 25.4;
/** Space between photos, where the cut lines run (PLAN §G0: 2 mm for passport). */
const GAP_MM = 2;

type Box = { x: number; y: number; w: number; h: number };
type Line = { x1: number; y1: number; x2: number; y2: number };
export type PassportPage = { orientation: 'portrait' | 'landscape'; boxes: Box[]; guides: Line[] };

/** Columns × rows of [preset] photos that fit a [w] × [h] mm sheet inside [edge] mm edges with 2 mm gaps. */
function grid(wMm: number, hMm: number, edgeMm: number, preset: PassportSize) {
  const cols = Math.floor((wMm - 2 * edgeMm + GAP_MM + 1e-9) / (preset.wMm + GAP_MM));
  const rows = Math.floor((hMm - 2 * edgeMm + GAP_MM + 1e-9) / (preset.hMm + GAP_MM));
  return { cols: Math.max(0, cols), rows: Math.max(0, rows) };
}

/**
 * The sheets for [count] passport photos (PLAN §G0): as many photos per sheet as the paper holds inside its edges
 * (the sheet is turned sideways only when that holds more), filled in reading order, the grid centred, with cut
 * lines along the gaps. Every photo is exactly the preset size; sheets = ⌈count ÷ per sheet⌉.
 */
export function passportSheets(
  count: number,
  paper: { wPt: number; hPt: number },
  edgeMm: number,
  preset: PassportSize,
  /** The sheet's direction (the job's choice); none = whichever holds more photos. */
  direction?: 'portrait' | 'landscape',
): { perSheet: number; pages: PassportPage[] } {
  const wMm = paper.wPt / MM;
  const hMm = paper.hPt / MM;
  const upright = grid(wMm, hMm, edgeMm, preset);
  const sideways = grid(hMm, wMm, edgeMm, preset);
  const turn = direction ? direction === 'landscape' : sideways.cols * sideways.rows > upright.cols * upright.rows;
  const { cols, rows } = turn ? sideways : upright;
  const perSheet = cols * rows;
  if (perSheet === 0 || count < 1) return { perSheet, pages: [] };
  const [sw, sh] = turn ? [hMm, wMm] : [wMm, hMm];
  const gridW = cols * preset.wMm + (cols - 1) * GAP_MM;
  const gridH = rows * preset.hMm + (rows - 1) * GAP_MM;
  const x0 = (sw - gridW) / 2;
  const y0 = (sh - gridH) / 2;
  const pages: PassportPage[] = [];
  for (let first = 0; first < count; first += perSheet) {
    const n = Math.min(perSheet, count - first);
    const boxes = Array.from({ length: n }, (_, i) => ({
      x: (x0 + (i % cols) * (preset.wMm + GAP_MM)) * MM,
      y: (y0 + Math.floor(i / cols) * (preset.hMm + GAP_MM)) * MM,
      w: preset.wMm * MM,
      h: preset.hMm * MM,
    }));
    // Cut lines in the middle of each gap between used columns and rows, across the photos only.
    const usedCols = Math.min(cols, n);
    const usedRows = Math.ceil(n / cols);
    const guides: Line[] = [];
    for (let c = 1; c < usedCols; c++) {
      const x = (x0 + c * (preset.wMm + GAP_MM) - GAP_MM / 2) * MM;
      guides.push({ x1: x, y1: y0 * MM, x2: x, y2: (y0 + usedRows * (preset.hMm + GAP_MM) - GAP_MM) * MM });
    }
    for (let r = 1; r < usedRows; r++) {
      const y = (y0 + r * (preset.hMm + GAP_MM) - GAP_MM / 2) * MM;
      guides.push({ x1: x0 * MM, y1: y, x2: (x0 + usedCols * (preset.wMm + GAP_MM) - GAP_MM) * MM, y2: y });
    }
    pages.push({ orientation: turn ? 'landscape' : 'portrait', boxes, guides });
  }
  return { perSheet, pages };
}
