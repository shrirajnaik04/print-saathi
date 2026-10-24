import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer, normalizeJob } from '../job/job';
import { buildPlan, type PdfFacts } from './plan';

// Phase 8 (PLAN §F4, §J7): a print style applies to the whole job and goes with Colour or Black & white.
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
const photos = () => jobFromIntake('s', intake(['jpeg', 'jpeg']), 1);
const styles = (plan: ReturnType<typeof buildPlan>) => [
  ...new Set(plan.pages.flatMap((p) => p.placements.map((x) => x.style))),
];

describe('print styles in the job and the plan', () => {
  it('a Black & white style sets Black & white; the plan carries it', () => {
    const job = jobReducer(photos(), { type: 'setStyle', style: 'sharp' }, 2);
    expect(job.colour).toBe('bw');
    const plan = buildPlan(job, aspects);
    expect(plan.colour).toBe('bw');
    expect(styles(plan)).toEqual(['sharp']);
  });

  it('a colour style sets Colour', () => {
    const bw = jobReducer(photos(), { type: 'setColour', colour: 'bw' }, 2);
    const job = jobReducer(bw, { type: 'setStyle', style: 'vibrant' }, 3);
    expect(job.colour).toBe('colour');
    expect(styles(buildPlan(job, aspects))).toEqual(['vibrant']);
  });

  it('choosing Colour or Black & white again goes back to the plain one, never "Vibrant in grey" (review focus 3)', () => {
    const sharp = jobReducer(photos(), { type: 'setStyle', style: 'sharp' }, 2);
    const colour = jobReducer(sharp, { type: 'setColour', colour: 'colour' }, 3);
    expect(styles(buildPlan(colour, aspects))).toEqual(['original']);
    const vibrant = jobReducer(photos(), { type: 'setStyle', style: 'vibrant' }, 2);
    const bw = jobReducer(vibrant, { type: 'setColour', colour: 'bw' }, 3);
    expect(styles(buildPlan(bw, aspects))).toEqual(['bw']);
  });

  it('a job from before Phase 8 prints as before: Original in colour, Black & White in grey', () => {
    expect(styles(buildPlan(photos(), aspects))).toEqual(['original']);
    expect(styles(buildPlan(jobReducer(photos(), { type: 'setColour', colour: 'bw' }, 2), aspects))).toEqual(['bw']);
    // A saved style that does not fit the colour (hand-edited, older build) is not trusted.
    const odd = normalizeJob({ ...photos(), colour: 'colour', style: 'sharp' });
    expect(odd && styles(buildPlan(odd, aspects))).toEqual(['original']);
    const unknown = normalizeJob({ ...photos(), style: 'sepia' });
    expect(unknown?.style).toBeUndefined();
  });

  it('passport photos are never styled (PLAN §U: nothing changed except crop and scale)', () => {
    const passport = jobReducer(photos(), { type: 'setPassport', item: 1 }, 2);
    expect(jobReducer(passport, { type: 'setStyle', style: 'vibrant' }, 3)).toBe(passport);
    expect(styles(buildPlan(passport, aspects))).toEqual(['original']);
    const bw = jobReducer(passport, { type: 'setColour', colour: 'bw' }, 3);
    expect(styles(buildPlan(bw, aspects))).toEqual(['bw']);
  });

  it("a styled PDF is drawn, never the customer's untouched file (PLAN §G4)", () => {
    const docs = new Map<number, PdfFacts>([
      [
        1,
        {
          pages: 1,
          sizes: [[595, 841]],
          forms: false,
          locked: false,
        },
      ],
    ]);
    let job = jobReducer(jobFromIntake('d', intake(['pdf']), 1), { type: 'setDocument' }, 2);
    job = jobReducer(job, { type: 'setColour', colour: 'colour' }, 3);
    expect(buildPlan(job, new Map(), undefined, undefined, docs).exact).toEqual({ itemIndex: 1 });
    const soft = jobReducer(job, { type: 'setStyle', style: 'soft' }, 4);
    const plan = buildPlan(soft, new Map(), undefined, undefined, docs);
    expect(plan.exact).toBeUndefined();
    expect(styles(plan)).toEqual(['soft']);
  });
});
