import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// PLAN §H1 token table and §U Accessibility ("contrast ≥ token table"): measured from the stylesheet, not the comments.
const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');
const token = (name: string): string => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`no colour token --${name}`);
  return m[1] as string;
};

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
/** WCAG 2 contrast ratio. */
const contrast = (a: string, b: string) => {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
};

describe('colour tokens meet the PLAN §H1 table', () => {
  const white = '#ffffff';
  const cases: [string, string, string, number][] = [
    ['text on background', token('text'), token('bg'), 7],
    ['text on cards', token('text'), token('surface'), 7],
    ['helper text on background', token('text-muted'), token('bg'), 7],
    ['helper text on cards', token('text-muted'), token('surface'), 7],
    ['text on information panels', token('text'), token('info-bg'), 7],
    ['button label on primary', white, token('primary'), 7],
    ['primary text on cards', token('primary'), token('surface'), 7],
    ['primary text on background', token('primary'), token('bg'), 7],
    ['PRINT label', white, token('print'), 7],
    ['warning text', token('warn-text'), token('warn-bg'), 7],
    ['error text', token('error-text'), token('error-bg'), 7],
    ['outlines on cards (non-text)', token('border'), token('surface'), 3],
    ['outlines on background (non-text)', token('border'), token('bg'), 3],
    // Phase 13 (Office look): paper previews sit on a light-grey stage; their page labels and notes are text there.
    ['labels on the paper stage', token('text'), token('stage'), 7],
    ['helper text on the paper stage', token('text-muted'), token('stage'), 7],
    // The crop and passport frames keep a dark backdrop: their white frame lines are non-text.
    ['white frame lines on the crop backdrop (non-text)', white, token('desk'), 3],
    ['selected choice: text on its soft background', token('text'), token('primary-soft'), 7],
    ['selected choice: helper text on its soft background', token('text-muted'), token('primary-soft'), 7],
    ['selected choice: outline and ✓ on its soft background', token('primary'), token('primary-soft'), 7],
    // Phase 13 review I2/I7: cards and paper need a visible edge, not only a 6 % shadow (WCAG 1.4.11, low vision).
    ['card edge on the background (non-text)', token('edge'), token('bg'), 3],
    ['card edge on a card (non-text)', token('edge'), token('surface'), 3],
    ['paper edge on the stage (non-text)', token('edge'), token('stage'), 3],
    ['neutral badge glyph (non-text)', token('badge-neutral-fg'), token('badge-neutral-bg'), 3],
    // The PS printer logo (brand v3) on the app background: the mark is non-text, the name on the splash is text.
    ['logo printer on the background (non-text)', token('brand-cobalt'), token('bg'), 3],
    ['logo name on the background', token('brand-ink'), token('bg'), 7],
    // Coloured icon badges on Home (non-text: each tile's title says what it is).
    ['photos badge glyph (non-text)', token('badge-photos-fg'), token('badge-photos-bg'), 3],
    ['passport badge glyph (non-text)', token('badge-passport-fg'), token('badge-passport-bg'), 3],
    ['cards badge glyph (non-text)', token('badge-cards-fg'), token('badge-cards-bg'), 3],
    ['documents badge glyph (non-text)', token('badge-documents-fg'), token('badge-documents-bg'), 3],
    ['Delete button label', white, token('error-text'), 7],
    ['helper text on a pressed tile', token('text-muted'), token('pressed'), 7],
    ['indigo label on a pressed card', token('primary'), token('pressed'), 7],
    ['text on a pressed tile', token('text'), token('pressed'), 7],
  ];
  for (const [what, fg, bg, min] of cases)
    it(`${what}: ≥ ${min}:1`, () => expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min));
});

