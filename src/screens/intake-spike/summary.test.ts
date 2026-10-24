import { describe, expect, it } from 'vitest';
import { summariseIntake } from './summary';

const f = (t: string) => ({ index: 1, path: '/x', sniffedType: t as never, bytes: 1, sha256: 'a' });

describe('intake summary wording', () => {
  it('counts photos and PDFs in plain words', () => {
    expect(summariseIntake([f('jpeg'), f('png'), f('pdf')], 0)).toBe('3 files received: 2 photos and 1 PDF');
    expect(summariseIntake([f('jpeg')], 0)).toBe('1 file received: 1 photo');
  });
  it('mentions files that could not be printed without jargon', () => {
    expect(summariseIntake([f('jpeg'), f('office')], 1)).toBe(
      '3 files received: 1 photo. 2 files can’t be printed yet — ask the customer to send them as a PDF or photo.',
    );
  });

  it('counts a BMP picture as a photo', () => {
    expect(summariseIntake([f('bmp')], 0)).toBe('1 file received: 1 photo');
  });
});
