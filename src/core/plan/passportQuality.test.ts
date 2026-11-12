import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer } from '../job/job';
import { PASSPORT_DPI } from '../layout/passport';
import { buildPlan } from './plan';

// Round 11 (owner, 2026-11-12): "make sure passport size photos taken as best quality ... even with best quality the print
// must aim for fast printing", then "best quality I meant image as is": the passport photo is made from the customer's
// own pixels, up to 600 dpi of its printed size (not shrunk to 300), and still goes to the printer as a small document
// (the printer's normal-speed mode), the one image reused for every copy.
const intake = {
  intakeId: 'in1',
  rejected: 0,
  refusedByPolicy: 0,
  files: [{ index: 1, path: '/p/1.jpg', sniffedType: 'jpeg', bytes: 1, sha256: 'a' }],
} as never;
const aspects = new Map([[1, 0.75]]);
const base = jobFromIntake('job1', intake, 1);
const tenByFifteen = { wMils: 3937, hMils: 5906, edgeMm: 4 };

describe('passport photos are made as they are (round 11)', () => {
  it('every passport photo asks for 600 dpi of its printed size, on A4 and on the printer’s 4×6 paper', () => {
    const job = jobReducer(base, { type: 'setPassport', item: 1, count: 12 }, 2);
    for (const plan of [buildPlan(job, aspects), buildPlan(job, aspects, tenByFifteen)]) {
      const placements = plan.pages.flatMap((p) => p.placements);
      expect(placements.length).toBeGreaterThan(1);
      expect(placements.every((p) => p.dpi === PASSPORT_DPI)).toBe(true);
    }
    expect(PASSPORT_DPI).toBe(600);
  });

  it('with a border or cut lines, in colour or black & white, a custom size too', () => {
    const job = jobReducer(base, { type: 'setPassport', item: 1, count: 4 }, 2);
    const noBorder = jobReducer(job, { type: 'setPassportBorder', border: 0 }, 3);
    const bw = jobReducer(job, { type: 'setColour', colour: 'bw' }, 3);
    const custom = jobReducer(job, { type: 'setPassportSize', preset: 'custom', sizeMm: { w: 40, h: 50 } }, 3);
    for (const j of [job, noBorder, bw, custom])
      expect(
        buildPlan(j, aspects)
          .pages.flatMap((p) => p.placements)
          .every((p) => p.dpi === PASSPORT_DPI),
      ).toBe(true);
  });

  it('it is still sent as a document (the printer’s fast mode), whatever Print quality says', () => {
    const job = jobReducer(base, { type: 'setPassport', item: 1, count: 5 }, 2);
    const best = jobReducer(job, { type: 'setQuality', quality: 'photo' }, 3);
    expect(buildPlan(job, aspects).contentType).toBe('document');
    expect(buildPlan(best, aspects).contentType).toBe('document');
  });

  it('photos, documents and cards are made at 300 dpi as before: they carry no dpi', () => {
    const photos = jobReducer(base, { type: 'setLayout', layout: 'allOnOne' }, 2);
    for (const placement of buildPlan(photos, aspects).pages.flatMap((p) => p.placements))
      expect(placement.dpi).toBeUndefined();
  });
});
