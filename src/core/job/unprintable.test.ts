import { describe, expect, it } from 'vitest';
import { unprintableNotes, unprintableText } from './unprintable';

const item = (index: number, type: string) => ({ index, path: '', type, bytes: 1, sha256: `${index}` }) as never;

describe('files that cannot be printed are named, with what to do (PLAN §K1, §J8)', () => {
  it('one note per kind, counted', () => {
    expect(
      unprintableNotes([
        item(1, 'pdf'),
        item(2, 'office'),
        item(3, 'office'),
        item(4, 'video'),
        item(5, 'other'),
        item(6, 'jpeg'),
      ]),
    ).toEqual([
      // Round 9: Office files are not in this list; their own card offers Print with WPS Office.
      "1 video can't be printed.",
      "1 file can't be printed. Ask the customer to send it as a PDF or a photo.",
    ]);
  });
  it('nothing to say when every file can print', () => {
    expect(unprintableNotes([item(1, 'pdf'), item(2, 'png')])).toEqual([]);
  });
  it('the short note under a file on Received', () => {
    expect(unprintableText('office')).toBe('Office file'); // round 9: named by kind; the card says what to do
    expect(unprintableText('video')).toBe("A video: can't be printed.");
  });
});
