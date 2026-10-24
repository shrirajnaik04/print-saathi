import { describe, expect, it } from 'vitest';
import type { Job } from './job';
import { continueJob, recentJobs } from './recent';

const job = (id: string, updatedAt: number, extra: Partial<Job> = {}): Job =>
  ({
    id,
    rev: 1,
    intakeIds: [id],
    items: [{ index: 1, path: '/p', type: 'jpeg', bytes: 1, sha256: 'a' }],
    duplicates: [],
    layout: 'onePerPage',
    paper: 'A4',
    colour: 'colour',
    copies: 1,
    notices: [],
    createdAt: updatedAt,
    updatedAt,
    ...extra,
  }) as Job;

describe('Continue and Recent jobs (PLAN §H3, §I-14)', () => {
  it('Continue offers the newest job that has not been printed', () => {
    expect(continueJob([job('a', 1), job('b', 3, { printedAt: 3 }), job('c', 2)])?.id).toBe('c');
  });

  it('a printed job is never offered as Continue, and neither is an empty one', () => {
    expect(continueJob([job('a', 5, { printedAt: 6 })])).toBeNull();
    expect(continueJob([job('e', 9, { items: [] })])).toBeNull();
  });

  it('Recent lists every job newest first, ignoring anything that is not a job', () => {
    expect(recentJobs([job('a', 1), { junk: true }, job('b', 2)]).map((j) => j.id)).toEqual(['b', 'a']);
  });
});
