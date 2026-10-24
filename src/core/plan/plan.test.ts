import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer } from '../job/job';
import { buildPlan, paperOf, planHash } from './plan';

const intake = {
  intakeId: 'in1',
  rejected: 0,
  refusedByPolicy: 0,
  files: [
    { index: 1, path: '/p/1.jpg', sniffedType: 'jpeg', bytes: 1, sha256: 'a' },
    { index: 2, path: '/p/2.jpg', sniffedType: 'jpeg', bytes: 1, sha256: 'b' },
    { index: 3, path: '/p/3.pdf', sniffedType: 'pdf', bytes: 1, sha256: 'c' },
  ],
} as never;
const aspects = new Map([
  [1, 0.75],
  [2, 1.5],
]);

describe('buildPlan (PLAN §G1 PrintPlan v1)', () => {
  const job = jobFromIntake('job1', intake, 1);

  it('one page per photo, carrying the job revision it was built from', () => {
    const plan = buildPlan(job, aspects);
    expect(plan.v).toBe(1);
    expect(plan.rev).toBe(1);
    // Upright paper for every page unless the shopkeeper chooses sideways (owner, 2026-10-23; direction.test).
    expect(plan.pages.map((p) => p.orientation)).toEqual(['portrait', 'portrait']);
    expect(plan.pages.flatMap((p) => p.placements.map((x) => x.itemIndex))).toEqual([1, 2]);
    // Sent as a document (the printer's normal-speed mode) unless Best photo quality is chosen (quality.test).
    expect(plan.contentType).toBe('document');
  });

  it('skips items that are not photos or have no known shape (they cannot be placed yet)', () => {
    expect(buildPlan(job, new Map([[1, 0.75]])).pages).toHaveLength(1);
  });

  it('uses the whole photo, upright, original style', () => {
    const p = buildPlan(job, aspects).pages[0]!.placements[0]!;
    expect(p.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(p.turns).toBe(0);
    expect(p.style).toBe('original');
  });
});

describe('buildPlan follows the job choices (PLAN §J1–J3, §I-8)', () => {
  const six = {
    intakeId: 'in6',
    rejected: 0,
    refusedByPolicy: 0,
    files: Array.from({ length: 6 }, (_, i) => ({
      index: i + 1,
      path: `/p/${i + 1}.jpg`,
      sniffedType: 'jpeg',
      bytes: 1,
      sha256: `h${i}`,
    })),
  } as never;
  const sixAspects = new Map(Array.from({ length: 6 }, (_, i) => [i + 1, 0.75] as [number, number]));
  const base = jobFromIntake('j6', six, 1);
  const order = (plan: ReturnType<typeof buildPlan>) => plan.pages.flatMap((p) => p.placements.map((x) => x.itemIndex));

  it('all on one page puts every photo on one sheet, in the print order', () => {
    const j = jobReducer(
      jobReducer(base, { type: 'setLayout', layout: 'allOnOne' }, 2),
      { type: 'moveItem', index: 3, by: -1 },
      3,
    );
    const plan = buildPlan(j, sixAspects);
    expect(plan.pages).toHaveLength(1);
    expect(order(plan)).toEqual([1, 3, 2, 4, 5, 6]);
  });

  it('use more pages: exactly the chosen count, or Best', () => {
    const more = jobReducer(base, { type: 'setLayout', layout: 'morePages' }, 2);
    expect(buildPlan(jobReducer(more, { type: 'setPages', pages: 3 }, 3), sixAspects).pages).toHaveLength(3);
    expect(buildPlan(more, sixAspects).pages).toHaveLength(1); // Best: 6 phone photos fit on one page at >= 4 cm
  });

  it('a turned photo is laid out turned (its shape swaps) and carries the turn to the printer', () => {
    const j = jobReducer(base, { type: 'turnItem', index: 1 }, 2);
    const p = buildPlan(j, sixAspects).pages[0]!;
    const placed = p.placements[0]!;
    expect(placed.turns).toBe(1);
    expect(placed.box.w / placed.box.h).toBeCloseTo(4 / 3, 6);
    expect(p.orientation).toBe('portrait'); // the paper stays upright; Landscape is the shopkeeper's choice
  });

  it('reordering or turning changes the plan hash (the old print file is never reused)', () => {
    const h = planHash(buildPlan(base, sixAspects));
    expect(planHash(buildPlan(jobReducer(base, { type: 'moveItem', index: 2, by: 1 }, 2), sixAspects))).not.toBe(h);
    expect(planHash(buildPlan(jobReducer(base, { type: 'turnItem', index: 2 }, 2), sixAspects))).not.toBe(h);
  });
});

describe('planHash', () => {
  const job = jobFromIntake('job1', intake, 1);
  it('is stable for the same plan and changes when a choice changes', () => {
    const a = planHash(buildPlan(job, aspects));
    expect(planHash(buildPlan(job, aspects))).toBe(a);
    expect(planHash(buildPlan(jobReducer(job, { type: 'setCopies', copies: 2 }, 2), aspects))).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });
});

// The native renderer parses this exact file (RenderPlanContractTest). It must be what buildPlan makes today, so a
// change on either side of the bridge breaks a test instead of a print. Refresh with UPDATE_CONTRACT=1 npm test.
describe('PrintPlan contract with the native renderer', () => {
  const fixture = path.resolve('android/app/src/test/resources/plan-v1-sample.json');
  it('the shared sample plan is what buildPlan makes today', () => {
    const job = jobReducer(jobFromIntake('job1', intake, 1), { type: 'setCopies', copies: 2 }, 2);
    const json = `${JSON.stringify({ planHash: planHash(buildPlan(job, aspects)), plan: buildPlan(job, aspects) }, null, 2)}\n`;
    if (process.env.UPDATE_CONTRACT) writeFileSync(fixture, json);
    expect(readFileSync(fixture, 'utf8')).toBe(json);
  });

  it('the shared black & white plan is what buildPlan makes today', () => {
    const bwFixture = path.resolve('android/app/src/test/resources/plan-v1-bw.json');
    const job = jobReducer(jobFromIntake('job3', intake, 1), { type: 'setColour', colour: 'bw' }, 2);
    const plan = buildPlan(job, aspects);
    const json = `${JSON.stringify({ planHash: planHash(plan), plan }, null, 2)}
`;
    if (process.env.UPDATE_CONTRACT) writeFileSync(bwFixture, json);
    expect(readFileSync(bwFixture, 'utf8')).toBe(json);
  });

  it('the shared all-on-one plan with a turned photo is what buildPlan makes today', () => {
    const turnedFixture = path.resolve('android/app/src/test/resources/plan-v1-turned.json');
    let job = jobFromIntake('job2', intake, 1);
    job = jobReducer(job, { type: 'setLayout', layout: 'allOnOne' }, 2);
    job = jobReducer(job, { type: 'turnItem', index: 2 }, 3);
    const plan = buildPlan(job, aspects);
    const json = `${JSON.stringify({ planHash: planHash(plan), plan }, null, 2)}
`;
    if (process.env.UPDATE_CONTRACT) writeFileSync(turnedFixture, json);
    expect(readFileSync(turnedFixture, 'utf8')).toBe(json);
  });
});

describe('PrintPlan contract: documents', () => {
  const pdfIntake = {
    intakeId: 'in5',
    rejected: 0,
    refusedByPolicy: 0,
    files: [{ index: 1, path: '/p/1.pdf', sniffedType: 'pdf', bytes: 1, sha256: 'd' }],
  } as never;
  const docs = new Map([
    [
      1,
      {
        pages: 3,
        sizes: [
          [595, 841],
          [841, 595],
          [595, 841],
        ] as [number, number][],
        forms: false,
        locked: false,
      },
    ],
  ]);
  const write = (name: string, plan: ReturnType<typeof buildPlan>) => {
    const fixture = path.resolve(`android/app/src/test/resources/${name}`);
    const json = `${JSON.stringify({ planHash: planHash(plan), plan }, null, 2)}
`;
    if (process.env.UPDATE_CONTRACT) writeFileSync(fixture, json);
    expect(readFileSync(fixture, 'utf8')).toBe(json);
  };
  // Pages go sideways only when Landscape is chosen (spec Part 4), so the fixture chooses it to keep a sideways page.
  it('the shared black & white document plan (pages 3 and 1, Landscape chosen, 2 copies) is what buildPlan makes', () => {
    let job = jobReducer(jobFromIntake('job5', pdfIntake, 1), { type: 'setDocument' }, 2);
    job = jobReducer(
      job,
      {
        type: 'setDocPages',
        pages: [
          { item: 1, page: 2 },
          { item: 1, page: 1 },
          { item: 1, page: 0 },
        ],
      },
      3,
    );
    job = jobReducer(job, { type: 'setCopies', copies: 2 }, 4);
    job = jobReducer(job, { type: 'setDirection', direction: 'landscape' }, 5);
    write('plan-v1-document.json', buildPlan(job, new Map(), undefined, undefined, docs));
  });
  it('the shared untouched plan is what buildPlan makes', () => {
    let job = jobReducer(jobFromIntake('job6', pdfIntake, 1), { type: 'setDocument' }, 2);
    job = jobReducer(job, { type: 'setColour', colour: 'colour' }, 3);
    write('plan-v1-exact.json', buildPlan(job, new Map(), undefined, undefined, docs));
  });
});

describe('PrintPlan contract: print styles (Phase 8)', () => {
  it('the shared OCV Black plan is what buildPlan makes today', () => {
    const fixture = path.resolve('android/app/src/test/resources/plan-v1-styles.json');
    const job = jobReducer(jobFromIntake('job7', intake, 1), { type: 'setStyle', style: 'ocv' }, 2);
    const plan = buildPlan(job, aspects);
    const json = `${JSON.stringify({ planHash: planHash(plan), plan }, null, 2)}
`;
    if (process.env.UPDATE_CONTRACT) writeFileSync(fixture, json);
    expect(readFileSync(fixture, 'utf8')).toBe(json);
  });
});

describe('PrintPlan contract: sizes chosen on Adjust', () => {
  it('the shared arranged plan (three photos at their own sizes, spilling onto page 2) is what buildPlan makes', () => {
    const fixture = path.resolve('android/app/src/test/resources/plan-v1-arranged.json');
    const three = new Map([
      [1, 0.75],
      [2, 1.5],
    ]);
    const all = jobReducer(jobFromIntake('job5', intake, 1), { type: 'setLayout', layout: 'allOnOne' }, 2);
    const job = jobReducer(all, { type: 'setSizes', sizes: { 1: 200, 2: 150 } }, 3);
    const plan = buildPlan(job, three);
    expect(plan.pages).toHaveLength(2);
    const json = `${JSON.stringify({ planHash: planHash(plan), plan }, null, 2)}
`;
    if (process.env.UPDATE_CONTRACT) writeFileSync(fixture, json);
    expect(readFileSync(fixture, 'utf8')).toBe(json);
  });
});

describe('PrintPlan contract: passport sheet', () => {
  it('the shared passport plan (10×15 cm photo paper, 5 photos, 1½ pt borders) is what buildPlan makes today', () => {
    const fixture = path.resolve('android/app/src/test/resources/plan-v1-passport.json');
    const job = jobReducer(jobFromIntake('job4', intake, 1), { type: 'setPassport', item: 1, count: 5 }, 2);
    const plan = buildPlan(job, aspects, { wMils: 3937, hMils: 5906, edgeMm: 4 });
    const json = `${JSON.stringify({ planHash: planHash(plan), plan }, null, 2)}
`;
    if (process.env.UPDATE_CONTRACT) writeFileSync(fixture, json);
    expect(readFileSync(fixture, 'utf8')).toBe(json);
  });
});

describe('passport plans (PLAN §G0, §J4)', () => {
  const MM = 72 / 25.4;
  const base = jobFromIntake('job1', intake, 1);
  const passport = (count: number, extra: Record<string, unknown> = {}) =>
    jobReducer(base, { type: 'setPassport', item: 1, count, preset: '35x45', ...extra }, 2);
  const tenByFifteen = { wMils: 3937, hMils: 5906, edgeMm: 4 };

  it('on the printer’s own 4×6 photo paper: that exact size, a document, the photos, each with its border', () => {
    const plan = buildPlan(passport(5), aspects, tenByFifteen);
    expect(plan.paper.id).toBe('PHOTO_4x6');
    expect(plan.paper.wPt).toBeCloseTo((3937 * 72) / 1000, 6);
    expect(plan.paper.hPt).toBeCloseTo((5906 * 72) / 1000, 6);
    expect(plan.contentType).toBe('document');
    expect(plan.copies).toBe(1);
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0]?.placements).toHaveLength(5);
    // The 1½ pt border is the cutting guide (owner, 2026-10-23); no border prints the grey cut lines (passportBorder.test).
    expect(plan.pages[0]?.guides).toBeUndefined();
    for (const p of plan.pages[0]?.placements ?? []) {
      expect(p.border).toBe(1.5);
      expect(p.itemIndex).toBe(1);
      expect(p.box.w / MM).toBeCloseTo(35, 6);
      expect(p.box.h / MM).toBeCloseTo(45, 6);
    }
  });

  it('without saved photo paper: A4 (30 a sheet), never a paper the printer may not have', () => {
    const plan = buildPlan(passport(5), aspects);
    expect(plan.paper.id).toBe('A4');
    expect(plan.pages[0]?.placements).toHaveLength(5);
  });

  it('the default crop is the largest centred 35 × 45 frame of the photo as shown', () => {
    // A 3:4 photo is a little narrower than 35:45: the whole width, the middle 96.4 % of the height.
    const crop = buildPlan(passport(1), aspects, tenByFifteen).pages[0]?.placements[0]?.crop;
    expect(crop?.x).toBeCloseTo(0, 9);
    expect(crop?.w).toBeCloseTo(1, 9);
    expect(crop?.h).toBeCloseTo(0.75 / (35 / 45), 9);
    expect(crop?.y).toBeCloseTo((1 - 0.75 / (35 / 45)) / 2, 9);
  });

  /** The cropped part of the photo as shown has the box's shape: nothing is ever stretched (gate M3). */
  const shapeOf = (crop: { w: number; h: number }, shown: number) => (crop.w * shown) / crop.h;

  it('a chosen frame and the photo’s turn are what prints, kept in the 35 × 45 shape', () => {
    const turned = jobReducer(passport(1), { type: 'turnItem', index: 1 }, 3);
    // A frame saved on the turned photo (4:3 as shown), roughly in the 35:45 shape.
    const cropped = jobReducer(turned, { type: 'setPassportCrop', crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } }, 4);
    const p = buildPlan(cropped, aspects, tenByFifteen).pages[0]?.placements[0];
    expect(p?.turns).toBe(1);
    expect(shapeOf(p?.crop ?? { w: 1, h: 1 }, 1 / 0.75)).toBeCloseTo(35 / 45, 6);
    expect((p?.crop.x ?? 0) + (p?.crop.w ?? 0) / 2).toBeCloseTo(0.35, 6); // same centre
  });

  it('a frame made before the photo was turned is not used on the turned photo (it would stretch)', () => {
    const cropped = jobReducer(passport(1), { type: 'setPassportCrop', crop: { x: 0, y: 0, w: 1, h: 0.9643 } }, 3);
    const turned = jobReducer(cropped, { type: 'turnItem', index: 1 }, 4);
    const p = buildPlan(turned, aspects, tenByFifteen).pages[0]?.placements[0];
    expect(shapeOf(p?.crop ?? { w: 1, h: 1 }, 1 / 0.75)).toBeCloseTo(35 / 45, 6);
  });

  it('on A4 the photos keep clear of the printer’s measured edge (10 mm: 25 a sheet upright, 28 sideways)', () => {
    expect(buildPlan(passport(30), aspects).pages).toHaveLength(1);
    // 10 mm edges: upright 5 × 5 = 25 a sheet; sideways (when chosen) 7 × 4 = 28.
    expect(buildPlan(passport(30), aspects, undefined, 10).pages.map((p) => p.placements.length)).toEqual([25, 5]);
    const sideways = jobReducer(passport(30), { type: 'setDirection', direction: 'landscape' }, 3);
    expect(buildPlan(sideways, aspects, undefined, 10).pages.map((p) => p.placements.length)).toEqual([28, 2]);
  });

  it('7 photos at 6 a sheet are 2 sheets', () => {
    expect(buildPlan(passport(7), aspects, tenByFifteen).pages.map((p) => p.placements.length)).toEqual([6, 1]);
  });
});

