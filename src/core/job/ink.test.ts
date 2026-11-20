import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer, normalizeJob, styleOf } from './job';

// Round 12 (owner, 2026-11-20): "hope the prints are ink efficient, colour and black & white, without compromising print
// quality". Answer: automatic for documents. When every photo of a job is a photographed paper page, the job saves ink:
// Clean colour in colour, Sharp Black in black & white (the paper's tint is left white, the text stays sharp). A style the
// shopkeeper chose always wins, and real photos are never changed.
const intake = {
  intakeId: 'in1',
  rejected: 0,
  refusedByPolicy: 0,
  files: [{ index: 1, path: '/p/1.jpg', sniffedType: 'jpeg', bytes: 1, sha256: 'a' }],
} as never;
const base = jobFromIntake('job1', intake, 1);

describe('documents save ink (round 12)', () => {
  it('a job that saves ink prints Clean colour in colour and Sharp Black in black & white', () => {
    const j = jobReducer(base, { type: 'setInk' }, 2);
    expect(j.ink).toBe(true);
    expect(styleOf(j)).toBe('clean');
    const bw = jobReducer(j, { type: 'setColour', colour: 'bw' }, 3);
    expect(styleOf(bw)).toBe('sharp');
    expect(styleOf(jobReducer(bw, { type: 'setColour', colour: 'colour' }, 4))).toBe('clean');
  });

  it('a style the shopkeeper chose wins, and a job that does not save ink is as it was', () => {
    const j = jobReducer(base, { type: 'setInk' }, 2);
    expect(styleOf(jobReducer(j, { type: 'setStyle', style: 'vibrant' }, 3))).toBe('vibrant');
    expect(styleOf(jobReducer(j, { type: 'setStyle', style: 'original' }, 3))).toBe('original');
    expect(styleOf(base)).toBe('original');
    expect(styleOf(jobReducer(base, { type: 'setColour', colour: 'bw' }, 2))).toBe('bw');
  });

  it('it is asked only once, and never changes a style already chosen', () => {
    const chosen = jobReducer(base, { type: 'setStyle', style: 'soft' }, 2);
    const j = jobReducer(chosen, { type: 'setInk' }, 3);
    expect(styleOf(j)).toBe('soft');
    expect(jobReducer(j, { type: 'setInk' }, 4)).toBe(j);
  });

  it('is kept when the job is saved and read back; passport photos and ID cards are never styled', () => {
    const j = jobReducer(base, { type: 'setInk' }, 2);
    expect(normalizeJob(JSON.parse(JSON.stringify(j)))?.ink).toBe(true);
    expect(normalizeJob(JSON.parse(JSON.stringify(base)))?.ink).toBeUndefined();
    expect(styleOf(jobReducer(j, { type: 'setPassport', item: 1 }, 3))).toBe('original');
  });
});

// Review of round 12 (commit 3bb008d): the ink setting must never outlive what earned it, and the paper look happens once.
describe('ink follows what earned it (review)', () => {
  const quad = [0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9];
  const withInk = () => jobReducer(jobReducer(base, { type: 'setQuad', item: 1, quad }, 2), { type: 'setInk' }, 3);

  it('taking a photo’s cut away (Whole photo) takes the ink saving away', () => {
    const j = withInk();
    expect(j.ink).toBe(true);
    const whole = jobReducer(j, { type: 'setQuad', item: 1, quad: null }, 4);
    expect(whole.ink).toBeUndefined();
    expect(styleOf(whole)).toBe('original');
  });

  it('photos added later are not known to be paper: the saving and the look start again', () => {
    const j = jobReducer(withInk(), { type: 'setLooked' }, 4);
    expect(j.looked).toBe(true);
    const item = { index: 2, path: '/p/2.jpg', type: 'jpeg', sha256: 'b' } as never;
    const more = jobReducer(j, { type: 'addItems', items: [item], intakeId: 'in2', notices: [] }, 5);
    expect(more.ink).toBeUndefined();
    expect(more.looked).toBeUndefined();
  });

  it('ID cards and passport photos are never styled by it, even if it was set before', () => {
    const j = withInk();
    const cards = { ...j, layout: 'idCard' as const };
    expect(styleOf(cards)).toBe('original');
    expect(styleOf({ ...cards, colour: 'bw' })).toBe('bw');
    expect(jobReducer(j, { type: 'setIdCards', cards: [{ item: 1, quad, turns: 0 }] }, 4).ink).toBeUndefined();
  });

  it('the paper look is recorded once and kept when the job is saved', () => {
    const j = jobReducer(base, { type: 'setLooked' }, 2);
    expect(j.looked).toBe(true);
    expect(jobReducer(j, { type: 'setLooked' }, 3)).toBe(j);
    expect(normalizeJob(JSON.parse(JSON.stringify(j)))?.looked).toBe(true);
    expect(normalizeJob(JSON.parse(JSON.stringify(base)))?.looked).toBeUndefined();
  });
});
