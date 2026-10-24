import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer, normalizeJob } from '../job/job';
import { normalizeSettings } from '../settings/settings';
import { buildPlan } from './plan';

// Passport photos (owner, 2026-10-23): a black border ½–3 pt (1½ pt by default) drawn inside each photo, so a photo cut
// along the outside of the line is still exactly its size; and a custom size (default stays 3.5 × 4.5 cm).
const MM = 72 / 25.4;
const intake = {
  intakeId: 'in1',
  rejected: 0,
  refusedByPolicy: 0,
  files: [{ index: 1, path: '/p/1.jpg', sniffedType: 'jpeg', bytes: 1, sha256: 'a' }],
} as never;
const aspects = new Map([[1, 0.75]]);
const tenByFifteen = { wMils: 3937, hMils: 5906, edgeMm: 4 };
const base = jobFromIntake('job1', intake, 1);
const passport = (extra: Record<string, unknown> = {}) =>
  jobReducer(base, { type: 'setPassport', item: 1, count: 5, ...extra }, 2);

describe('passport border', () => {
  it('a new passport job has the 1½ pt border, inside the exact box, and no grey cut lines', () => {
    const plan = buildPlan(passport(), aspects, tenByFifteen);
    const page = plan.pages[0];
    expect(page?.guides ?? []).toEqual([]);
    for (const p of page?.placements ?? []) {
      expect(p.border).toBe(1.5);
      expect(p.box.w / MM).toBeCloseTo(35, 6);
      expect(p.box.h / MM).toBeCloseTo(45, 6);
    }
  });

  it("the owner's border from Settings is the new job's; None prints the cut lines as before", () => {
    const thin = passport({ defaults: { count: 5, preset: '35x45', border: 0.5 } });
    expect(buildPlan(thin, aspects).pages[0]?.placements[0]?.border).toBe(0.5);
    const none = jobReducer(passport(), { type: 'setPassportBorder', border: 0 }, 3);
    const plan = buildPlan(none, aspects, tenByFifteen);
    expect(plan.pages[0]?.placements.every((p) => p.border === undefined)).toBe(true);
    expect(plan.pages[0]?.guides?.length).toBeGreaterThan(0);
  });

  it('only the six widths are taken', () => {
    const j = passport();
    expect(jobReducer(j, { type: 'setPassportBorder', border: 2.25 }, 3).passport?.border).toBe(2.25);
    expect(jobReducer(j, { type: 'setPassportBorder', border: 7 }, 3)).toBe(j);
    expect(jobReducer(j, { type: 'setPassportBorder', border: Number.NaN }, 3)).toBe(j);
  });

  it('an old saved job (no border) still loads and prints without one', () => {
    const { border: _b, ...rest } = passport().passport as NonNullable<ReturnType<typeof passport>['passport']>;
    const old = normalizeJob(JSON.parse(JSON.stringify({ ...passport(), passport: rest })));
    expect(old?.passport?.border).toBeUndefined();
    expect(buildPlan(old as NonNullable<typeof old>, aspects).pages[0]?.placements[0]?.border).toBeUndefined();
  });
});

describe('passport custom size', () => {
  it('a custom 34.4 × 42.3 mm prints exactly that size', () => {
    const j = jobReducer(passport(), { type: 'setPassportSize', preset: 'custom', sizeMm: { w: 34.4, h: 42.3 } }, 3);
    for (const p of buildPlan(j, aspects, tenByFifteen).pages[0]?.placements ?? []) {
      expect(p.box.w / MM).toBeCloseTo(34.4, 6);
      expect(p.box.h / MM).toBeCloseTo(42.3, 6);
    }
  });

  it('a size too big for the 4×6 photo paper goes on A4 (never a blank sheet)', () => {
    const j = jobReducer(passport(), { type: 'setPassportSize', preset: 'custom', sizeMm: { w: 100, h: 100 } }, 3);
    const plan = buildPlan(j, aspects, tenByFifteen);
    expect(plan.paper.id).toBe('A4');
    expect(plan.pages[0]?.placements.length).toBeGreaterThan(0);
  });

  it('sizes outside 1.5–10 cm are refused; a preset clears the custom size', () => {
    const j = passport();
    expect(jobReducer(j, { type: 'setPassportSize', preset: 'custom', sizeMm: { w: 10, h: 45 } }, 3)).toBe(j);
    expect(jobReducer(j, { type: 'setPassportSize', preset: 'custom', sizeMm: { w: 35, h: 101 } }, 3)).toBe(j);
    const c = jobReducer(j, { type: 'setPassportSize', preset: 'custom', sizeMm: { w: 40, h: 50 } }, 3);
    const back = jobReducer(c, { type: 'setPassportSize', preset: '35x45' }, 4);
    expect(back.passport?.preset).toBe('35x45');
    expect(back.passport?.sizeMm).toBeUndefined();
  });

  it('the face fitted stays when the size changes but keeps its shape (Bigger / Smaller)', () => {
    const crop = { x: 0.1, y: 0.1, w: 0.8, h: (0.8 * 0.75) / (35 / 45) };
    const fitted = jobReducer(passport(), { type: 'setPassportCrop', crop }, 3);
    const bigger = jobReducer(
      fitted,
      { type: 'setPassportSize', preset: 'custom', sizeMm: { w: 36, h: (36 * 45) / 35 } },
      4,
    );
    expect(buildPlan(bigger, aspects).pages[0]?.placements[0]?.crop.x).toBeCloseTo(0.1, 6);
  });
});

describe('passport settings', () => {
  it('border 1½ pt by default; only the six widths; a custom size 15–100 mm or none', () => {
    expect(normalizeSettings({}).passport.border).toBe(1.5);
    expect(normalizeSettings({ passport: { border: 3 } }).passport.border).toBe(3);
    expect(normalizeSettings({ passport: { border: 4 } }).passport.border).toBe(1.5);
    expect(normalizeSettings({ passport: { custom: { wMm: 34.4, hMm: 42.3 } } }).passport.custom).toEqual({
      wMm: 34.4,
      hMm: 42.3,
    });
    expect(normalizeSettings({ passport: { custom: { wMm: 5, hMm: 42 } } }).passport.custom).toBeUndefined();
    // 'custom' only with a custom size to go with it.
    expect(normalizeSettings({ passport: { preset: 'custom' } }).passport.preset).toBe('35x45');
  });
});

describe('the face fitted, re-fitted to a slightly other shape (device finding, 2026-10-24)', () => {
  it('never comes out a hair outside the photo (the engine would refuse the print)', async () => {
    const { fitFrame } = await import('./plan');
    // A face fitted at 35 × 45 mm on a 4:3 photo, full height; then the size goes 1 mm bigger (36 × 46.3 mm).
    const shown = 4 / 3;
    const saved = { x: 0.20833333333333331, y: 0, w: 0.5833333333333334, h: 1 };
    for (const frame of [36 / 46.3, 37 / 47.6, 34 / 43.7, 35 / 45]) {
      const r = fitFrame(saved, shown, frame);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
