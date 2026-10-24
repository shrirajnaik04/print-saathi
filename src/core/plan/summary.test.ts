import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer } from '../job/job';
import { buildPlan } from './plan';
import { passportLine, summaryLine, withPaperType } from './summary';

const intake = (n: number) =>
  ({
    intakeId: 'in1',
    rejected: 0,
    refusedByPolicy: 0,
    files: Array.from({ length: n }, (_, i) => ({
      index: i + 1,
      path: `/p/${i + 1}.jpg`,
      sniffedType: 'jpeg',
      bytes: 1,
      sha256: `h${i}`,
    })),
  }) as never;
const aspects = (n: number) => new Map(Array.from({ length: n }, (_, i) => [i + 1, 0.75] as [number, number]));

describe('summary line on Ready (PLAN §I-5: what will print, in counter words)', () => {
  it('counts photos, pages and copies with the right singular and plural', () => {
    const job = jobFromIntake('j', intake(3), 1);
    expect(summaryLine(buildPlan(job, aspects(3)))).toBe('3 photos · 3 pages · A4 · Colour · 1 copy');
    const one = jobFromIntake('j', intake(1), 1);
    expect(summaryLine(buildPlan(jobReducer(one, { type: 'setCopies', copies: 2 }, 2), aspects(1)))).toBe(
      '1 photo · 1 page · A4 · Colour · 2 copies',
    );
  });

  it('says Black & white when that is chosen', () => {
    const job = jobReducer(jobFromIntake('j', intake(2), 1), { type: 'setColour', colour: 'bw' }, 2);
    expect(summaryLine(buildPlan(job, aspects(2)))).toBe('2 photos · 2 pages · A4 · Black & white · 1 copy');
  });
});

describe('passport summary (PLAN §J4, §K4: only 5 photos have a price)', () => {
  const one = jobFromIntake('j', intake(1), 1);
  const pp = (count: number) => jobReducer(one, { type: 'setPassport', item: 1, count }, 2);
  const paper = { wMils: 3937, hMils: 5906, edgeMm: 4 };
  it('says the count, the paper, the colour, the sheets and the price for 5', () => {
    expect(passportLine(buildPlan(pp(5), aspects(1), paper))).toBe(
      '5 passport photos · 4×6 photo paper · Colour · 1 sheet · Charge ₹50',
    );
  });
  it('has no price for other counts and counts sheets', () => {
    expect(passportLine(buildPlan(pp(8), aspects(1), paper))).toBe(
      '8 passport photos · 4×6 photo paper · Colour · 2 sheets',
    );
  });
  it("uses the owner's price table from Settings (Phase 10b)", () => {
    expect(passportLine(buildPlan(pp(8), aspects(1), paper), { 8: 80 })).toBe(
      '8 passport photos · 4×6 photo paper · Colour · 2 sheets · Charge ₹80',
    );
    expect(passportLine(buildPlan(pp(5), aspects(1), paper), {})).not.toContain('Charge');
  });
  it('names A4 when there is no photo paper, and one photo in the singular', () => {
    expect(passportLine(buildPlan(pp(1), aspects(1)))).toBe('1 passport photo · A4 · Colour · 1 sheet');
  });

  it('names a print style that is not the plain one (Phase 8)', () => {
    const job = jobFromIntake('j', intake(2), 1);
    expect(summaryLine(buildPlan(jobReducer(job, { type: 'setStyle', style: 'sharp' }, 2), aspects(2)))).toBe(
      '2 photos · 2 pages · A4 · Black & white · Sharp Black · 1 copy',
    );
    expect(summaryLine(buildPlan(jobReducer(job, { type: 'setStyle', style: 'vibrant' }, 2), aspects(2)))).toBe(
      '2 photos · 2 pages · A4 · Colour · Vibrant · 1 copy',
    );
    expect(summaryLine(buildPlan(jobReducer(job, { type: 'setColour', colour: 'bw' }, 2), aspects(2)))).toBe(
      '2 photos · 2 pages · A4 · Black & white · 1 copy',
    );
  });
});

describe('the summary names the paper (Phase 10c)', () => {
  it('4×6 photo paper for photos on photo paper', () => {
    const j = { ...jobFromIntake('j', intake(2), 1), paper: 'PHOTO_4x6' as const };
    expect(summaryLine(buildPlan(j, aspects(2), { wMils: 4000, hMils: 6000, edgeMm: 4 }))).toContain('4×6 photo paper');
  });
});

// Owner, round 4: glossy photo paper is named in Ready's line, before the colour.
describe('paper type in the line', () => {
  it('Glossy goes right before the colour', () => {
    expect(withPaperType('3 photos · 3 pages · A4 · Colour · 1 copy', true)).toBe(
      '3 photos · 3 pages · A4 · Glossy · Colour · 1 copy',
    );
    expect(withPaperType('2 photos · 2 pages · A4 · Black & white · 1 copy', true)).toBe(
      '2 photos · 2 pages · A4 · Glossy · Black & white · 1 copy',
    );
  });
  it('plain paper leaves the line as it is', () => {
    expect(withPaperType('3 photos · 3 pages · A4 · Colour · 1 copy', false)).toBe(
      '3 photos · 3 pages · A4 · Colour · 1 copy',
    );
  });
});
