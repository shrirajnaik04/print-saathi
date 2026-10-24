import { describe, expect, it } from 'vitest';
import { decideTurns } from './decide';
import { notADocument, page, stripes, turned } from './pages.testkit';
import { textTurn } from './textTurn';

// Phase 15 (spec Part 3 acceptance) on a labelled generated set: left-aligned pages in all four turns (400), plus
// centred, justified and right-aligned pages and things that are not documents, which must never be turned.
describe('text direction on generated document photos', () => {
  it('turns it applies are right ≥ 98 % of the time over 400 sideways and upside-down pages; abstains otherwise', () => {
    let applied = 0;
    let right = 0;
    let abstained = 0;
    const wrong: string[] = [];
    for (let seed = 1; seed <= 100; seed++) {
      const upright = page(seed);
      for (let k = 0; k < 4; k++) {
        const photo = turned(upright, k);
        const fix = (4 - k) % 4;
        const r = textTurn(photo.grey, photo.w, photo.h);
        if (!r.sure) {
          abstained++;
          continue;
        }
        applied++;
        if (r.turn === fix) right++;
        else wrong.push(`seed ${seed} turned ${k}: said ${r.turn}`);
      }
    }
    const precision = right / Math.max(1, applied);
    // Known limitation (ledger ruling): a page set entirely right-aligned has the same margins as a left-aligned page
    // upside down, so margins alone read it the wrong way round. Measured for the record; Undo is always on screen.
    let rightApplied = 0;
    let rightWrong = 0;
    for (let seed = 300; seed < 330; seed++)
      for (let k = 0; k < 4; k++) {
        const photo = turned(page(seed, 'right'), k);
        const r = textTurn(photo.grey, photo.w, photo.h);
        if (!r.sure) continue;
        rightApplied++;
        if (r.turn !== (4 - k) % 4) rightWrong++;
      }
    console.log(`ROTATE-METRIC right-aligned pages (limitation): applied ${rightApplied}/120, wrong ${rightWrong}`);
    // What the app applies after the rule "text alone turns only a quarter" (review I3), end to end.
    const appliedTurn = (photo: { grey: Uint8Array; w: number; h: number }) =>
      decideTurns([0], new Map([[0, textTurn(photo.grey, photo.w, photo.h)]]), new Map())[0] ?? 0;
    let leftApplied = 0;
    let leftWrong = 0;
    let rApplied = 0;
    let rWrong = 0;
    for (let seed = 1; seed <= 100; seed++)
      for (let k = 0; k < 4; k++) {
        const t = appliedTurn(turned(page(seed), k));
        if (t) leftApplied++;
        if (t && t !== (4 - k) % 4) leftWrong++;
      }
    for (let seed = 300; seed < 330; seed++)
      for (let k = 0; k < 4; k++) {
        const t = appliedTurn(turned(page(seed, 'right'), k));
        if (t) rApplied++;
        if (t && t !== (4 - k) % 4) rWrong++;
      }
    console.log(
      `ROTATE-METRIC applied by the app (quarter turns only): left-aligned ${leftApplied}/400 turned, ${leftWrong} wrong (upside-down pages are left for faces or the shopkeeper); right-aligned ${rApplied}/120 turned, ${rWrong} wrong`,
    );
    console.log(
      `ROTATE-METRIC text: applied ${applied}/400, right ${right} (precision ${precision.toFixed(3)}), abstained ${abstained}; wrong ${wrong.slice(0, 8).join('; ')}`,
    );
    expect(precision).toBeGreaterThanOrEqual(0.98);
    // It must actually help: most sideways pages are turned.
    expect(applied).toBeGreaterThanOrEqual(300);
  });

  it('an upright page is left as it is', () => {
    for (let seed = 200; seed < 230; seed++) {
      const p = page(seed);
      const r = textTurn(p.grey, p.w, p.h);
      expect(r.sure && r.turn !== 0).toBe(false);
    }
  });

  it('centred and justified text: never a wrong turn (centred abstains; justified reads like left-aligned)', () => {
    let applied = 0;
    for (const align of ['centre', 'justified'] as const)
      for (let seed = 300; seed < 330; seed++) {
        const upright = page(seed, align);
        for (let k = 0; k < 4; k++) {
          const photo = turned(upright, k);
          const r = textTurn(photo.grey, photo.w, photo.h);
          if (!r.sure) continue;
          applied++;
          expect(r.turn, `${align} seed ${seed} turned ${k}`).toBe((4 - k) % 4);
        }
      }
    console.log(`ROTATE-METRIC centred and justified: applied ${applied}/240, all right`);
  });

  it('photos that are not documents (blobs, scenes, a blank sheet) are never turned', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const im = notADocument(seed);
      for (let k = 0; k < 4; k++) {
        const photo = turned(im, k);
        expect(textTurn(photo.grey, photo.w, photo.h).sure).toBe(false);
      }
    }
  });

  it('blinds and fences (stripes with uneven ends) are not text: never turned (review I4)', () => {
    let sure = 0;
    for (let seed = 1; seed <= 40; seed++)
      for (const vertical of [false, true]) {
        const im = stripes(seed, vertical);
        for (let k = 0; k < 4; k++) {
          const photo = turned(im, k);
          if (textTurn(photo.grey, photo.w, photo.h).sure) sure++;
        }
      }
    expect(sure).toBe(0);
  });

  it('hostile sizes and bytes never throw', () => {
    expect(textTurn(new Uint8Array(0), 0, 0).sure).toBe(false);
    expect(textTurn(new Uint8Array(10), 100, 100).sure).toBe(false);
    const r = Math.random;
    expect(() =>
      textTurn(
        Uint8Array.from({ length: 64 * 64 }, () => Math.floor(r() * 256)),
        64,
        64,
      ),
    ).not.toThrow();
  });
});
