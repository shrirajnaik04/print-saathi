import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer, normalizeJob } from '../job/job';
import { freezeSizes } from '../layout/flow';
import { buildPlan, idCardPlan } from './plan';
import { idCardLine } from './summary';

// Adjust (owner, 2026-10-23): the sizes the shopkeeper chose are kept in the job and printed exactly; pages, ID cards
// and passport photos have their own size too.
const MM = 72 / 25.4;
const intake = {
  intakeId: 'in1',
  rejected: 0,
  refusedByPolicy: 0,
  files: [
    { index: 1, path: '/p/1.jpg', sniffedType: 'jpeg', bytes: 1, sha256: 'a' },
    { index: 2, path: '/p/2.jpg', sniffedType: 'jpeg', bytes: 1, sha256: 'b' },
    { index: 3, path: '/p/3.jpg', sniffedType: 'jpeg', bytes: 1, sha256: 'c' },
  ],
} as never;
const aspects = new Map([
  [1, 0.75],
  [2, 1.5],
  [3, 1],
]);
const base = jobFromIntake('job1', intake, 1);
const allOnOne = jobReducer(base, { type: 'setLayout', layout: 'allOnOne' }, 2);
const longMm = (b: { w: number; h: number }) => Math.max(b.w, b.h) / MM;
const boxOf = (plan: ReturnType<typeof buildPlan>, item: number) =>
  plan.pages.flatMap((p) => p.placements).find((p) => p.itemIndex === item)?.box as { w: number; h: number };

describe('sizes the shopkeeper chose', () => {
  it('print exactly, flowing in rows (Square wrap)', () => {
    const j = jobReducer(allOnOne, { type: 'setSizes', sizes: { 1: 80, 2: 120, 3: 50 } }, 3);
    const plan = buildPlan(j, aspects);
    expect(longMm(boxOf(plan, 1))).toBeCloseTo(80, 6);
    expect(longMm(boxOf(plan, 2))).toBeCloseTo(120, 6);
    expect(longMm(boxOf(plan, 3))).toBeCloseTo(50, 6);
  });

  it('freezing the automatic layout keeps every photo where it was in size', () => {
    const before = buildPlan(allOnOne, aspects);
    const frozen = jobReducer(allOnOne, { type: 'setSizes', sizes: freezeSizes(before) }, 3);
    const after = buildPlan(frozen, aspects);
    for (const i of [1, 2, 3]) expect(longMm(boxOf(after, i))).toBeCloseTo(longMm(boxOf(before, i)), 6);
  });

  it('a turned photo that no longer fits is shrunk to fit (never outside the page)', () => {
    const sideways = jobReducer(allOnOne, { type: 'setDirection', direction: 'landscape' }, 3);
    const big = jobReducer(sideways, { type: 'setSizes', sizes: { 1: 150, 2: 280, 3: 50 } }, 4);
    const turned = jobReducer(big, { type: 'turnItem', index: 2 }, 5); // 280 mm wide becomes 280 mm tall: too tall
    const plan = buildPlan(turned, aspects);
    const b = boxOf(plan, 2);
    expect(b.h / MM).toBeLessThanOrEqual(210 - 12 + 1e-6);
    for (const p of plan.pages.flatMap((pg) => pg.placements)) expect(p.box.y + p.box.h).toBeLessThanOrEqual(595.3);
  });

  it('a photo without a size gets the median size of the others', () => {
    const j = jobReducer(allOnOne, { type: 'setSizes', sizes: { 1: 60, 2: 100 } }, 3);
    expect(longMm(boxOf(buildPlan(j, aspects), 3))).toBeCloseTo(80, 6);
  });

  it('choosing another layout, number of pages or paper goes back to automatic sizes', () => {
    const j = jobReducer(allOnOne, { type: 'setSizes', sizes: { 1: 60, 2: 100, 3: 40 } }, 3);
    expect(jobReducer(j, { type: 'setLayout', layout: 'morePages' }, 4).sizes).toBeUndefined();
    expect(jobReducer(j, { type: 'setPaper', paper: 'PHOTO_4x6' }, 4).sizes).toBeUndefined();
    expect(jobReducer(j, { type: 'setSizes', sizes: null }, 4).sizes).toBeUndefined();
    // Turning, cropping and the paper direction keep them.
    expect(jobReducer(j, { type: 'turnItem', index: 1 }, 4).sizes).toEqual({ 1: 60, 2: 100, 3: 40 });
    expect(jobReducer(j, { type: 'setDirection', direction: 'landscape' }, 4).sizes).toEqual({ 1: 60, 2: 100, 3: 40 });
  });

  // Owner, 2026-10-24: at the top-left inside Word's Narrow margins (12.7 mm), like a Word page (was centred).
  it('one on each page: each photo keeps its page, at its top-left at its size', () => {
    const j = jobReducer(base, { type: 'setSizes', sizes: { 1: 100, 2: 90, 3: 50 } }, 3);
    const plan = buildPlan(j, aspects);
    expect(plan.pages).toHaveLength(3);
    const b = plan.pages[2]?.placements[0]?.box as { x: number; y: number; w: number; h: number };
    expect(b.w / MM).toBeCloseTo(50, 6);
    expect(b.x / MM).toBeCloseTo(12.7, 6);
    expect(b.y / MM).toBeCloseTo(12.7, 6);
  });

  it('only real sizes of photos in the job are kept (old or damaged jobs load)', () => {
    const j = jobReducer(allOnOne, { type: 'setSizes', sizes: { 1: 60, 2: 100, 3: 40 } }, 3);
    const loaded = normalizeJob(JSON.parse(JSON.stringify({ ...j, sizes: { 1: 60, 2: -5, 9: 40, 3: 'x' } })));
    expect(loaded?.sizes).toEqual({ 1: 60 });
    expect(normalizeJob(JSON.parse(JSON.stringify(base)))?.sizes).toBeUndefined();
    const removed = jobReducer(j, { type: 'removeItem', index: 2 }, 4);
    expect(removed.sizes).toEqual({ 1: 60, 3: 40 });
  });
});