describe('Space at paper edges: More (Settings → Advanced, Phase 10b)', () => {
  const mm = (pt: number) => (pt * 25.4) / 72;
  const job = jobFromIntake('j', intake, 1);
  const edgeOf = (plan: ReturnType<typeof buildPlan>) =>
    Math.min(
      ...plan.pages.flatMap((p) => {
        const [w, h] =
          p.orientation === 'landscape' ? [plan.paper.hPt, plan.paper.wPt] : [plan.paper.wPt, plan.paper.hPt];
        return p.placements.map((x) => Math.min(x.box.x, x.box.y, w - x.box.x - x.box.w, h - x.box.y - x.box.h));
      }),
    );
  for (const layout of ['onePerPage', 'allOnOne', 'morePages', 'document'] as const) {
    it(`${layout}: at least 9 mm clear at every edge with More, 6 mm without`, () => {
      const j = layout === 'document' ? jobReducer(job, { type: 'setDocument' }, 2) : { ...job, layout };
      expect(mm(edgeOf(buildPlan(j, aspects)))).toBeGreaterThanOrEqual(6 - 1e-6);
      expect(mm(edgeOf(buildPlan(j, aspects, undefined, undefined, undefined, 3)))).toBeGreaterThanOrEqual(9 - 1e-6);
    });
  }
});

