import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer } from '../job/job';
import { buildPlan } from './plan';

// Round 12 (owner: "one on each page: why not centred?"): a photo alone on its page is in the middle of the page, the
// page's own way up, whatever its shape and whether or not its size was chosen.
const MM = 72 / 25.4;
const files = [1, 2, 3].map((index) => ({
  index,
  path: `/p/${index}.jpg`,
  sniffedType: 'jpeg',
  bytes: 1,
  sha256: `s${index}`,
}));
const intake = { intakeId: 'in1', rejected: 0, refusedByPolicy: 0, files } as never;
const aspects = new Map([
  [1, 0.5],
  [2, 2.2],
  [3, 1],
]);
const base = jobReducer(jobFromIntake('job1', intake, 1), { type: 'setLayout', layout: 'onePerPage' }, 2);

const centred = (plan: ReturnType<typeof buildPlan>) => {
  for (const pg of plan.pages) {
    const b = pg.placements[0]?.box as { x: number; y: number; w: number; h: number };
    const [w, h] = pg.orientation === 'landscape' ? [plan.paper.hPt, plan.paper.wPt] : [plan.paper.wPt, plan.paper.hPt];
    expect(b.x + b.w / 2).toBeCloseTo(w / 2, 4);
    expect(b.y + b.h / 2).toBeCloseTo(h / 2, 4);
  }
};

describe('one on each page is centred (round 12)', () => {
  it('tall, wide and square photos, on A4 portrait', () => {
    const plan = buildPlan(base, aspects);
    expect(plan.pages).toHaveLength(3);
    centred(plan);
  });

  it('on sideways pages', () => {
    centred(buildPlan(jobReducer(base, { type: 'setDirection', direction: 'landscape' }, 3), aspects));
  });

  it('at a size the shopkeeper chose (Smaller), the photo keeps its middle', () => {
    const j = jobReducer(base, { type: 'setSizes', sizes: { 1: 80, 2: 60, 3: 50 } }, 3);
    const plan = buildPlan(j, aspects);
    expect(plan.pages[2]?.placements[0]?.box.w).toBeCloseTo(50 * MM, 4);
    centred(plan);
  });
});