describe('a document page at its own size', () => {
  const pdfIntake = {
    intakeId: 'in2',
    rejected: 0,
    refusedByPolicy: 0,
    files: [{ index: 1, path: '/p/1.pdf', sniffedType: 'pdf', bytes: 1, sha256: 'a' }],
  } as never;
  const docs = new Map([
    [
      1,
      {
        pages: 2,
        sizes: [
          [595.2755905511812, 841.8897637795275] as [number, number],
          [595.2755905511812, 841.8897637795275] as [number, number],
        ],
        forms: false,
        locked: false,
      },
    ],
  ]);
  // In colour: an unchanged colour PDF is the customer's own file (black & white is always prepared).
  const doc = jobReducer(jobFromIntake('d1', pdfIntake, 1), { type: 'setDocument', colour: 'colour' }, 2);

  it('90 %: the page is smaller on its sheet, centred, and no longer the untouched file', () => {
    expect(buildPlan(doc, new Map(), undefined, undefined, docs).exact).toBeDefined();
    const smaller = jobReducer(doc, { type: 'setDocScale', item: 1, page: 0, scale: 0.9 }, 3);
    const plan = buildPlan(smaller, new Map(), undefined, undefined, docs);
    expect(plan.exact).toBeUndefined();
    const full = buildPlan(doc, new Map(), undefined, undefined, docs).pages[0]?.placements[0]?.box;
    const b = plan.pages[0]?.placements[0]?.box;
    expect((b?.w ?? 0) / (full?.w ?? 1)).toBeCloseTo(0.9, 6);
    expect((b?.x ?? 0) + (b?.w ?? 0) / 2).toBeCloseTo((full?.x ?? 0) + (full?.w ?? 0) / 2, 6);
    // Page 2 is untouched.
    expect(plan.pages[1]?.placements[0]?.box.w).toBeCloseTo(full?.w ?? 0, 6);
  });

  it('50 % to 100 % in 5 % steps; 100 % is the page fitted as before', () => {
    expect(jobReducer(doc, { type: 'setDocScale', item: 1, page: 0, scale: 0.3 }, 3).docScale).toEqual({ '1:0': 0.5 });
    expect(jobReducer(doc, { type: 'setDocScale', item: 1, page: 0, scale: 0.92 }, 3).docScale).toEqual({ '1:0': 0.9 });
    const back = jobReducer(
      jobReducer(doc, { type: 'setDocScale', item: 1, page: 0, scale: 0.8 }, 3),
      { type: 'setDocScale', item: 1, page: 0, scale: 1 },
      4,
    );
    expect(back.docScale).toBeUndefined();
  });
});

describe('ID cards at their own size', () => {
  const cards = jobReducer(
    base,
    {
      type: 'setIdCards',
      cards: [
        { item: 1, quad: [0.1, 0.1, 0.9, 0.1, 0.9, 0.6, 0.1, 0.6], turns: 0 },
        { item: 2, quad: [0.1, 0.1, 0.9, 0.1, 0.9, 0.6, 0.1, 0.6], turns: 0 },
      ],
    },
    2,
  );

  it('120 %: both cards 102.7 × 64.8 mm with cut lines; the summary says so', () => {
    const j = jobReducer(cards, { type: 'setIdCardScale', scale: 1.2 }, 3);
    expect(j.idCard?.size).toBe('custom');
    const plan = idCardPlan(j, 6);
    for (const p of plan.pages[0]?.placements ?? []) {
      expect(p.box.w / MM).toBeCloseTo(85.6 * 1.2, 6);
      expect(p.box.h / MM).toBeCloseTo(54 * 1.2, 6);
    }
    expect(plan.pages[0]?.guides?.length).toBeGreaterThan(0);
    expect(idCardLine(plan, 'custom', 1.2)).toMatch(/^ID card · 120 % · A4/);
  });

  it('70 % to 200 % in 10 % steps; 100 % is the real card size', () => {
    expect(jobReducer(cards, { type: 'setIdCardScale', scale: 5 }, 3).idCard?.scale).toBe(2);
    expect(jobReducer(cards, { type: 'setIdCardScale', scale: 0.1 }, 3).idCard?.scale).toBe(0.7);
    expect(jobReducer(cards, { type: 'setIdCardScale', scale: 1.04 }, 3).idCard?.size).toBe('real');
  });
});
