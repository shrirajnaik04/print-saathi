import { describe, expect, it } from 'vitest';
import { en } from './en';

// PLAN §H2.12: plain English for a reading age of 8–9 — short sentences and everyday words. Measured, not assumed.
const strings = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : [];
/** Sentences of a string: split after . ! ? or a line break; placeholders ({n}) count as one word. */
const sentences = (s: string) =>
  s
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
const words = (s: string) => s.split(/\s+/).filter((w) => /[A-Za-z0-9{]/.test(w));
/** A rough syllable count (vowel groups, a silent final e dropped): enough to find long words. */
const syllables = (w: string) => {
  const s = w.toLowerCase().replace(/[^a-z]/g, '');
  if (s.length <= 3) return 1;
  const groups = s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
};
// Shop words the shopkeeper already uses, and names (PLAN §A "The shopkeeper knows WhatsApp, photos, A4, colour, copies").
const ALLOWED = new Set(['printsaathi', 'whatsapp']);

describe('plain wording (PLAN §H2.12)', () => {
  const all = strings(en);
  it('no sentence is longer than 20 words', () => {
    const long = all.flatMap(sentences).filter((s) => words(s).length > 20);
    expect(long).toEqual([]);
  });
  it('no unusual long words (more than 4 syllables)', () => {
    const hard = [
      ...new Set(
        all
          .flatMap(words)
          .map((w) => w.replace(/[^A-Za-z]/g, ''))
          .filter((w) => w && !ALLOWED.has(w.toLowerCase()) && syllables(w) > 4),
      ),
    ];
    expect(hard).toEqual([]);
  });
  it('the checks themselves work', () => {
    expect(syllables('photo')).toBe(2);
    expect(syllables('unintelligibility')).toBeGreaterThan(4);
    expect(sentences('One. Two! Three?')).toHaveLength(3);
  });
});
