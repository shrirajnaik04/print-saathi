import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer } from '../job/job';
import { buildPlan, type PdfFacts } from './plan';
import { documentLine, summaryLine } from './summary';

// Round 10: each page prints in its own colour; the print is one file in colour mode with grey pages made grey.
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
const styles = (job: ReturnType<typeof doc>) =>
  buildPlan(job, new Map(), undefined, undefined, four).pages.map((p) => p.placements[0]?.style);

describe('pages in colour and black & white (round 10)', () => {
  const mixed = jobReducer(doc(), { type: 'setPageColours', marks: { '1:1': 'bw', '1:3': 'bw' } }, 3);

  it('a mixed document is one colour plan whose grey pages carry a grey style', () => {
    const plan = buildPlan(mixed, new Map(), undefined, undefined, four);
    expect(plan.colour).toBe('colour');
    expect(plan.pages.map((p) => p.placements[0]?.pdfPage)).toEqual([0, 1, 2, 3]);
    expect(styles(mixed)).toEqual(['original', 'bw', 'original', 'bw']);
  });

  it('the job style goes to the pages of its own colour', () => {
    const vibrant = jobReducer(mixed, { type: 'setStyle', style: 'vibrant' }, 4);
    // Choosing a colour style on a mixed job keeps its marks: the grey pages stay grey.
    expect(vibrant.pageColour).toEqual({ '1:1': 'bw', '1:3': 'bw' });
    expect(styles(vibrant)).toEqual(['vibrant', 'bw', 'vibrant', 'bw']);
  });

  it('a black & white style on a mixed job (Sharp Black) goes to the grey pages; the colour pages stay colour', () => {
    const sharp = jobReducer(mixed, { type: 'setStyle', style: 'sharp' }, 4);
    expect(sharp.colour).toBe('colour');
    expect(sharp.pageColour).toEqual({ '1:1': 'bw', '1:3': 'bw' });
    expect(styles(sharp)).toEqual(['original', 'sharp', 'original', 'sharp']);
  });

  it('every page grey makes it a plain black & white plan; every page colour a plain colour plan', () => {
    const allGrey = jobReducer(
      doc(),
      { type: 'setPageColours', marks: { '1:0': 'bw', '1:1': 'bw', '1:2': 'bw', '1:3': 'bw' } },
      3,
    );
    const plan = buildPlan(allGrey, new Map(), undefined, undefined, four);
    expect(plan.colour).toBe('bw');
    expect(styles(allGrey)).toEqual(['bw', 'bw', 'bw', 'bw']);
    expect(buildPlan(doc(), new Map(), undefined, undefined, four).colour).toBe('colour');
  });

  it('only the printed pages count: a grey page left out leaves a colour plan', () => {
    const job = jobReducer(
      jobReducer(doc(), { type: 'setPageColours', marks: { '1:1': 'bw' } }, 3),
      {
        type: 'setDocPages',
        pages: [
          { item: 1, page: 0 },
          { item: 1, page: 2 },
        ],
      },
      4,
    );
    const plan = buildPlan(job, new Map(), undefined, undefined, four);
    expect(plan.colour).toBe('colour');
    expect(plan.pages.map((p) => p.placements[0]?.style)).toEqual(['original', 'original']);
  });

  it('a grey page means it is no longer the customer’s own file', () => {
    expect(buildPlan(doc(), new Map(), undefined, undefined, four).exact).toEqual({ itemIndex: 1 });
    expect(buildPlan(mixed, new Map(), undefined, undefined, four).exact).toBeUndefined();
    // A mark for a page that is not printed does not change that.
    const left = jobReducer(
      jobReducer(doc(), { type: 'setPageColours', marks: { '9:0': 'bw' } }, 3),
      { type: 'setColour', colour: 'colour' },
      4,
    );
    expect(buildPlan(left, new Map(), undefined, undefined, four).exact).toEqual({ itemIndex: 1 });
  });

  it('photos get a colour each, wherever they land', () => {
    const photos = jobFromIntake('p', intake(['jpeg', 'jpeg', 'jpeg']), 1);
    const job = jobReducer(photos, { type: 'setPageColours', marks: { '2:0': 'bw' } }, 2);
    const plan = buildPlan(
      job,
      new Map([
        [1, 1.5],
        [2, 1.5],
        [3, 1.5],
      ]),
    );
    expect(plan.colour).toBe('colour');
    const byItem = Object.fromEntries(plan.pages.flatMap((p) => p.placements.map((x) => [x.itemIndex, x.style])));
    expect(byItem).toEqual({ 1: 'original', 2: 'bw', 3: 'original' });
  });

  it('the summary counts the pages of each colour, in the shopkeeper’s words', () => {
    const plan = buildPlan(mixed, new Map(), undefined, undefined, four);
    expect(documentLine(plan, new Set([1]))).toBe('1 PDF · 4 pages · A4 · 2 colour, 2 black & white · 1 copy');
    expect(summaryLine(plan)).toBe('1 photo · 4 pages · A4 · 2 colour, 2 black & white · 1 copy');
    // Unchanged for jobs without marks.
    expect(documentLine(buildPlan(doc(), new Map(), undefined, undefined, four), new Set([1]))).toBe(
      '1 PDF · 4 pages · A4 · Colour · 1 copy',
    );
  });
});