describe('screens use tokens, not raw colours (review I4)', () => {
  const src = join(__dirname, '..');
  const tsx = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? tsx(join(d, e.name))
        : e.name.endsWith('.tsx') && !e.name.includes('.test.')
          ? [join(d, e.name)]
          : [],
    );
  it('no hex or rgb colour in any screen or component', () => {
    const found = tsx(src).flatMap((f) =>
      (readFileSync(f, 'utf8').match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])|rgba?\(\s*\d/g) ?? []).map(
        (c) => `${f}: ${c}`,
      ),
    );
    expect(found).toEqual([]);
  });
});

describe('components use tokens, not raw colours', () => {
  // White and black (paper, labels on dark buttons, the photo shade) are the only colours written directly.
  const allowed = /^(#fff|#ffffff|#000|#000000|rgb\(0 0 0 \/ \d+%\))$/i;
  const dir = __dirname;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.css') && f !== 'tokens.css'))
    it(file, () => {
      const raw = readFileSync(join(dir, file), 'utf8').match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? [];
      expect(raw.filter((c) => !allowed.test(c))).toEqual([]);
    });
});

describe('medium size (owner, 2026-10-23: "font and components too big, make it medium size")', () => {
  const ui = readFileSync(join(__dirname, 'ui.css'), 'utf8');
  /** The value of [prop] in the first rule whose selector is exactly [selector]. */
  const rule = (sheet: string, selector: string, prop: string) => {
    const lines = sheet.split(/\r?\n/);
    const at = lines.findIndex((l) => l === `${selector} {`);
    if (at < 0) throw new Error(`no rule ${selector}`);
    for (let i = at + 1; i < lines.length && !lines[i]?.startsWith('}'); i++) {
      const line = (lines[i] ?? '').replace(/\/\*.*?\*\//g, '').trim();
      const colon = line.indexOf(':');
      if (line.slice(0, colon) === prop)
        return line
          .slice(colon + 1)
          .trim()
          .replace(/;$/, '');
    }
    return undefined;
  };
  it('body 17 px, titles 24 px, side space 24 px (curved phone sides)', () => {
    expect(rule(css, 'body', 'font-size')).toBe('1.0625rem');
    expect(rule(css, 'h1', 'font-size')).toBe('1.5rem');
    expect(rule(css, ':root', '--gutter')).toBe('24px');
  });
  it('buttons 18 px on 56 px; PRINT 20 px on 60 px; Home tiles 104 px', () => {
    expect(rule(ui, '.btn', 'font-size')).toBe('1.125rem');
    expect(rule(ui, '.btn', 'min-height')).toBe('3.5rem');
    expect(rule(ui, '.btn-print', 'font-size')).toBe('1.25rem');
    expect(rule(ui, '.btn-print', 'min-height')).toBe('3.75rem');
    expect(rule(ui, '.tile-grid .tile', 'min-height')).toBe('6.5rem');
  });
});

// Review M8 (round 3): the WebView floor is Chrome 92 (PLAN §D6). `dvh` needs 108 and `@media not (…)` 104: an older
// WebView drops a rule using them, so the big Adjust preview would quietly not be big.
describe('the stylesheet works on the oldest WebView the app takes (Chrome 92)', () => {
  const ui = readFileSync(join(__dirname, 'ui.css'), 'utf8').replace(/\s+/g, ' ');
  it('dvh only inside @supports (height: 100dvh), after the same rule in vh', () => {
    const blocks = [...ui.matchAll(/@supports \(height: 100dvh\) \{ ([^{}]+?) \{([^{}]*)\} \}/g)];
    expect(blocks.length).toBeGreaterThan(0);
    let rest = ui;
    for (const [whole, selector, body] of blocks) {
      rest = rest.replace(whole, '');
      const fallback = `${selector} { ${(body ?? '').replace(/dvh/g, 'vh').trim()} }`;
      expect(ui.slice(0, ui.indexOf(whole))).toContain(fallback);
    }
    expect(rest).not.toMatch(/\d+dvh/);
  });
  it('no `@media not (…)` (Media Queries 4 negation)', () => {
    expect(ui).not.toMatch(/@media\s+not\s*\(/);
  });
});
