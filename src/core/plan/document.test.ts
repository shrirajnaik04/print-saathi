import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer } from '../job/job';
import { splitParts } from './parts';
import { buildPlan, type PdfFacts } from './plan';

const MM = 72 / 25.4;
const intake = (types: string[]) =>
  ({
    intakeId: 'in1',
    rejected: 0,
    refusedByPolicy: 0,
    files: types.map((t, i) => ({ index: i + 1, path: `/p/${i + 1}`, sniffedType: t, bytes: 1, sha256: `h${i}` })),
  }) as never;
const A4P: [number, number] = [595, 841];
const A4L: [number, number] = [841, 595];
const facts = (sizes: [number, number][], extra: Partial<PdfFacts> = {}): PdfFacts => ({
  pages: sizes.length,
  sizes,
  forms: false,
  locked: false,
  ...extra,
});
const docJob = (types: string[]) => jobReducer(jobFromIntake('d', intake(types), 1), { type: 'setDocument' }, 2);

const allThree = [
  { item: 1, page: 0 },
  { item: 1, page: 1 },
  { item: 1, page: 2 },
];

describe('document plans (PLAN §G4, §J5)', () => {
  const three = new Map([[1, facts([A4P, A4P, A4P])]]);

  it('a document starts in colour (owner, round 3) and prints every page of every file in order', () => {
    const job = docJob(['pdf']);
    expect(job.layout).toBe('document');
    expect(job.colour).toBe('colour');
    const plan = buildPlan(job, new Map(), undefined, undefined, three);
    expect(plan.contentType).toBe('document');
    expect(plan.pages.map((p) => p.placements[0]?.pdfPage)).toEqual([0, 1, 2]);
  });

  it('the untouched path: one unlocked PDF, every page in order, Colour, 1 copy', () => {
    const job = jobReducer(docJob(['pdf']), { type: 'setColour', colour: 'colour' }, 3);
    const plan = buildPlan(job, new Map(), undefined, undefined, three);
    expect(plan.exact).toEqual({ itemIndex: 1 });
    expect(splitParts(plan)).toEqual([plan]);
  });

  it('anything changed means the processed path (never a customer file that differs from the preview)', () => {
    const colour = jobReducer(docJob(['pdf']), { type: 'setColour', colour: 'colour' }, 3);
    const cases = [
      ['black & white', jobReducer(docJob(['pdf']), { type: 'setColour', colour: 'bw' }, 3), three],
      ['2 copies', jobReducer(colour, { type: 'setCopies', copies: 2 }, 4), three],
      [
        'a page left out',
        jobReducer(
          colour,
          {
            type: 'setDocPages',
            pages: [
              { item: 1, page: 0 },
              { item: 1, page: 2 },
            ],
          },
          4,
        ),
        three,
      ],
      ['pages reordered', jobReducer(colour, { type: 'moveDocPage', at: 0, by: 1, shown: allThree }, 4), three],
      ['a page turned', jobReducer(colour, { type: 'turnDocPage', item: 1, page: 1 }, 4), three],
      ['locked', colour, new Map([[1, facts([A4P, A4P, A4P], { locked: true })]])],
      // Review C1: a PDF opened with its password (or the app's unlocked copy) is never the customer's own file.
      ['opened with a password', colour, new Map([[1, facts([A4P, A4P, A4P], { unlocked: true })]])],
    ] as const;
    for (const [why, job, docs] of cases)
      expect(buildPlan(job, new Map(), undefined, undefined, docs).exact, why).toBeUndefined();
    const two = jobReducer(
      jobReducer(jobFromIntake('d', intake(['pdf', 'pdf']), 1), { type: 'setDocument' }, 2),
      { type: 'setColour', colour: 'colour' },
      3,
    );
    const docs2 = new Map([
      [1, facts([A4P])],
      [2, facts([A4P])],
    ]);
    expect(buildPlan(two, new Map(), undefined, undefined, docs2).exact, 'two PDFs').toBeUndefined();
  });

  it('a selection prints those pages in that order, with copies collated by the plan', () => {
    let job = jobReducer(
      docJob(['pdf']),
      {
        type: 'setDocPages',
        pages: [
          { item: 1, page: 2 },
          { item: 1, page: 0 },
        ],
      },
      3,
    );
    job = jobReducer(job, { type: 'setCopies', copies: 2 }, 4);
    const plan = buildPlan(job, new Map(), undefined, undefined, three);
    expect(plan.pages.map((p) => p.placements[0]?.pdfPage)).toEqual([2, 0]);
    expect(plan.copies).toBe(2);
  });

  // Spec Part 4: upright paper unless Landscape is chosen; a wide page is fitted across it (review, 2026-10-24).
  it('a page fits upright A4 inside 6 mm edges, keeping its shape (a wide page fitted across it)', () => {
    // The processed path (black & white): a colour PDF printed as it is keeps its own pages.
    const job = jobReducer(docJob(['pdf']), { type: 'setColour', colour: 'bw' }, 3);
    const plan = buildPlan(job, new Map(), undefined, undefined, new Map([[1, facts([A4P, A4L, [72, 72]])]]));
    for (const [i, [w, h]] of ([A4P, A4L, [72, 72]] as [number, number][]).entries()) {
      const page = plan.pages[i];
      const box = page?.placements[0]?.box ?? { x: 0, y: 0, w: 0, h: 0 };
      expect(page?.orientation).toBe('portrait');
      expect(box.w / box.h).toBeCloseTo(w / h, 6);
      expect(box.x / MM).toBeGreaterThanOrEqual(6 - 1e-6);
      expect(box.y / MM).toBeGreaterThanOrEqual(6 - 1e-6);
    }
  });

  it('a turned page prints turned, fitted on the upright paper (Landscape lays it sideways)', () => {
    const job = jobReducer(docJob(['pdf']), { type: 'turnDocPage', item: 1, page: 0 }, 3);
    const plan = buildPlan(job, new Map(), undefined, undefined, new Map([[1, facts([A4P])]]));
    expect(plan.pages[0]?.orientation).toBe('portrait');
    const box = plan.pages[0]?.placements[0]?.box ?? { x: 0, y: 0, w: 0, h: 0 };
    expect(box.w).toBeGreaterThan(box.h);
    expect(plan.pages[0]?.placements[0]?.turns).toBe(1);
    const sideways = jobReducer(job, { type: 'setDirection', direction: 'landscape' }, 4);
    expect(
      buildPlan(sideways, new Map(), undefined, undefined, new Map([[1, facts([A4P])]])).pages[0]?.orientation,
    ).toBe('landscape');
  });

  it("the customer's own PDF sent untouched is shown as it is in the file (it prints as it came: a wide page stays wide)", () => {
    const colour = jobReducer(docJob(['pdf']), { type: 'setColour', colour: 'colour' }, 3);
    const plan = buildPlan(colour, new Map(), undefined, undefined, new Map([[1, facts([A4P, A4L])]]));
    expect(plan.exact).toEqual({ itemIndex: 1 });
    expect(plan.pages.map((p) => p.orientation)).toEqual(['portrait', 'landscape']);
  });

  it("a direction chosen for the customer's own PDF leaves the untouched path: the pages go on the chosen paper", () => {
    const colour = jobReducer(docJob(['pdf']), { type: 'setColour', colour: 'colour' }, 3);
    for (const direction of ['portrait', 'landscape'] as const) {
      const plan = buildPlan(
        jobReducer(colour, { type: 'setDirection', direction }, 4),
        new Map(),
        undefined,
        undefined,
        three,
      );
      expect(plan.exact, direction).toBeUndefined();
      expect(plan.pages.every((p) => p.orientation === direction)).toBe(true);
    }
  });

  it('photos sent with PDFs print as pages in received order', () => {
    const job = docJob(['jpeg', 'pdf']);
    const plan = buildPlan(job, new Map([[1, 0.75]]), undefined, undefined, new Map([[2, facts([A4P, A4P])]]));
    expect(plan.pages.map((p) => [p.placements[0]?.itemIndex, p.placements[0]?.pdfPage])).toEqual([
      [1, undefined],
      [2, 0],
      [2, 1],
    ]);
  });

  it('a PDF not read yet, locked or damaged leaves its pages out until it can be read', () => {
    const job = docJob(['pdf', 'pdf']);
    const plan = buildPlan(job, new Map(), undefined, undefined, new Map([[2, facts([A4P])]]));
    expect(plan.pages.map((p) => p.placements[0]?.itemIndex)).toEqual([2]);
  });

  it('choosing document again keeps the colour the shopkeeper chose', () => {
    const job = jobReducer(docJob(['pdf']), { type: 'setColour', colour: 'colour' }, 3);
    const back = jobReducer(
      jobReducer(job, { type: 'setLayout', layout: 'onePerPage' }, 4),
      { type: 'setDocument' },
      5,
    );
    expect(back.colour).toBe('colour');
  });

  it('moving and turning pages', () => {
    let job = jobReducer(
      docJob(['pdf']),
      {
        type: 'setDocPages',
        pages: [
          { item: 1, page: 0 },
          { item: 1, page: 1 },
          { item: 1, page: 2 },
        ],
      },
      3,
    );
    job = jobReducer(job, { type: 'moveDocPage', at: 2, by: -1, shown: [] }, 4);
    expect(job.docPages).toEqual([
      { item: 1, page: 0 },
      { item: 1, page: 2 },
      { item: 1, page: 1 },
    ]);
    expect(jobReducer(job, { type: 'moveDocPage', at: 0, by: -1, shown: [] }, 5)).toBe(job);
    const t = jobReducer(
      jobReducer(job, { type: 'turnDocPage', item: 1, page: 2 }, 5),
      { type: 'turnDocPage', item: 1, page: 2 },
      6,
    );
    expect(t.docTurns?.['1:2']).toBe(2);
  });

  it('Turn on a photo page of a document turns that photo in the print', () => {
    const job = docJob(['jpeg', 'pdf']);
    const turned = jobReducer(job, { type: 'turnDocPage', item: 1, page: 0 }, 3);
    const plan = buildPlan(turned, new Map([[1, 0.75]]), undefined, undefined, new Map([[2, facts([A4P])]]));
    expect(plan.pages[0]?.placements[0]?.turns).toBe(1);
  });
});
