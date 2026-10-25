import { describe, expect, it } from 'vitest';
import type { Job } from '../../core/job/job';
import { jobText } from './jobText';

const item = (index: number, copyOf?: number) => ({ index, ...(copyOf ? { copyOf } : {}) });
const job = (items: object[]) => ({ items, updatedAt: 0 }) as unknown as Job;

describe('Recent jobs: what a job is (review M7)', () => {
  it('counts the files received, not the copies made on Adjust', () => {
    expect(jobText(job([item(1), item(2), item(3, 1)]), 0).title).toBe('2 files');
  });
  it('a copy whose original was removed counts as its file, once', () => {
    expect(jobText(job([item(2), item(3, 1), item(4, 1)]), 0).title).toBe('2 files');
    expect(jobText(job([item(3, 1)]), 0).title).toBe('1 file');
  });
});
