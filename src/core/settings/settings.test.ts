import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MARGIN_MM, normalizeSettings, priceFor } from './settings';

describe('shop settings (PLAN §I-15, §V defaults)', () => {
  it('nothing saved yet: the defaults the owner agreed', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.retention).toBe('1d');
    expect(DEFAULT_SETTINGS.passport).toEqual({ preset: '35x45', count: 5, prices: { 5: 50 }, border: 1.5 });
    expect(DEFAULT_SETTINGS.defaults).toEqual({
      photos: { colour: 'colour', paper: 'A4' },
      documents: { colour: 'bw' },
    });
    expect(DEFAULT_SETTINGS.photoPaperReminder).toBe(true);
    expect(DEFAULT_SETTINGS.edges).toBe('normal');
  });

  it('a broken or odd file reads field by field: what is valid stays, the rest is the default', () => {
    const s = normalizeSettings({
      v: 1,
      shopName: '  Star Xerox & Printing Centre on Station Road  ',
      retention: '2w',
      passport: { preset: '20x25', count: 900, prices: { 5: 50, 8: 0, 10: -3, 4: 40.6, x: 9, 12: 1e9 } },
      defaults: { photos: { colour: 'bw' }, documents: 'nonsense' },
      photoPaperReminder: 'yes',
      edges: 'more',
      screenshotsUntil: -5,
    });
    expect(s.shopName).toBe('Star Xerox & Printing Centre on Station'); // at most 40 characters, trimmed
    expect(s.retention).toBe('1d');
    expect(s.passport).toEqual({ preset: '20x25', count: 60, prices: { 4: 41, 5: 50 }, border: 1.5 });
    expect(s.defaults).toEqual({ photos: { colour: 'bw', paper: 'A4' }, documents: { colour: 'bw' } });
    expect(s.photoPaperReminder).toBe(true);
    expect(s.edges).toBe('more');
    expect(s.screenshotsUntil).toBe(0);
  });

  // Owner, 2026-10-24: "default margin layout must be narrow, same as Word" (Word's Margins menu, by its names).
  it('Margins: Narrow by default, the three Word choices, old settings read as Narrow', () => {
    expect(DEFAULT_SETTINGS.margins).toBe('narrow');
    expect(MARGIN_MM).toEqual({ narrow: 12.7, normal: 25.4, small: 6 });
    for (const m of ['narrow', 'normal', 'small'] as const) expect(normalizeSettings({ margins: m }).margins).toBe(m);
    expect(normalizeSettings({ v: 1, edges: 'more' }).margins).toBe('narrow');
    expect(normalizeSettings({ margins: 'wide' }).margins).toBe('narrow');
  });

  it('property: anything at all reads as valid settings, and reading twice changes nothing', () => {
    fc.assert(
      fc.property(fc.anything(), (o) => {
        const s = normalizeSettings(o);
        expect(normalizeSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
        expect(['1h', '1d', '7d']).toContain(s.retention);
        expect(s.passport.count).toBeGreaterThanOrEqual(1);
        for (const v of Object.values(s.passport.prices)) expect(v).toBeGreaterThan(0);
      }),
      { numRuns: 2000, seed: 20261017 },
    );
  });

  it('a price shows only for a count that has one', () => {
    expect(priceFor(DEFAULT_SETTINGS, 5)).toBe(50);
    expect(priceFor(DEFAULT_SETTINGS, 6)).toBeUndefined();
  });
});

describe('paper for photo jobs (Phase 10c)', () => {
  it('A4 unless 4×6 photo paper was chosen', () => {
    expect(DEFAULT_SETTINGS.defaults.photos.paper).toBe('A4');
    expect(normalizeSettings({ defaults: { photos: { colour: 'bw', paper: 'PHOTO_4x6' } } }).defaults.photos).toEqual({
      colour: 'bw',
      paper: 'PHOTO_4x6',
    });
    expect(normalizeSettings({ defaults: { photos: { paper: 'A3' } } }).defaults.photos.paper).toBe('A4');
  });
});
