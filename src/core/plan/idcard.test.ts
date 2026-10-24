import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Job, jobFromIntake, jobReducer, normalizeJob, validQuad } from '../job/job';
import { buildPlan, CARD_H_MM, CARD_W_MM, drawnCardScale, idCardPlan, maxCardSets, planHash } from './plan';

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
const MM = 72 / 25.4;
const front = [0.1, 0.1, 0.6, 0.12, 0.58, 0.45, 0.12, 0.43];
const back = [0.2, 0.2, 0.8, 0.2, 0.8, 0.58, 0.2, 0.58];
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 2);

function cardJob(size?: 'real' | 'big' | 'sets' | 'page', two = true): Job {
  let job = jobFromIntake('jc', intake, 1);
  job = jobReducer(
    job,
    {
      type: 'setIdCards',
      cards: two
        ? [
            { item: 1, quad: front, turns: 0 },
            { item: 2, quad: back, turns: 0 },
          ]
        : [{ item: 1, quad: front, turns: 0 }],
      size,
    },
    2,
  );
  return job;
}

describe('ID card plans (Phase 14 spec "How big?")', () => {
  it('real size: two boxes of exactly 85.6 × 54 mm, centred, 10 mm apart, from 20 mm below the top, cut lines', () => {
    const plan = idCardPlan(cardJob('real'), 6);
    expect(plan.paper.id).toBe('A4');
    expect(plan.contentType).toBe('document');
    const [a, b] = plan.pages[0]?.placements ?? [];
    for (const p of [a, b]) {
      near(p?.box.w ?? 0, 242.6457);
      near(p?.box.h ?? 0, 153.0709);
      near((p?.box.x ?? 0) + (p?.box.w ?? 0) / 2, 595.2756 / 2);
    }
    near(a?.box.y ?? 0, 56.6929);
    near((b?.box.y ?? 0) - ((a?.box.y ?? 0) + (a?.box.h ?? 0)), 28.3465);
    expect(plan.pages[0]?.guides).toHaveLength(8);
    expect(a?.quad).toEqual(front);
    expect(b?.quad).toEqual(back);
    expect(a?.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('big size: both enlarged equally, at most 2× (171.2 × 108 mm), no cut lines', () => {
    const plan = idCardPlan(cardJob('big'), 6);
    const [a, b] = plan.pages[0]?.placements ?? [];
    near(a?.box.w ?? 0, 171.2 * MM);
    near(a?.box.h ?? 0, 108 * MM);
    expect(b?.box.w).toBe(a?.box.w);
    expect(plan.pages[0]?.guides).toBeUndefined();
    // Bigger printer edges: still both fit inside them.
    const tight = idCardPlan(cardJob('big'), 20);
    const [c, d] = tight.pages[0]?.placements ?? [];
    expect((d?.box.y ?? 0) + (d?.box.h ?? 0)).toBeLessThanOrEqual((297 - 20) * MM + 1e-6);
    expect(c?.box.w).toBeLessThan(171.2 * MM);
  });

  it('many copies: front left, back right, rows 5 mm apart, as many as asked and fit (4 on A4 with 6 mm edges)', () => {
    expect(maxCardSets(6, 2)).toBe(4);
    expect(maxCardSets(6, 1)).toBe(8);
    let job = cardJob('sets');
    job = jobReducer(job, { type: 'setIdCardSize', size: 'sets', sets: 3 }, 3);
    const plan = idCardPlan(job, 6);
    const ps = plan.pages[0]?.placements ?? [];
    expect(ps.map((p) => p.itemIndex)).toEqual([1, 2, 1, 2, 1, 2]);
    near((ps[1]?.box.x ?? 0) - ((ps[0]?.box.x ?? 0) + (ps[0]?.box.w ?? 0)), 5 * MM);
    near((ps[2]?.box.y ?? 0) - ((ps[0]?.box.y ?? 0) + (ps[0]?.box.h ?? 0)), 5 * MM);
    for (const p of ps) near(p.box.w, CARD_W_MM * MM);
    expect(plan.pages[0]?.guides).toHaveLength(24);
    // More than fit: the sheet's maximum.
    const many = idCardPlan(jobReducer(job, { type: 'setIdCardSize', size: 'sets', sets: 9 }, 4), 6);
    expect(many.pages[0]?.placements).toHaveLength(8);
  });

  it('one card: only the front is placed', () => {
    const plan = idCardPlan(cardJob('real', false), 6);
    expect(plan.pages[0]?.placements).toHaveLength(1);
    expect(plan.pages[0]?.guides).toHaveLength(4);
  });

  it('the whole e-Aadhaar page: the PDF page fitted inside the edges, no corners', () => {
    let job = jobFromIntake('jp', intake, 1);
    job = jobReducer(
      job,
      { type: 'setIdCards', cards: [{ item: 3, page: 0, quad: front, turns: 0 }], size: 'page' },
      2,
    );
    const plan = idCardPlan(job, 6, new Map([[3, { pages: 1, sizes: [[612, 792]], forms: false, locked: false }]]));
    const p = plan.pages[0]?.placements[0];
    expect(p?.pdfPage).toBe(0);
    expect(p?.quad).toBeUndefined();
    expect((p?.box.w ?? 0) / (p?.box.h ?? 1)).toBeCloseTo(612 / 792, 4);
    expect(p?.box.x ?? 0).toBeGreaterThanOrEqual(6 * MM - 1e-6);
  });

  it('Swap puts the back first; a half turn is kept per card; Fix corners changes one card', () => {
    let job = cardJob('real');
    job = jobReducer(job, { type: 'swapIdCards' }, 3);
    expect(idCardPlan(job, 6).pages[0]?.placements.map((p) => p.itemIndex)).toEqual([2, 1]);
    job = jobReducer(job, { type: 'turnIdCard', at: 0 }, 4);
    expect(idCardPlan(job, 6).pages[0]?.placements[0]?.turns).toBe(2);
    const moved = [0.11, 0.1, 0.6, 0.12, 0.58, 0.45, 0.12, 0.43];
    job = jobReducer(job, { type: 'setIdCardQuad', at: 1, quad: moved }, 5);
    expect(idCardPlan(job, 6).pages[0]?.placements[1]?.quad).toEqual(moved);
  });

  it('bad corners are refused (not clockwise, crossed, outside, wrong count), and a stored job is cleaned', () => {
    expect(validQuad(front)).toBe(true);
    expect(validQuad([0.1, 0.1, 0.12, 0.43, 0.58, 0.45, 0.6, 0.12])).toBe(false);
    expect(validQuad([0.1, 0.1, 0.58, 0.45, 0.6, 0.12, 0.12, 0.43])).toBe(false);
    expect(validQuad([0.1, 0.1, 1.6, 0.12, 0.58, 0.45, 0.12, 0.43])).toBe(false);
    expect(validQuad([0.1, 0.1, 0.6, 0.12])).toBe(false);
    const job = cardJob('real');
    expect(jobReducer(job, { type: 'setIdCardQuad', at: 0, quad: [0, 0, 0, 0, 0, 0, 0, 0] }, 3)).toBe(job);
    const stored = { ...job, idCard: { size: 'real', sets: 99, cards: [{ item: 1, quad: [1, 2], turns: 0 }] } };
    const n = normalizeJob(stored);
    expect(n?.idCard).toBeUndefined();
    expect(n?.layout).toBe('onePerPage');
    expect(normalizeJob({ ...job, idCard: { ...job.idCard, sets: 99 } })?.idCard?.sets).toBe(10);
  });

  it('buildPlan uses the card plan for a card job; the sides go in its exact mm; Black & white uses grey', () => {
    const job = jobReducer(cardJob('real'), { type: 'setColour', colour: 'bw' }, 3);
    const plan = buildPlan(job, new Map());
    expect(plan.colour).toBe('bw');
    expect(plan.pages[0]?.placements.every((p) => p.style === 'bw')).toBe(true);
    expect((plan.pages[0]?.placements[0]?.box.h ?? 0) / MM).toBeCloseTo(CARD_H_MM, 6);
  });
});

describe('"Check the corners" lives in the job (review I6)', () => {
  it('each card keeps whether it is sure through Swap; corners set by hand are sure; a stored job keeps it', () => {
    let job = jobFromIntake('js', intake, 1);
    job = jobReducer(
      job,
      {
        type: 'setIdCards',
        cards: [
          { item: 1, quad: front, turns: 0, sure: true },
          { item: 2, quad: back, turns: 0, sure: false },
        ],
      },
      2,
    );
    expect(job.idCard?.cards.map((c) => c.sure)).toEqual([true, false]);
    job = jobReducer(job, { type: 'swapIdCards' }, 3);
    expect(job.idCard?.cards.map((c) => c.sure)).toEqual([false, true]);
    job = jobReducer(job, { type: 'setIdCardQuad', at: 0, quad: [0.21, 0.2, 0.8, 0.2, 0.8, 0.58, 0.2, 0.58] }, 4);
    expect(job.idCard?.cards[0]?.sure).toBe(true);
    expect(normalizeJob(JSON.parse(JSON.stringify(job)))?.idCard?.cards.map((c) => c.sure)).toEqual([true, true]);
  });
});

describe('auto-rotation in the job (Phase 15 spec Part 3)', () => {
  it('turns only photos nobody turned by hand, once per job; Undo takes back only its own turns', () => {
    let job = jobFromIntake('jr', intake, 1);
    job = jobReducer(job, { type: 'turnItem', index: 2 }, 2); // the shopkeeper turned photo 2 by hand
    job = jobReducer(job, { type: 'autoTurn', turns: { 1: 3, 2: 1, 3: 2 } }, 3); // 3 is a PDF
    expect(job.turns).toEqual({ 1: 3, 2: 1 });
    expect(job.autoTurned).toEqual({ 1: 3 });
    expect(job.autoTurnDone).toBe(true);
    // Never again for this job.
    expect(jobReducer(job, { type: 'autoTurn', turns: { 1: 1 } }, 4)).toBe(job);
    const undone = jobReducer(job, { type: 'undoAutoTurn' }, 5);
    expect(undone.turns).toEqual({ 2: 1 });
    expect(undone.autoTurned).toBeUndefined();
  });

  it("a turn by hand after the app's wins: Undo leaves it alone", () => {
    let job = jobReducer(jobFromIntake('jh', intake, 1), { type: 'autoTurn', turns: { 1: 1 } }, 2);
    job = jobReducer(job, { type: 'turnItem', index: 1 }, 3);
    expect(job.turns[1]).toBe(2);
    expect(job.autoTurned).toBeUndefined();
    expect(jobReducer(job, { type: 'undoAutoTurn' }, 4).turns[1]).toBe(2);
  });

  it('never an ID card job, nor a passport photo already framed', () => {
    const cards = jobReducer(cardJob('real'), { type: 'autoTurn', turns: { 1: 1 } }, 3);
    expect(cards.turns).toEqual({});
    expect(cards.autoTurnDone).toBe(true);
    let p = jobReducer(jobFromIntake('jp2', intake, 1), { type: 'setPassport', item: 1 }, 2);
    p = jobReducer(p, { type: 'setPassportCrop', crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.6 } }, 3);
    expect(jobReducer(p, { type: 'autoTurn', turns: { 1: 1 } }, 4).turns).toEqual({});
  });

  it('a stored job keeps its auto turns only where they still stand', () => {
    const job = jobReducer(jobFromIntake('js2', intake, 1), { type: 'autoTurn', turns: { 1: 1, 2: 3 } }, 2);
    const stored = { ...job, turns: { 1: 1, 2: 0 } };
    expect(normalizeJob(stored)?.autoTurned).toEqual({ 1: 1 });
    expect(normalizeJob(stored)?.autoTurnDone).toBe(true);
  });
});

// The native renderer parses this exact file (RenderPlanContractTest). Refresh with UPDATE_CONTRACT=1 npm test.
describe('PrintPlan contract: ID cards', () => {
  it('the shared ID card plan is what buildPlan makes today', () => {
    const fixture = path.resolve('android/app/src/test/resources/plan-v1-idcard.json');
    const plan = buildPlan(cardJob('real'), new Map());
    const json = `${JSON.stringify({ planHash: planHash(plan), plan }, null, 2)}\n`;
    if (process.env.UPDATE_CONTRACT) writeFileSync(fixture, json);
    expect(readFileSync(fixture, 'utf8')).toBe(json);
  });
});

// Owner, round 4: "allow rotating images in all directions in the ID card front and back sections": Turn left / right a
// quarter at a time; a card turned a quarter prints standing (54 × 85.6 mm), for vertical ID cards, in every size.
describe('a card turned a quarter prints standing', () => {
  const turned = (a: 0 | 1 | 2 | 3, b: 0 | 1 | 2 | 3, size: 'real' | 'big' | 'sets' | 'custom'): Job => {
    let job = jobFromIntake('jt', intake, 1);
    job = jobReducer(
      job,
      {
        type: 'setIdCards',
        cards: [
          { item: 1, quad: front, turns: a },
          { item: 2, quad: back, turns: b },
        ],
        size: size === 'custom' ? 'real' : size,
      },
      2,
    );
    if (size === 'custom') job = jobReducer(job, { type: 'setIdCardScale', scale: 1.3 }, 3);
    if (size === 'sets') job = jobReducer(job, { type: 'setIdCardSize', size: 'sets', sets: 9 }, 3);
    return job;
  };
  it('every pair of turns in every size: inside the edges, apart, each card its own shape', () => {
    const edge = 6 * MM;
    for (const a of [0, 1, 2, 3] as const)
      for (const b of [0, 1, 2, 3] as const)
        for (const size of ['real', 'big', 'sets', 'custom'] as const) {
          const ps = idCardPlan(turned(a, b, size), 6).pages[0]?.placements ?? [];
          const label = `${size} turns ${a}/${b}`;
          expect(ps.length, label).toBeGreaterThan(0);
          for (const p of ps) {
            expect(p.box.x, label).toBeGreaterThanOrEqual(edge - 1e-6);
            expect(p.box.y, label).toBeGreaterThanOrEqual(edge - 1e-6);
            expect(p.box.x + p.box.w, label).toBeLessThanOrEqual(595.2756 - edge + 1e-6);
            expect(p.box.y + p.box.h, label).toBeLessThanOrEqual(841.8898 - edge + 1e-6);
            const standing = (p.itemIndex === 1 ? a : b) % 2 === 1;
            const ratio = standing ? p.box.h / p.box.w : p.box.w / p.box.h;
            expect(ratio, label).toBeCloseTo(CARD_W_MM / CARD_H_MM, 4);
            expect(p.turns, label).toBe(p.itemIndex === 1 ? a : b);
            if (size === 'real' || size === 'sets') {
              near(standing ? p.box.w : p.box.h, CARD_H_MM * MM);
              near(standing ? p.box.h : p.box.w, CARD_W_MM * MM);
            }
          }
          for (let i = 0; i < ps.length; i++)
            for (let j = i + 1; j < ps.length; j++) {
              const p = ps[i]?.box;
              const q = ps[j]?.box;
              if (!p || !q) continue;
              const apart =
                p.x + p.w <= q.x + 1e-6 ||
                q.x + q.w <= p.x + 1e-6 ||
                p.y + p.h <= q.y + 1e-6 ||
                q.y + q.h <= p.y + 1e-6;
              expect(apart, `${label}: ${i} and ${j} overlap`).toBe(true);
            }
        }
  });
  it('Many copies with a standing card: rows as tall as the taller card, so fewer sets fit', () => {
    expect(maxCardSets(6, 2, true)).toBe(3);
    expect(maxCardSets(6, 2, true)).toBeLessThan(maxCardSets(6, 2));
    expect(idCardPlan(turned(1, 0, 'sets'), 6).pages[0]?.placements).toHaveLength(6);
  });
});

// Review I2 (round 4): Adjust and Ready said a standing card's size from its width (54 ÷ 85.6), and a chosen size the
// plan holds down to what fits as if it printed so.
describe('the cards’ size as drawn', () => {
  const standing = (size: 'big' | 'real', scale?: number) => {
    let job = cardJob(size);
    job = jobReducer(job, { type: 'turnIdCard', at: 0, by: 1 }, 3);
    job = jobReducer(job, { type: 'turnIdCard', at: 1, by: 1 }, 4);
    if (scale !== undefined) job = jobReducer(job, { type: 'setIdCardScale', scale }, 5);
    return idCardPlan(job, 6);
  };
  it('is the long side over the real card, standing or lying', () => {
    expect(drawnCardScale(idCardPlan(cardJob('real'), 6))).toBeCloseTo(1, 6);
    expect(drawnCardScale(standing('real'))).toBeCloseTo(1, 6);
  });
  it('Big size with two standing cards: as big as fits (about 161 %), not 101 %', () => {
    const s = drawnCardScale(standing('big'));
    expect(s).toBeGreaterThan(1.55);
    expect(s).toBeLessThan(1.7);
  });
  it('a chosen size above what fits is said as it prints', () => {
    const big = drawnCardScale(standing('big'));
    expect(drawnCardScale(standing('real', 2))).toBeCloseTo(big, 6);
  });
});
