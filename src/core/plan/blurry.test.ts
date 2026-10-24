import { describe, expect, it } from 'vitest';
import { blurryItems } from './blurry';

describe('which photos may print blurry (PLAN §F6 thresholds)', () => {
  const dpi = { 1: 300, 2: 110, 3: 90, 4: 150 };
  it('photos under 100 dpi', () => {
    expect(blurryItems('onePerPage', dpi)).toEqual([3]);
    expect(blurryItems('allOnOne', dpi)).toEqual([3]);
  });
  it('photos in a document under 120 dpi', () => {
    expect(blurryItems('document', dpi)).toEqual([2, 3]);
  });
  it('passport photos under 200 dpi', () => {
    expect(blurryItems('passport', dpi)).toEqual([2, 3, 4]);
  });
  it('ID cards under 200 dpi, like passport photos (Phase 14 spec Part 2; review I8)', () => {
    expect(blurryItems('idCard', { 1: 300, 2: 166 })).toEqual([2]);
  });
  it('a 1600 px WhatsApp photo on a full A4 page (about 147 dpi) is fine', () => {
    expect(blurryItems('onePerPage', { 1: 147 })).toEqual([]);
  });
});
