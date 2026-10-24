import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer, normalizeJob } from '../job/job';
import { buildPlan } from './plan';
import { summaryLine } from './summary';

// Paper direction (owner, 2026-10-23: "portrait or landscape paper, give that option. Default select portrait for
// all"): the app never turns the paper by itself any more.
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
const wide = new Map([
  [1, 1.5],
  [2, 1.5],
  [3, 0.75],
]);
const job = jobFromIntake('job1', intake, 1);
const layouts = (j: typeof job) => [
  j,
  jobReducer(j, { type: 'setLayout', layout: 'allOnOne' }, 2),
  jobReducer(j, { type: 'setLayout', layout: 'morePages' }, 2),
  jobReducer(jobReducer(j, { type: 'setLayout', layout: 'morePages' }, 2), { type: 'setPages', pages: 2 }, 3),
  jobReducer(j, { type: 'setPassport', item: 1, count: 5 }, 2),
];
const asDocument = (j: typeof job) => jobReducer(j, { type: 'setDocument' }, 2);

describe('paper direction', () => {
  it('a new job prints on upright paper, in every layout', () => {
    for (const j of layouts(job))
      expect(
        buildPlan(j, wide).pages.map((p) => p.orientation),
        j.layout,
      ).toEqual(buildPlan(j, wide).pages.map(() => 'portrait'));
  });

  it('a wide photo alone stays on upright paper, fitted across it', () => {
    const page = buildPlan(job, wide).pages[0];
    expect(page?.orientation).toBe('portrait');
    expect((page?.placements[0]?.box.w ?? 0) / MM).toBeCloseTo(210 - 12, 6);
  });

  // Spec Part 4: "every photo, document and passport job prints on upright paper unless the shopkeeper chooses
  // sideways" (whole-branch review, 2026-10-24: documents had kept each page's own direction by an executor ruling).
  it('documents start on upright paper too (a wide page fitted across it); Landscape lays every page sideways', () => {
    expect(buildPlan(asDocument(job), wide).pages.map((p) => p.orientation)).toEqual([
      'portrait',
      'portrait',
      'portrait',
    ]);
    const sideways = jobReducer(asDocument(job), { type: 'setDirection', direction: 'landscape' }, 3);
    expect(buildPlan(sideways, wide).pages.every((p) => p.orientation === 'landscape')).toBe(true);
  });

  it('Landscape puts every page sideways (photos, documents, passport sheets)', () => {
    const sideways = jobReducer(job, { type: 'setDirection', direction: 'landscape' }, 2);
    for (const j of [...layouts(sideways), asDocument(sideways)])
      expect(
        buildPlan(j, wide).pages.map((p) => p.orientation),
        j.layout,
      ).toEqual(buildPlan(j, wide).pages.map(() => 'landscape'));
  });

  it('Best counts its pages in the chosen direction (every photo still at least 4 cm)', () => {
    for (const direction of ['portrait', 'landscape'] as const) {
      const j = jobReducer(
        jobReducer(job, { type: 'setDirection', direction }, 2),
        { type: 'setLayout', layout: 'morePages' },
        3,
      );
      const plan = buildPlan(j, wide);
      expect(plan.pages.every((p) => p.orientation === direction)).toBe(true);
      for (const p of plan.pages.flatMap((pg) => pg.placements))
        expect(Math.min(p.box.w, p.box.h) / MM).toBeGreaterThanOrEqual(40 - 1e-6);
    }
  });

  it('the choice is kept with the job; anything else is ignored', () => {
    const sideways = jobReducer(job, { type: 'setDirection', direction: 'landscape' }, 2);
    expect(sideways.direction).toBe('landscape');
    expect(jobReducer(sideways, { type: 'setDirection', direction: 'upside' as never }, 3)).toBe(sideways);
    expect(normalizeJob(JSON.parse(JSON.stringify(sideways)))?.direction).toBe('landscape');
    expect(normalizeJob(JSON.parse(JSON.stringify({ ...sideways, direction: 'diagonal' })))?.direction).toBeUndefined();
  });

  it('the summary line says Landscape when chosen, nothing extra for upright paper', () => {
    expect(summaryLine(buildPlan(job, wide))).not.toMatch(/Landscape/);
    const sideways = jobReducer(job, { type: 'setDirection', direction: 'landscape' }, 2);
    expect(summaryLine(buildPlan(sideways, wide))).toMatch(/A4 Landscape/);
  });
});
