import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type JobLayout, jobFromIntake, jobReducer } from '../job/job';
import { buildPlan } from './plan';

// Owner, round 8: "keep at least this much space between images … when we import images" — about 1 cm all round.
const MM = 72 / 25.4;
const jobOf = (n: number, layout: JobLayout) => {
  const files = Array.from({ length: n }, (_, i) => ({
    index: i + 1,
    path: `/p/${i + 1}.jpg`,
    sniffedType: 'jpeg',
    bytes: 1,
    sha256: `s${i}`,
  }));
  const job = jobFromIntake('g', { intakeId: 'g', rejected: 0, refusedByPolicy: 0, files } as never, 1);
  return jobReducer(job, { type: 'setLayout', layout }, 2);
};
/** The space between two boxes: across if they share rows, down if they share columns (pt); 0 when they touch. */
const apart = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.max(dx, dy);
};

describe('photos 10 mm apart (owner, round 8)', () => {
  for (const layout of ['allOnOne', 'morePages', 'onePerPage'] as const)
    it(`${layout}: every two photos on a page are at least 10 mm apart`, () => {
      fc.assert(
        fc.property(fc.array(fc.double({ min: 0.4, max: 2.5, noNaN: true }), { minLength: 2, maxLength: 12 }), (as) => {
          const aspects = new Map(as.map((a, i) => [i + 1, a]));
          const plan = buildPlan(jobOf(as.length, layout), aspects);
          for (const page of plan.pages)
            for (const [i, a] of page.placements.entries())
              for (const b of page.placements.slice(i + 1))
                expect(apart(a.box, b.box)).toBeGreaterThanOrEqual(10 * MM - 0.01);
        }),
        { numRuns: 60 },
      );
    });
  it('passport photos stay 2 mm apart (for cutting)', () => {
    const job = jobReducer(jobOf(1, 'onePerPage'), { type: 'setPassport', item: 1, count: 6 }, 3);
    const p = buildPlan(job, new Map([[1, 0.78]])).pages[0]?.placements ?? [];
    const gaps = p.flatMap((a, i) => p.slice(i + 1).map((b) => apart(a.box, b.box))).filter((g) => g > 0);
    expect(Math.min(...gaps) / MM).toBeCloseTo(2, 1);
  });
});
