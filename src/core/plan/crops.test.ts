import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer, normalizeJob } from '../job/job';
import { shownOf } from '../layout/crop';
import { buildPlan } from './plan';

// Phase 9 (PLAN §F1, §F5, §J6): crops are kept on the photo as stored (upright) and printed on the photo as shown.
const intake = (types: string[]) =>
  ({
    intakeId: 'in1',
    rejected: 0,
    refusedByPolicy: 0,
    files: types.map((t, i) => ({ index: i + 1, path: `/p/${i + 1}`, sniffedType: t, bytes: 1, sha256: `h${i}` })),
  }) as never;
const aspects = new Map([
  [1, 1.5],
  [2, 0.75],
]);
const photos = () =>
  jobReducer(jobFromIntake('c', intake(['jpeg', 'jpeg']), 1), { type: 'setLayout', layout: 'onePerPage' }, 2);
const first = (plan: ReturnType<typeof buildPlan>) => plan.pages[0]?.placements[0];
const boxAspect = (plan: ReturnType<typeof buildPlan>) => {
  const b = first(plan)?.box;
  return b ? b.w / b.h : 0;
};
const bars = { x: 0, y: 0.1, w: 1, h: 0.8 }; // black bars top and bottom

describe('crops (smart and manual)', () => {
  it('maps an upright crop to the photo as shown, the inverse of the native mapping (CropTest)', () => {
    // Native: shown (0.1, 0.2, 0.3, 0.4) turned once is upright (0.2, 0.6, 0.4, 0.3).
    const s1 = shownOf({ x: 0.2, y: 0.6, w: 0.4, h: 0.3 }, 1);
    for (const [k, v] of Object.entries({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })) expect(s1[k as 'x'], k).toBeCloseTo(v, 12);
    for (const t of [0, 1, 2, 3] as const) {
      const s = shownOf(bars, t);
      expect(s.w * s.h).toBeCloseTo(0.8, 10);
    }
  });

  it('suggestions change nothing until the shopkeeper says "Remove black edges"', () => {
    const suggested = jobReducer(photos(), { type: 'setSuggestions', crops: { 1: bars } }, 3);
    expect(first(buildPlan(suggested, aspects))?.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    const removed = jobReducer(suggested, { type: 'answerEdges', remove: true }, 4);
    expect(removed.edges).toBe('removed');
    const plan = buildPlan(removed, aspects);
    expect(first(plan)?.crop).toEqual(bars);
    // Laid out with the cut shape: 1.5 × (1 / 0.8) wide.
    expect(boxAspect(plan)).toBeCloseTo(1.5 / 0.8, 3);
    const kept = jobReducer(suggested, { type: 'answerEdges', remove: false }, 4);
    expect(kept.edges).toBe('kept');
    expect(first(buildPlan(kept, aspects))?.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('a hand-made crop wins over a suggestion, Reset goes back to the whole photo, and a crop survives Turn', () => {
    let job = jobReducer(photos(), { type: 'setSuggestions', crops: { 1: bars } }, 3);
    job = jobReducer(job, { type: 'setCrop', item: 1, crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } }, 4);
    job = jobReducer(job, { type: 'answerEdges', remove: true }, 5);
    expect(first(buildPlan(job, aspects))?.crop).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    const turned = jobReducer(job, { type: 'turnItem', index: 1 }, 6);
    expect(first(buildPlan(turned, aspects))?.crop).toEqual(shownOf({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 1));
    const reset = jobReducer(job, { type: 'setCrop', item: 1, crop: null }, 7);
    expect(first(buildPlan(reset, aspects))?.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('photos printed as a document use their crops too; passport keeps its own frame', () => {
    let doc = jobReducer(jobFromIntake('d', intake(['jpeg']), 1), { type: 'setDocument' }, 2);
    doc = jobReducer(doc, { type: 'setCrop', item: 1, crop: bars }, 3);
    expect(first(buildPlan(doc, aspects))?.crop).toEqual(bars);
    let passport = jobReducer(jobFromIntake('p', intake(['jpeg']), 1), { type: 'setCrop', item: 1, crop: bars }, 2);
    passport = jobReducer(passport, { type: 'setPassport', item: 1 }, 3);
    expect(first(buildPlan(passport, aspects))?.crop).not.toEqual(bars);
  });

  it('crops that are not inside the photo, or for files not in the job, are not kept', () => {
    const job = normalizeJob({
      ...photos(),
      crops: { 1: { x: 0.5, y: 0, w: 0.8, h: 1 }, 2: bars, 9: bars },
      suggested: { 1: bars, 9: bars },
    });
    expect(job?.crops).toEqual({ 2: bars });
    expect(job?.suggested).toEqual({ 1: bars });
    expect(
      jobReducer(photos(), { type: 'setCrop', item: 1, crop: { x: 0, y: 0, w: 0, h: 1 } }, 3).crops,
    ).toBeUndefined();
  });

  it('an answered question never gets suggestions again (a late save, re-review m-2)', () => {
    const kept = jobReducer(
      jobReducer(photos(), { type: 'setSuggestions', crops: { 1: bars } }, 3),
      { type: 'answerEdges', remove: false },
      4,
    );
    expect(jobReducer(kept, { type: 'setSuggestions', crops: { 2: bars } }, 5)).toBe(kept);
  });
});
