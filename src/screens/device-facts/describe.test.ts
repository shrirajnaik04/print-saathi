import { describe, expect, it } from 'vitest';
import { describeUnlockTier, formatExtensionLevel, formatRam } from './describe';

describe('device facts wording', () => {
  it('says plainly whether the phone can open locked PDFs by itself', () => {
    expect(describeUnlockTier('NATIVE_35')).toBe('This phone can open locked PDFs (like e-Aadhaar) by itself: Yes');
    expect(describeUnlockTier('PRE_V')).toBe('This phone can open locked PDFs (like e-Aadhaar) by itself: Yes');
    expect(describeUnlockTier('NONE')).toBe(
      'This phone can open locked PDFs (like e-Aadhaar) by itself: No — PrintSaathi will need its own helper',
    );
  });

  it('shows memory in GB with one decimal', () => {
    expect(formatRam(2048)).toBe('2.0 GB');
    expect(formatRam(5734)).toBe('5.6 GB');
  });
});

describe('formatExtensionLevel', () => {
  it('shows the number when Android reports one', () => {
    expect(formatExtensionLevel(13)).toBe('13');
  });

  // Gate 2 minor 12: before Android 11 the value is absent, which once rendered as "undefined".
  it('says "Not available" for null or a missing value', () => {
    expect(formatExtensionLevel(null)).toBe('Not available');
    expect(formatExtensionLevel(undefined)).toBe('Not available');
  });
});
