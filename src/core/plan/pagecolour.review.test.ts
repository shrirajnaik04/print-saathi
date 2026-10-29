import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer } from '../job/job';
import { buildPlan, type PdfFacts } from './plan';
import { documentLine, summaryLine } from './summary';

// Round 10, the whole-round review: the plan and its words when marks and layouts meet.
const intake = (types: string[]) =>
  ({
    intakeId: 'in1',
    rejected: 0,
    refusedByPolicy: 0,
    files: types.map((t, i) => ({ index: i + 1, path: `/p/${i + 1}`, sniffedType: t, bytes: 1, sha256: `h${i}` })),
  }) as never;
const A4P: [number, number] = [595, 841];
const facts = (n: number): PdfFacts => ({ pages: n, sizes: Array(n).fill(A4P), forms: false, locked: false });
const four = new Map([[1, facts(4)]]);
const doc = () => jobReducer(jobFromIntake('d', intake(['pdf']), 1), { type: 'setDocument' }, 2);
const photos = (n: number) => jobFromIntake('p', intake(Array(n).fill('jpeg')), 1);
const aspects = (n: number) => new Map(Array.from({ length: n }, (_, i) => [i + 1, 1.5] as [number, number]));

describe('review fixes: the plan and the words (I4, I5, M3)', () => {
  it('every page set to colour on a black & white job is the customer’s own file again', () => {
    const grey = jobReducer(doc(), { type: 'setColour', colour: 'bw' }, 3);
    const all = jobReducer(
      grey,
      { type: 'setPageColours', marks: { '1:0': 'colour', '1:1': 'colour', '1:2': 'colour', '1:3': 'colour' } },
      4,
    );
    const plan = buildPlan(all, new Map(), undefined, undefined, four);
    expect(plan.colour).toBe('colour');
    expect(plan.exact).toEqual({ itemIndex: 1 });
  });

  it('a page with photos of both colours says so in the summary, never plain Colour', () => {
    const marked = jobReducer(photos(3), { type: 'setPageColours', marks: { '2:0': 'bw' } }, 2);
    const one = jobReducer(marked, { type: 'setLayout', layout: 'allOnOne' }, 3);
    const plan = buildPlan(one, aspects(3));
    expect(plan.pages).toHaveLength(1);
    expect(plan.colour).toBe('colour');
    expect(summaryLine(plan)).toBe('3 photos · 1 page · A4 · 1 with both · 1 copy');
  });

  it('pages of each kind and a page with both are all counted', () => {
    const marked = jobReducer(photos(4), { type: 'setPageColours', marks: { '2:0': 'bw' } }, 2);
    const more = jobReducer(
      jobReducer(marked, { type: 'setLayout', layout: 'morePages' }, 3),
      { type: 'setPages', pages: 2 },
      4,
    );
    const plan = buildPlan(more, aspects(4));
    expect(plan.pages).toHaveLength(2);
    expect(summaryLine(plan)).toBe('4 photos · 2 pages · A4 · 1 colour, 1 with both · 1 copy');
  });

  it('with Sharp Black on the grey pages a mix says how many of each, nothing more', () => {
    const marked = jobReducer(doc(), { type: 'setPageColours', marks: { '1:1': 'bw' } }, 3);
    const job = jobReducer(marked, { type: 'setStyle', style: 'sharp' }, 4);
    const plan = buildPlan(job, new Map(), undefined, undefined, four);
    expect(documentLine(plan, new Set([1]))).toBe('1 PDF · 4 pages · A4 · 3 colour, 1 black & white · 1 copy');
    expect(plan.pages.map((p) => p.placements[0]?.style)).toEqual(['original', 'sharp', 'original', 'original']);
  });
});
