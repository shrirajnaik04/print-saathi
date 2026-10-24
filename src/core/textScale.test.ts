import { describe, expect, it } from 'vitest';
import { rootFontPercent } from './textScale';

describe('rootFontPercent (PLAN §D6: app-controlled text size)', () => {
  it('follows the phone setting between 100 % and 200 %', () => {
    expect(rootFontPercent(1)).toBe(100);
    expect(rootFontPercent(1.3)).toBe(130);
    expect(rootFontPercent(2)).toBe(200);
  });

  it('never goes below the designed size: small phone text still gets 100 %', () => {
    expect(rootFontPercent(0.85)).toBe(100);
  });

  it('caps at the tested maximum (some brands allow 3.0) instead of ignoring the setting', () => {
    expect(rootFontPercent(3)).toBe(200);
  });

  it('treats a missing or broken value as 100 %', () => {
    expect(rootFontPercent(Number.NaN)).toBe(100);
    expect(rootFontPercent(undefined)).toBe(100);
    expect(rootFontPercent(0)).toBe(100);
  });
});