describe('photos on the shop printer’s 4×6 photo paper (Phase 10c, PLAN §K3)', () => {
  const paper = { wMils: 4000, hMils: 6000, edgeMm: 4 };
  const job = { ...jobFromIntake('j', intake, 1), paper: 'PHOTO_4x6' as const };
  it('fills the calibrated 4×6 sheet inside its edges', () => {
    const plan = buildPlan(job, aspects, paper);
    expect(plan.paper).toEqual({ id: 'PHOTO_4x6', wPt: 288, hPt: 432 });
    // Exact size first (gate review I4): as a photo, a print service may print borderless and enlarge it; the
    // 4×6 edges were measured with the test page, which prints as a document. A4 photo layouts stay 'photo'.
    expect(plan.contentType).toBe('document');
    expect(buildPlan({ ...job, paper: 'A4', quality: 'photo' }, aspects, paper).contentType).toBe('photo');
    for (const p of plan.pages) {
      const [w, h] = p.orientation === 'landscape' ? [432, 288] : [288, 432];
      for (const x of p.placements) {
        expect(x.box.x).toBeGreaterThanOrEqual((4 * 72) / 25.4 - 1e-6);
        expect(x.box.x + x.box.w).toBeLessThanOrEqual(w - (4 * 72) / 25.4 + 1e-6);
        expect(x.box.y + x.box.h).toBeLessThanOrEqual(h - (4 * 72) / 25.4 + 1e-6);
      }
    }
  });
  it('falls back to A4 when the printer’s photo paper is not known', () => {
    expect(buildPlan(job, aspects).paper.id).toBe('A4');
  });
  it('paperOf: the sheet a job really prints on (gate review I6)', () => {
    expect(paperOf(job, paper)).toBe('PHOTO_4x6');
    expect(paperOf(job, undefined)).toBe('A4'); // a new printer, or 4×6 never set up
    expect(paperOf({ ...job, paper: 'A4' }, paper)).toBe('A4');
    expect(paperOf(jobReducer(job, { type: 'setDocument' }, 2), paper)).toBe('A4'); // documents print on A4
  });
  it('the shared photo-on-4×6 plan is what buildPlan makes (plan-v1-photo4x6.json)', () => {
    const plan = buildPlan({ ...job, layout: 'allOnOne' }, aspects, paper);
    const fixture = path.resolve('android/app/src/test/resources/plan-v1-photo4x6.json');
    const json = `${JSON.stringify({ planHash: planHash(plan), plan }, null, 2)}
`;
    if (process.env.UPDATE_CONTRACT) writeFileSync(fixture, json);
    expect(readFileSync(fixture, 'utf8')).toBe(json);
  });
});
