import { describe, expect, it } from 'vitest';
import { jobFromIntake, jobReducer, normalizeJob } from '../job/job';
import { buildPlan } from './plan';

// Print speed (owner, 2026-10-23: "I have faced delayed print when printing photos"): every job goes to the printer
// as a document (its normal-speed mode); photo layouts may ask for Best photo quality (the printer's slower mode).
const intake = {
  intakeId: 'in1',
  rejected: 0,
  refusedByPolicy: 0,
  files: [{ index: 1, path: '/p/1.jpg', sniffedType: 'jpeg', bytes: 1, sha256: 'a' }],
} as never;
const aspects = new Map([[1, 0.75]]);
const job = jobFromIntake('job1', intake, 1);

describe('print quality', () => {
  it('photo layouts are sent as documents by default', () => {
    for (const layout of ['onePerPage', 'allOnOne', 'morePages'] as const)
      expect(buildPlan(jobReducer(job, { type: 'setLayout', layout }, 2), aspects).contentType).toBe('document');
  });

  it('Best photo quality sends photo layouts as photos; other jobs stay documents', () => {
    const best = jobReducer(job, { type: 'setQuality', quality: 'photo' }, 2);
    expect(best.quality).toBe('photo');
    expect(buildPlan(best, aspects).contentType).toBe('photo');
    expect(buildPlan(jobReducer(best, { type: 'setPassport', item: 1 }, 3), aspects).contentType).toBe('document');
    expect(buildPlan(jobReducer(best, { type: 'setDocument' }, 3), aspects).contentType).toBe('document');
  });

  it('only the two choices are kept', () => {
    expect(jobReducer(job, { type: 'setQuality', quality: 'ultra' as never }, 2)).toBe(job);
    const best = jobReducer(job, { type: 'setQuality', quality: 'photo' }, 2);
    expect(normalizeJob(JSON.parse(JSON.stringify(best)))?.quality).toBe('photo');
    expect(normalizeJob(JSON.parse(JSON.stringify({ ...best, quality: 'x' })))?.quality).toBeUndefined();
  });
});
