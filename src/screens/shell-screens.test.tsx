import { render } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { Help } from './help/Help';
import { Home } from './home/Home';
import { Problem } from './problem/Problem';
import { Settings } from './settings/Settings';

const go = () => {};
/** HTML-escaped form of catalogue text, as the renderer writes it. */
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('Home (PLAN §H3)', () => {
  const html = render(<Home go={go} />);
  // Phase 14 spec Part 2 adds the fourth job, Aadhaar & ID cards; owner, round 8: Scan pages and Text message.
  it('has exactly six big job tiles, each with its words', () => {
    expect(count(html, /class="tile"/g)).toBe(6);
    for (const t of [en.home.photos, en.home.passport, en.home.documents, en.home.cards, en.home.scan, en.home.text])
      expect(html).toContain(esc(t));
  });
  // Owner, round 4: "remove section from home page 'Customer sent files on WhatsApp?'" (Help keeps the steps).
  it('has no WhatsApp card', () => {
    expect(html).not.toContain('Customer sent files on WhatsApp?');
    expect(html).not.toContain('hint-card');
  });
  it('Help still explains sharing from WhatsApp', () => {
    const help = render(<Help go={go} />);
    for (const step of en.help.shareSteps) expect(help).toContain(esc(step));
  });
  it('keeps owner tools in a separate, smaller section at the bottom', () => {
    expect(html.indexOf(esc(en.home.owner))).toBeGreaterThan(html.indexOf(esc(en.home.recent)));
    expect(html).toContain(esc(en.home.tests));
  });
  it('has the app name as its only h1', () => {
    expect(count(html, /<h1/g)).toBe(1);
    // Its words are exactly the name; the PS printer beside it (brand v3) is hidden from screen readers.
    const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1] ?? '';
    expect(h1.replace(/<svg[^>]*aria-hidden="true"[^>]*>.*?<\/svg>/, '')).toBe('PrintSaathi');
  });
});

describe('other shell screens', () => {
  it('Help shows the WhatsApp steps and the printer rule, with Back and Home', () => {
    const html = render(<Help go={go} />);
    for (const step of en.help.shareSteps) expect(html).toContain(esc(step));
    expect(html).toContain(esc(en.help.printerBody));
    expect(html).toContain('Back');
    expect(html).toContain('Home');
  });
  it('Settings lists every section with its value now (Phase 10b)', () => {
    const html = render(<Settings go={go} />);
    for (const k of [
      'shop',
      'passport',
      'photosPaper',
      'deleteAfter',
      'deleteAll',
      'testPage',
      'screenshots',
      'report',
    ] as const)
      expect(html).toContain(esc(en.settings[k]));
  });
  it('Problem explains what happened and offers a way Home, announced as an alert', () => {
    const html = render(<Problem go={go} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain(esc(en.problem.whatToDo));
    expect(html).toContain(esc(en.problem.goHome));
  });
});
