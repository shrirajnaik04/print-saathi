import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { officeWords } from './office';
import { scanWords } from './scan';

// PLAN §H2.12: words the shopkeeper would not use at the counter. The build fails if any user-facing string uses one.
const BANNED = ['dpi', 'resolution', 'margin', 'mime', 'format', 'aspect', 'render', 'exif', 'pixel', 'orientation'];
const wordStart = (w: string) => new RegExp(String.raw`\b${w}`, 'i');
// The owner's own word for one Settings row (2026-10-24: "narrow margins, same as Word"): Word's menu name, exactly.
const OWNER_WORDS = new Set(['Margins']);
const jargon = (s: string) => !OWNER_WORDS.has(s.trim()) && BANNED.some((w) => wordStart(w).test(s));

const strings = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : [];

describe('string catalogue', () => {
  it('has no jargon in any user-facing string', () => {
    const offenders = strings({ en, scanWords, officeWords }).filter(jargon);
    expect(offenders).toEqual([]);
  });

  it('the lint itself catches a jargon word (guards against a broken regex)', () => {
    expect(BANNED.some((w) => wordStart(w).test('Low resolution photo'))).toBe(true);
  });

  it('has no empty strings', () => {
    expect(strings({ en, scanWords, officeWords }).filter((s) => s.trim() === '')).toEqual([]);
  });
});

/** Words a screen can show without going through the catalogue: string literals and JSX text in .tsx files. */
function visibleTextIn(file: string): string[] {
  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const out: string[] = [];
  for (const m of code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g))
    out.push(m[1] ?? m[2] ?? (m[3] ?? '').replace(/\$\{[^}]*\}/g, ' '));
  for (const m of code.matchAll(/>([^<>{}]+)</g)) out.push(m[1] ?? '');
  return out.filter((t) => /[a-z]{3}/i.test(t) && !/^[\w./@-]+$/.test(t.trim()));
}

const tsxFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory()
      ? tsxFiles(p)
      : p.endsWith('.tsx') && !p.endsWith('.test.tsx') && !p.endsWith('.fixture.tsx')
        ? [p]
        : [];
  });

describe('screens and components (gate review: text outside the catalogue escaped the lint)', () => {
  it('no .tsx file shows a jargon word', () => {
    const offenders = tsxFiles('src').flatMap((f) =>
      visibleTextIn(f)
        .filter(jargon)
        .map((t) => `${f}: ${t.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it('the scanner sees JSX text and string literals', () => {
    expect(BANNED.some((w) => wordStart(w).test(visibleTextIn('src/i18n/jargon-probe.fixture.tsx').join(' ')))).toBe(
      true,
    );
  });
});
