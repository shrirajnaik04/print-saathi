import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import jpeg from 'jpeg-js';

// PLAN §R5 + Phase 1 exit: every screen at every viewport and text size: no horizontal scroll, nothing outside
// the screen, every control the shopkeeper presses >= 56 px, and no WCAG 2.2 AA violations; text contrast AAA (7:1, PLAN §H1).
const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 360, height: 800 },
  { width: 412, height: 915 },
  { width: 480, height: 1040 },
  { width: 800, height: 360 },
];
const TEXT = [100, 130, 160, 200];
/** Another WhatsApp share arrives now (the mock's test hook). */
// Owner, round 4: leaving an unprinted job asks "Leave this job?"; these tests leave it.
const leave = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: 'Leave this job?' }).getByRole('button', { name: 'Leave', exact: true }).click();
const shareAgain = (page: import('@playwright/test').Page, n: number) =>
  page.evaluate((k) => (globalThis as { __mockShare?: (n: number) => void }).__mockShare?.(k), n);
// Every screen the shopkeeper can reach; Problem has no button yet, so the e2e build opens it by route (?screen=, e2e only).
// Screens reached by taps after a mock share: the url, the buttons to press, and the title to wait for.
type Reach = {
  url: string;
  taps?: (string | RegExp)[];
  title?: string /** A test file the mock asks for. */;
  route?: 'bars';
  /** After the taps, another share of this many photos arrives (New files arrived). */
  share?: number;
};
const SCREENS: Record<string, Reach> = {
  home: { url: '/?screen=home' },
  help: { url: '/?screen=help' },
  settings: { url: '/?screen=settings' },
  problem: { url: '/?screen=problem' },
  tests: { url: '/?screen=tests' },
  // A share of 7 mock photos (landscape ones, a duplicate) opens Received the way a WhatsApp share does.
  received: { url: '/?mockIntake=7', title: 'Files received' },
  homeWithJob: { url: '/?mockIntake=2', taps: ['Home', 'Leave'], title: 'PrintSaathi' },
  recent: { url: '/?mockIntake=2', taps: ['Home', 'Leave', 'Recent jobs'], title: 'Recent jobs' },
  change: { url: '/?mockIntake=3', taps: ['One on each page', 'Change'], title: 'Change' },
  layout: { url: '/?mockIntake=3', taps: ['One on each page', 'Change', /^Layout/], title: 'Layout' },
  pages: { url: '/?mockIntake=6', taps: ['Use more pages', 'Change', /^Pages/], title: 'Pages' },
  copies: { url: '/?mockIntake=2', taps: ['One on each page', 'Change', /^Copies/], title: 'Copies' },
  colour: { url: '/?mockIntake=2', taps: ['One on each page', 'Change', /^Colour/], title: 'Colour' },
  printstyle: { url: '/?mockIntake=2', taps: ['One on each page', 'Change', /^Print style/], title: 'Print style' },
  blackedges: { url: '/?mockIntake=2&mockBars=1', taps: ['One on each page'], title: 'Black edges?', route: 'bars' },
  cropphoto: {
    url: '/?mockIntake=2',
    taps: ['One on each page', 'Change', /^Photos/, 'Photo 1', /^Crop/],
    title: 'Crop photo 1',
  },
  photos: { url: '/?mockIntake=4', taps: ['One on each page', 'Change', /^Photos/], title: 'Photos' },
  phototools: { url: '/?mockIntake=4', taps: ['One on each page', 'Change', /^Photos/, 'Photo 2'], title: 'Photo 2' },
  ready: { url: '/?mockIntake=7', taps: ['One on each page'], title: 'Ready to print' },
  result: { url: '/?mockIntake=3&mockPrint=wrongPaper', taps: ['One on each page', 'PRINT'], title: 'Printing' },
  testpage: { url: '/?screen=testpage' },
  deleteall: { url: '/?screen=deleteall' },
  passportcrop: { url: '/?mockIntake=1', taps: ['Passport photos'], title: 'Fit the face in the frame' },
  passportsize: { url: '/?mockIntake=1', taps: ['Passport photos', 'Next', 'Change', /^Size/], title: 'Size' },
  direction: {
    url: '/?mockIntake=2',
    taps: ['One on each page', 'Change', /^Paper direction/],
    title: 'Paper direction',
  },
  adjust: { url: '/?mockIntake=4', taps: ['All on one page', 'Adjust photos'], title: 'Photo 1 of 4' },
  quality: { url: '/?mockIntake=2', taps: ['One on each page', 'Change', /^Print quality/], title: 'Print quality' },
  adjustpages: { url: '/?mockIntake=1&mockPdfAt=1', taps: ['Adjust pages'] },
  adjustpassport: {
    url: '/?mockIntake=1',
    taps: ['Passport photos', 'Next', 'Adjust passport photo'],
    title: 'Passport photo',
  },
  adjustcards: {
    url: '/?mockIntake=2',
    taps: ['ID card copy', 'Done', 'Done', 'Card copy', /^Real card size/, 'Adjust cards'],
    title: 'Card 1 of 2',
  },
  passportborder: { url: '/?mockIntake=1', taps: ['Passport photos', 'Next', 'Change', /^Border/], title: 'Border' },
  passportcustom: {
    url: '/?screen=settings',
    taps: [/^Passport photos and prices/, /^Custom size/],
    title: 'Custom size',
  },
  // Owner, round 4: each card photo is fitted on its crop screen first (Front, then Back), then the cards.
  cards: { url: '/?mockIntake=2', taps: ['ID card copy', 'Done', 'Done'], title: 'ID card copy' },
  cardsource: { url: '/', taps: [/^Aadhaar & ID cards/], title: 'Where is the card?' },
  fixcorners: { url: '/?mockIntake=2', taps: ['ID card copy'], title: 'Front of the card' },
  cardsize: { url: '/?mockIntake=2', taps: ['ID card copy', 'Done', 'Done', 'Card copy'], title: 'How big?' },
  readyDocument: { url: '/?mockIntake=2&mockPdfAt=2&mockPdfForms=1&mockTier=NONE', title: 'Ready to print' },
  unlock: { url: '/?mockIntake=1&mockPdfAt=1&mockPdfLocked=1', taps: ['Unlock'], title: 'Unlock PDF' },
  docpages: {
    url: '/?mockIntake=1&mockPdfAt=1',
    taps: ['Change', /^Pages to print/],
    title: 'Pages to print',
  },
  docorder: { url: '/?mockIntake=1&mockPdfAt=1', taps: ['Change', /^Page order/], title: 'Page order' },
  doctools: { url: '/?mockIntake=1&mockPdfAt=1', taps: ['Change', /^Page order/, 'Page 2'], title: 'Page 2' },
  whichphoto: { url: '/?mockIntake=3', taps: ['Passport photos'], title: 'Which photo?' },
  newfiles: { url: '/?mockIntake=2', taps: ['One on each page'], share: 3, title: 'New files arrived' },
  settingchoice: {
    url: '/?screen=settings',
    taps: [/^Delete customer files after/],
    title: 'Delete customer files after',
  },
  shopname: { url: '/?screen=settings', taps: [/^Shop name/], title: 'Shop name' },
  passportsettings: {
    url: '/?screen=settings',
    taps: [/^Passport photos and prices/],
    title: 'Passport photos and prices',
  },
  prices: { url: '/?screen=settings', taps: [/^Passport photos and prices/, /^Prices/], title: 'Prices' },
  passportcountsetting: {
    url: '/?screen=settings',
    taps: [/^Passport photos and prices/, /^How many photos/],
    title: 'How many photos',
  },
  photospaper: { url: '/?screen=settings', taps: [/^Paper for photos/], title: 'Paper for photos' },
  screenshots: { url: '/?screen=settings', taps: [/^Allow screenshots/], title: 'Allow screenshots for 15 minutes' },
  report: { url: '/?screen=settings', taps: [/^Send problem report/], title: 'Send problem report' },
  welcome: { url: '/?mockFirstRun=1', title: 'Welcome to PrintSaathi' },
  receiving: { url: '/?screen=receiving', title: 'Receiving files' },
  paperchoice: {
    url: '/?mockIntake=2&mockPhotoPaper=1',
    taps: ['One on each page', 'Change', /^Paper(?! direction| type)/],
    title: 'Paper',
  },
  readyPassport: {
    url: '/?mockIntake=1&mockPhotoPaper=1',
    taps: ['Passport photos', 'Next'],
    title: 'Ready to print',
  },
  passportcount: {
    url: '/?mockIntake=1&mockPhotoPaper=1',
    taps: ['Passport photos', 'Next', 'Change', /^How many photos/],
    title: 'How many photos?',
  },
  // Printed: the check mark and the question (Phase 13 review I4).
  resultSent: { url: '/?mockIntake=3', taps: ['One on each page', 'PRINT'], title: 'Printing' },
  // A test page that was sent while the app was closed: the result view, with what to measure.
  testpageResult: { url: '/?mockPendingTest=1', title: 'Print a test page' },
};

async function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1)
      problems.push(`horizontal scroll: ${doc.scrollWidth} > ${doc.clientWidth}`);
    // A row that slides sideways on its own (Adjust's tools, owner round 3): what is in it is reached by sliding, so it
    // may sit past or at the screen's side; the row itself must still fit the screen (checked like everything else).
    // Adjust's strip of pages (owner, round 5) moves only with ‹ ›: the pages beyond the next are off screen by design.
    const inSlidingRow = (el: Element) => {
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        const x = getComputedStyle(e).overflowX;
        if (x === 'auto' || x === 'scroll' || e.classList.contains('adjust-strip')) return true;
      }
      return false;
    };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('main *'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if ((r.right > window.innerWidth + 1 || r.left < -1) && !inSlidingRow(el))
        problems.push(
          `outside screen: <${el.tagName.toLowerCase()} class="${el.className}"> ${Math.round(r.left)}..${Math.round(r.right)}`,
        );
      if (
        el.scrollWidth > el.clientWidth + 1 &&
        getComputedStyle(el).overflowX === 'hidden' &&
        !el.classList.contains('adjust-strip')
      )
        problems.push(`clipped text: ${el.textContent?.slice(0, 30)}`);
    }
    // A word split across lines (e.g. "Sh|op") is unreadable even when nothing overflows: each word's boxes must
    // share one line. Gate review found Settings broken this way while every other check passed.
    const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? '';
      for (const m of text.matchAll(/\S+/g)) {
        // Skip technical tokens (URLs, user-agent parts) and hyphenated words: a line break after a hyphen is normal.
        if (m[0].length > 24 || m[0].includes('/') || /\w-\w/.test(m[0])) continue;
        const range = document.createRange();
        range.setStart(n, m.index ?? 0);
        range.setEnd(n, (m.index ?? 0) + m[0].length);
        const tops = new Set(
          Array.from(range.getClientRects())
            .filter((r) => r.width > 0)
            .map((r) => Math.round(r.top)),
        );
        if (tops.size > 1) problems.push(`word split across lines: "${m[0]}"`);
      }
    }
    // A pinned (sticky/fixed) bar must not hide the content the shopkeeper is reading: at most 30 % of the screen height.
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('main *'))) {
      const pos = getComputedStyle(el).position;
      if ((pos === 'sticky' || pos === 'fixed') && el.getBoundingClientRect().height > window.innerHeight * 0.3)
        problems.push(
          `pinned bar covers ${Math.round((100 * el.getBoundingClientRect().height) / window.innerHeight)} % of the screen`,
        );
    }
    for (const b of Array.from(document.querySelectorAll<HTMLElement>('main button'))) {
      const r = b.getBoundingClientRect();
      // Controls keep clear of the screen's sides: 24 px side space (owner 2026-10-23: curved sides hide what is closer);
      // 20 px is the floor.
      if (r.width > 0 && (r.left < 20 || r.right > window.innerWidth - 20) && !inSlidingRow(b))
        problems.push(
          `control touches the screen side (${Math.round(r.left)}..${Math.round(r.right)}): ${b.textContent?.trim().slice(0, 30)}`,
        );
      if (r.height < 56)
        problems.push(`small target (${Math.round(r.height)} px): ${b.textContent?.trim().slice(0, 30)}`);
    }
    return problems;
  });
}

for (const vp of VIEWPORTS) {
  for (const text of TEXT) {
    for (const [screen, reach] of Object.entries(SCREENS)) {
      test(`${screen} @ ${vp.width}x${vp.height}, text ${text} %`, async ({ page }) => {
        // The resting layout is measured (Phase 13: a screen slides in for 240 ms; motion has its own tests).
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize(vp);
        if (reach.route === 'bars') await serveBars(page);
        await page.goto(reach.url);
        for (const name of reach.taps ?? []) await page.getByRole('button', { name }).click();
        if (reach.share) {
          await expect(page.locator('main h1')).not.toHaveText('Files received');
          await shareAgain(page, reach.share);
        }
        if (reach.title) await expect(page.locator('main h1')).toHaveText(reach.title);
        await page.evaluate((t) => {
          document.documentElement.style.fontSize = `${t}%`;
        }, text);
        await expect(page.locator('main h1')).toBeVisible();
        await page.evaluate(() => document.fonts.ready); // measure with the real font, not the fallback
        // The text size changed after load: let resize observers (the action bar re-pins itself) run first.
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        expect(await layoutProblems(page)).toEqual([]);
        if (text === 100 || text === 200) {
          const axe = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'wcag2aaa'])
            .analyze();
          expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
        }
      });
    }
  }
}

// Owner, 2026-10-24 round 3 ("left borders are being hidden … I have told so many times"): the screen's sideways clip
// cut the outer side of every card's ring off (Chromium ignores its clip margin unless both axes clip). The test above
// read the CSS; this one reads the painted pixels just outside the left, right and top of every card's ring.
for (const width of [360, 412])
  for (const [screen, reach] of Object.entries(SCREENS))
    test(`every card's edge is painted on its left, right and top: ${screen} @ ${width}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width === 360 ? 800 : 915 });
      if (reach.route === 'bars') await serveBars(page);
      await page.goto(reach.url);
      for (const name of reach.taps ?? []) await page.getByRole('button', { name }).click();
      if (reach.share) {
        await expect(page.locator('main h1')).not.toHaveText('Files received');
        await shareAgain(page, reach.share);
      }
      if (reach.title) await expect(page.locator('main h1')).toHaveText(reach.title);
      await expect(page.locator('main h1')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      // Cards drawn with the ring (--edge), wholly on screen, and the points just outside their sides where nothing
      // else is drawn on top (a pinned bar may cover a card: that side is not looked at).
      const spots = await page.evaluate(() => {
        const out: { name: string; side: string; x: number; y: number }[] = [];
        const vw = innerWidth;
        const vh = innerHeight;
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('main *'))) {
          // The 2 px card ring (--ring); paper sheets keep their own 1 px outline.
          if (!getComputedStyle(el).boxShadow.includes('rgb(115, 123, 138) 0px 0px 0px 2px')) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 24 || r.height < 24 || r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) continue;
          const name = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent ?? '').trim().slice(0, 20)}"`;
          const sides = [
            { side: 'left', x: Math.floor(r.left) - 1, y: Math.round(r.top + r.height / 2) },
            { side: 'right', x: Math.ceil(r.right), y: Math.round(r.top + r.height / 2) },
            { side: 'top', x: Math.round(r.left + r.width / 2), y: Math.floor(r.top) - 1 },
          ];
          for (const s of sides) {
            if (s.x < 0 || s.x >= vw || s.y < 0) continue;
            const at = document.elementFromPoint(s.x, s.y);
            if (at && !at.contains(el)) continue; // something else is drawn there
            out.push({ name, ...s });
          }
        }
        return out;
      });
      const shot = jpeg.decode(await page.screenshot({ type: 'jpeg', quality: 100 }), { useTArray: true });
      const lightness = (x: number, y: number) => {
        const i = (y * shot.width + x) * 4;
        return 0.299 * (shot.data[i] ?? 0) + 0.587 * (shot.data[i + 1] ?? 0) + 0.114 * (shot.data[i + 2] ?? 0);
      };
      // The ring is about 123 light; the page about 244, a card 255: a side without its ring reads as the page.
      const missing = spots.filter((s) => lightness(s.x, s.y) > 190).map((s) => `${s.name} ${s.side}`);
      // Home always has its tiles (most screens have cards; some, like Help, have none).
      if (screen === 'home') expect(spots.length).toBeGreaterThan(3);
      expect(missing).toEqual([]);
    });

// Owner, 2026-10-24 ("fix invisible border for the cards, also check other places"; their phone's screenshot of Home):
// every card or tile on the grey page shows its edge — a border or ring of 2 px or more at 3:1 against the page.
for (const [screen, reach] of Object.entries(SCREENS))
  test(`cards show their edges: ${screen}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 360, height: 800 });
    if (reach.route === 'bars') await serveBars(page);
    await page.goto(reach.url);
    for (const name of reach.taps ?? []) await page.getByRole('button', { name }).click();
    if (reach.share) {
      await expect(page.locator('main h1')).not.toHaveText('Files received');
      await shareAgain(page, reach.share);
    }
    if (reach.title) await expect(page.locator('main h1')).toHaveText(reach.title);
    await page.evaluate(() => document.fonts.ready);
    const faint = await page.evaluate(() => {
      const rgba = (s: string) => {
        const v = (s.match(/[\d.]+/g) ?? []).map(Number);
        return { c: v.slice(0, 3), a: v[3] ?? 1 };
      };
      const lum = (c: number[]) => {
        const f = (v: number) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(c[0] ?? 0) + 0.7152 * f(c[1] ?? 0) + 0.0722 * f(c[2] ?? 0);
      };
      const contrast = (a: number[], b: number[]) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
        return (x + 0.05) / (y + 0.05);
      };
      const behindOf = (el: Element) => {
        for (let e = el.parentElement; e; e = e.parentElement) {
          const b = rgba(getComputedStyle(e).backgroundColor);
          if (b.a > 0) return b.c;
        }
        return [255, 255, 255];
      };
      const same = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - (b[i] ?? 0)) < 2);
      const page = [243, 244, 246]; // --bg
      const cards = [
        [255, 255, 255], // --surface
        [229, 231, 235], // --stage
      ];
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll('main *'))) {
        const cs = getComputedStyle(el);
        const bg = rgba(cs.backgroundColor);
        if (bg.a < 1 || !cards.some((c) => same(c, bg.c))) continue;
        if (el.matches(':disabled')) continue; // WCAG 1.4.11 exempts a control that cannot be used now
        const r = el.getBoundingClientRect();
        if (r.width < 48 || r.height < 40) continue;
        const behind = behindOf(el);
        if (!same(behind, page)) continue;
        const bc = rgba(cs.borderTopColor);
        const borderOk =
          Number.parseFloat(cs.borderTopWidth) >= 1.99 &&
          bc.a === 1 &&
          contrast(bc.c, behind) >= 3 &&
          Number.parseFloat(cs.borderLeftWidth) >= 1.99;
        let ringOk = false;
        for (const m of cs.boxShadow.matchAll(
          /(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+([\d.]+)px/g,
        )) {
          const col = rgba(m[1] ?? '');
          if (Number(m[2]) === 0 && Number(m[3]) === 0 && Number(m[4]) === 0 && Number(m[5]) >= 1.99 && col.a === 1)
            ringOk ||= contrast(col.c, behind) >= 3;
        }
        if (!borderOk && !ringOk)
          out.push(
            `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}: ${el.textContent?.trim().slice(0, 30)}`,
          );
      }
      return out;
    });
    expect(faint).toEqual([]);
  });

test('Android-style Back walk: Home -> Help -> Back returns to Home with the page at the top', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.locator('main h1')).toHaveText('Help');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('a job tile whose picker cannot open explains itself where the shopkeeper looks', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/?mockPick=fail');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.getByRole('button', { name: /Photos/ }).click();
  // Feedback must appear where the shopkeeper is looking, even at 200 % text on a small phone (Gate: it was off-screen).
  await expect(page.getByText("Couldn't open the phone's files", { exact: false })).toBeInViewport();
});

test('a WhatsApp share opens Received with numbered photos; a choice not ready yet explains itself', async ({
  page,
}) => {
  await page.goto('/?mockIntake=6');
  await expect(page.locator('main h1')).toHaveText('Files received');
  await expect(page.getByRole('img', { name: /^\d of 6$/ })).toHaveCount(6);
  await expect(page.getByText('These photos are the same: 1 and 4')).toBeVisible();
  await page.getByRole('button', { name: 'Keep both' }).click();
  await expect(page.getByText('These photos are the same')).toHaveCount(0);
  // Every choice works since Phase 9: Print as document prints the photos as pages, black & white.
  await page.getByRole('button', { name: 'Print as document' }).click();
  await expect(page.getByText('6 photos · 6 pages · A4 · Colour · 1 copy')).toBeVisible();
});

test('J1: all on one page in 2 taps — one sheet with every photo, then PRINT', async ({ page }) => {
  await page.goto('/?mockIntake=7');
  await page.getByRole('button', { name: 'All on one page' }).click();
  await expect(page.getByText('7 photos · 1 page · A4 · Colour · 1 copy')).toBeVisible();
  await expect(page.getByRole('figure')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'PRINT' })).toBeEnabled();
});

test('J2: "exactly 3 pages" is Change → Pages → 3, back on Ready with 3 sheets', async ({ page }) => {
  await page.goto('/?mockIntake=6');
  await page.getByRole('button', { name: 'Use more pages' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Pages/ }).click();
  await page.getByRole('button', { name: /^3 pages/ }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('6 photos · 3 pages', { exact: false })).toBeVisible();
  await expect(page.getByRole('figure')).toHaveCount(3);
});

test('Layout can be changed from Ready; the chosen one says Selected', async ({ page }) => {
  await page.goto('/?mockIntake=4');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Layout/ }).click();
  await expect(page.getByRole('button', { name: /One on each page.*Selected/ })).toBeVisible();
  await page.getByRole('button', { name: /^All on one page/ }).click();
  await expect(page.getByText('4 photos · 1 page', { exact: false })).toBeVisible();
});

test('Copies: big − / +, never below 1, the summary follows', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Copies/ }).click();
  await expect(page.getByRole('button', { name: 'Fewer copies' })).toBeDisabled();
  await page.getByRole('button', { name: 'More copies' }).click();
  await page.getByRole('button', { name: 'More copies' }).click();
  await expect(page.locator('output')).toHaveText('3');
  await page.getByRole('button', { name: 'Fewer copies' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('2 photos · 2 pages · A4 · Colour · 2 copies')).toBeVisible();
});

// 60 phone photos on one A4 come out about 2.3 cm (30 still fit at about 3 cm, above the 2.5 cm warning).
test('60 photos on one page warns they will be very small, and Use more pages fixes it', async ({ page }) => {
  await page.goto('/?mockIntake=60');
  await page.getByRole('button', { name: 'All on one page' }).click();
  await expect(page.getByText('Photos will be very small', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Use more pages' }).click();
  await expect(page.getByText('Photos will be very small', { exact: false })).toHaveCount(0);
  await expect(page.getByText(/60 photos · [2-9] pages/)).toBeVisible();
});

test('One on each page -> Ready shows every sheet and the summary -> PRINT -> sent -> Yes, done goes Home', async ({
  page,
}) => {
  await page.goto('/?mockIntake=3');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('3 photos · 3 pages · A4 · Colour · 1 copy')).toBeVisible();
  // The 3rd mock photo is wide: it stays on upright paper unless Landscape is chosen (owner, 2026-10-23).
  await expect(page.getByRole('figure')).toHaveCount(3);
  await expect(page.getByRole('figure', { name: 'Page 3 of 3', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'PRINT' }).click();
  await expect(page.locator('main h1')).toHaveText('Printing');
  await expect(page.getByText('Sent to the printer ✓')).toBeVisible();
  await expect(page.getByText('Did it print correctly?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, done' }).click();
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
});

test('wrong paper: nothing printed, the reason, and Print again returns to Ready', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockPrint=wrongPaper');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT' }).click();
  await expect(page.getByText('Nothing was printed. The paper size was wrong.', { exact: false })).toBeVisible();
  await expect(page.getByText('Did it print correctly?')).toHaveCount(0);
  await page.getByRole('button', { name: 'Print again' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  // Back from Ready goes to Received, not to a second Ready or the old Result.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
});

test('"No" after printing shows what to check and offers Print again', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT' }).click();
  await page.getByRole('button', { name: 'No' }).click();
  await expect(page.getByText('Check the paper and the ink', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print again' })).toBeVisible();
});

test('an unprinted job is offered on Home as Continue and listed in Recent jobs', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await expect(page.locator('main h1')).toHaveText('Files received');
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await page.getByRole('button', { name: /Continue the last job/ }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await page.getByRole('button', { name: 'Recent jobs' }).click();
  await expect(page.getByRole('button', { name: /^2 files.*Not printed yet/ })).toBeVisible();
});

// Release cold starts (2026-10-24): Home came 1.4 s later than in 1.0.176 because the splash waited for its animation
// to finish (which stalled while the code loaded). The splash now only plays while the app loads: it goes as soon as
// the first screen is up, never later.
test('the splash prints the PS printer while the app loads and never holds Home back (owner, 2026-10-23)', async ({
  page,
}) => {
  // The page arrives with the printer, its sheet and its page, drawn before any code runs.
  const html = await (await page.request.get('/')).text();
  for (const layer of ['id="splash"', 'splash-paper', 'splash-page', 'splash-word']) expect(html).toContain(layer);
  await page.goto('/?splash=1');
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 700 });
  await expect(page.getByRole('button', { name: /^Photos/ })).toBeEnabled();
  // The phone is told, so the page goes solid and nothing is drawn under it any more (device check 2026-10-24).
  await expect.poll(() => page.evaluate(() => (globalThis as { __splashGone?: boolean }).__splashGone)).toBe(true);
});

// Owner, 2026-10-24 ("app logo isn't proper on splash screen"): the sheet fed in from nowhere and the tray printed from
// nothing while the app loaded, so a fast phone only ever showed half a logo. Every frame now shows the whole logo.
test('the splash shows the whole logo at every moment of its motion', async ({ page }) => {
  // Hold the app's code back so the splash stays up to be looked at.
  await page.route('**/assets/*.js', async (route) => {
    await new Promise((ok) => setTimeout(ok, 3000));
    await route.continue();
  });
  await page.goto('/?splash=1', { waitUntil: 'commit' });
  await page.locator('.splash-paper').waitFor({ state: 'attached' });
  const frames = await page.evaluate(() => {
    const out: { layer: string; t: number; opacity: number; scaleY: number; dyPct: number }[] = [];
    const stage = (document.querySelector('.splash-stage') as HTMLElement).getBoundingClientRect().height;
    for (const el of document.querySelectorAll<HTMLElement>('.splash-layer')) {
      const anims = el.getAnimations();
      const end = Math.max(0, ...anims.map((a) => Number(a.effect?.getComputedTiming().endTime ?? 0)));
      for (let t = 0; t <= end; t += 20) {
        for (const a of anims) {
          a.pause();
          a.currentTime = t;
        }
        const s = getComputedStyle(el);
        const m = new DOMMatrixReadOnly(s.transform === 'none' ? undefined : s.transform);
        out.push({ layer: el.className, t, opacity: Number(s.opacity), scaleY: m.d, dyPct: (100 * m.f) / stage });
      }
    }
    return out;
  });
  expect(frames.length).toBeGreaterThan(4);
  for (const f of frames) {
    expect(f.opacity, `${f.layer} at ${f.t} ms`).toBe(1);
    expect(f.scaleY, `${f.layer} at ${f.t} ms`).toBeGreaterThan(0.999);
    expect(Math.abs(f.dyPct), `${f.layer} at ${f.t} ms`).toBeLessThanOrEqual(5);
  }
});

test('with Remove animations on there is no splash at all', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?splash=1');
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 300 });
  await expect.poll(() => page.evaluate(() => (globalThis as { __splashGone?: boolean }).__splashGone)).toBe(true);
  // No page splash to hand over to: the phone keeps its own splash until the first screen is up.
  const steps = await page.evaluate(() => (globalThis as { __splashSteps?: string[] }).__splashSteps);
  expect(steps).toEqual(['gone']);
});

// Device recording, 2026-10-24 (API 35): Android's splash faded out before the page had drawn its own, so the logo
// dipped to almost nothing for ~0.2 s between the two. The page now tells the phone the moment its splash is on screen
// (the phone holds its splash until then and removes it without a fade).
test('the page tells the phone when its own splash is on screen, before the splash goes', async ({ page }) => {
  await page.goto('/?splash=1');
  await expect.poll(() => page.evaluate(() => (globalThis as { __splashGone?: boolean }).__splashGone)).toBe(true);
  const steps = await page.evaluate(() => (globalThis as { __splashSteps?: string[] }).__splashSteps);
  // Told while the page's splash was still there, then told it had gone.
  expect(steps).toEqual(['shown with the splash', 'gone']);
});

test('Home shows the PS printer beside the name; screen readers hear only "PrintSaathi"', async ({ page }) => {
  await page.goto('/');
  const title = page.locator('main h1');
  await expect(title).toHaveText('PrintSaathi');
  await expect(title.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('heading', { level: 1, name: 'PrintSaathi', exact: true })).toBeVisible();
});

test('Continue the last job sits under the four job tiles (owner, 2026-10-23)', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await expect(page.locator('main h1')).toHaveText('Files received');
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  const cont = await page.getByRole('button', { name: /Continue the last job/ }).boundingBox();
  const cards = await page.getByRole('button', { name: /^Aadhaar & ID cards/ }).boundingBox();
  const docs = await page.getByRole('button', { name: /^Documents & PDF/ }).boundingBox();
  expect(cont && cards && docs && cont.y >= Math.max(cards.y + cards.height, docs.y + docs.height)).toBe(true);
});

test('a printed job is no longer offered as Continue', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT' }).click();
  await page.getByRole('button', { name: 'Yes, done' }).click();
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await expect(page.getByRole('button', { name: 'Recent jobs' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue the last job/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Recent jobs' }).click();
  await expect(page.getByRole('button', { name: /^[0-9]+ files? .*Printed ✓/ })).toBeVisible();
});

test('after two crashes the app opens safely: an explanation, and new files do not open by themselves', async ({
  page,
}) => {
  await page.goto('/?mockSafeStart=1&mockIntake=2');
  await expect(page.getByText('PrintSaathi stopped by itself twice.', { exact: false })).toBeVisible();
  // Give the share time to be taken into a job: it must not open over the explanation.
  await page.waitForTimeout(800);
  await expect(page.locator('main h1')).toHaveText('Something went wrong');
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('button', { name: /Continue the last job/ })).toBeVisible();
});

test('reopening within 30 minutes returns to the same screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.locator('main h1')).toHaveText('Help');
  await page.reload();
  await expect(page.locator('main h1')).toHaveText('Help');
});

test('a job that was already deleted explains itself instead of a blank screen', async ({ page }) => {
  for (const screen of ['received', 'ready']) {
    await page.goto(`/?screen=${screen}`);
    await expect(page.getByText('This job is no longer here.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Go to Home' }).click();
    await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  }
});

test('right after the print screen closes the app keeps checking, then reports what the printer did', async ({
  page,
}) => {
  await page.goto('/?mockIntake=1&mockPrint=checking,checking,printing,sent');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT' }).click();
  // Never "nothing printed" while Android is still settling the job (gate review #5).
  await expect(page.getByText('Sent to the printer ✓ It is printing now.')).toBeVisible();
  await expect(page.getByText('Nothing was printed', { exact: false })).toHaveCount(0);
  // The Result screen keeps asking while the printer works, and updates itself.
  await expect(page.getByText('Sent to the printer ✓', { exact: true })).toBeVisible({ timeout: 6000 });
});

test('the same files shared again within a minute open the job they already made', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockRepeat=1');
  await expect(page.locator('main h1')).toHaveText('Files received');
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await expect(page.locator('main h1')).toHaveText('Files received', { timeout: 5000 });
});

test('a photo that cannot be opened is named on Ready, never silently left out', async ({ page }) => {
  await page.goto('/?mockIntake=3&mockDamaged=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByText('2 photos · 2 pages', { exact: false })).toBeVisible();
  await expect(page.getByText("1 photo can't be opened, so it is left out.", { exact: false })).toBeVisible();
});

test('a repeat share while that job is already on screen does not stack it twice', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockRepeat=1');
  await expect(page.locator('main h1')).toHaveText('Files received');
  await page.waitForTimeout(2500); // the repeat arrives meanwhile
  await page.getByRole('button', { name: 'Back' }).click();
  await leave(page);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
});

test('Result keeps asking while the printer works, even when the answer repeats', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPrint=printing,printing,printing,blocked');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT' }).click();
  await expect(page.getByText('Sent to the printer ✓ It is printing now.')).toBeVisible();
  await expect(page.getByText('The printer needs attention.', { exact: false })).toBeVisible({ timeout: 8000 });
});

test('if the start-up checks fail, shares are still taken', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockStartFail=1');
  await expect(page.locator('main h1')).toHaveText('Files received');
});

test('a photo the engine could not open just now offers Try again, not "ask the customer"', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockRetry=2');
  await expect(page.getByText("Couldn't open this photo just now.")).toBeVisible();
  await expect(page.getByText('This photo is damaged', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText("Couldn't open this photo just now.")).toHaveCount(0);
  await expect(page.getByRole('img', { name: /^\d of 2$/ })).toHaveCount(2);
});

/** The mock photos show their number; this reads which photo each grid tile shows, in order. */
async function photoNumbers(page: import('@playwright/test').Page) {
  const srcs = await page.locator('.thumb-grid img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
  return srcs.map((s) => Number(decodeURIComponent(s).match(/>(\d+)<\/text>/)?.[1]));
}

async function openPhotos(page: import('@playwright/test').Page, n: number) {
  await page.goto(`/?mockIntake=${n}`);
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Photos/ }).click();
  await expect(page.locator('main h1')).toHaveText('Photos');
}

test('Turn: a portrait photo turned once prints turned (on upright paper), shown turned', async ({ page }) => {
  // The plan drawing is checked here (no file preview), so the turned photo itself is what is asserted.
  await page.goto('/?mockIntake=2&mockNoPreview=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Photos/ }).click();
  await page.getByRole('button', { name: 'Photo 1' }).click();
  await page.getByRole('button', { name: 'Turn' }).click();
  await expect(page.locator('.tool-preview img')).toHaveClass(/turn-1/);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Done' }).click(); // Photos -> Change
  await page.getByRole('button', { name: 'Done' }).click(); // Change -> Ready
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByRole('figure', { name: 'Page 1 of 2', exact: true })).toBeVisible();
  // ... and Ready's own preview draws the photo turned (gate review: the old check stopped at the page).
  await expect(page.getByRole('figure', { name: 'Page 1 of 2', exact: true }).locator('.paper-turned img')).toHaveCount(
    1,
  );
});

test('Move earlier / later changes the print order; at the ends the button is off', async ({ page }) => {
  await openPhotos(page, 3);
  await expect.poll(() => photoNumbers(page)).toEqual([1, 2, 3]);
  await page.getByRole('button', { name: 'Photo 3' }).click();
  await expect(page.getByRole('button', { name: 'Move later' })).toBeDisabled();
  await page.getByRole('button', { name: 'Move earlier' }).click();
  await expect(page.locator('main h1')).toHaveText('Photo 2');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => photoNumbers(page)).toEqual([1, 3, 2]);
});

test('Remove then Undo brings the photo back in its place', async ({ page }) => {
  await openPhotos(page, 3);
  await page.getByRole('button', { name: 'Photo 2' }).click();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Photo removed.')).toBeVisible();
  await expect.poll(() => photoNumbers(page)).toEqual([1, 3]);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Photo removed.')).toHaveCount(0);
  await expect.poll(() => photoNumbers(page)).toEqual([1, 2, 3]);
});

test('removing the only photo never breaks Ready: it says nothing can be printed', async ({ page }) => {
  await openPhotos(page, 1);
  await page.getByRole('button', { name: 'Photo 1' }).click();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Photo removed.')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('Nothing here can be printed yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'PRINT' })).toHaveCount(0);
});

test('a change that cannot be saved says so instead of a dead tap', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockSaveFail=1');
  await page.getByRole('button', { name: 'All on one page' }).click();
  await expect(page.getByText("Couldn't save this change.", { exact: false })).toBeVisible();
  await expect(page.locator('main h1')).toHaveText('Files received');
});

// Phase 7: photos with a PDF are a document (PLAN §I-2), so the photo screens never see a hidden file now; the
// "skip files not shown" rule of moveItem stays covered by vitest (job.test: move earlier / later skips …).
test('photos shared with a PDF are reordered as pages, PDF pages included', async ({ page }) => {
  await page.goto('/?mockIntake=3&mockPdfAt=2');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Page order/ }).click();
  await expect(page.getByRole('button', { name: /^File \d+, page/ })).toHaveCount(5);
});

test('a double tap on Remove removes once and lands on Photos with Undo', async ({ page }) => {
  await page.goto('/?mockIntake=3&mockSlowSave=400');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Photos/ }).click();
  await page.getByRole('button', { name: 'Photo 2' }).click();
  await page.getByRole('button', { name: 'Remove' }).dblclick({ delay: 100 });
  // Let both taps' saves finish: an unguarded second tap would go Back a second time, to Change.
  await page.waitForTimeout(1500);
  await expect(page.locator('main h1')).toHaveText('Photos');
  await expect(page.getByText('Photo removed.')).toBeVisible();
  await expect.poll(() => photoNumbers(page)).toEqual([1, 3]);
});

test('exactly N pages that make photos tiny also warn; "Keep it like this" is remembered', async ({ page }) => {
  await page.goto('/?mockIntake=60');
  await page.getByRole('button', { name: 'Use more pages' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Pages/ }).click();
  await page.getByRole('button', { name: /^1 page/ }).click();
  await expect(page.getByText('Photos will be very small', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Keep it like this' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('Photos will be very small', { exact: false })).toHaveCount(0);
});

test('Undo survives opening another photo, and is gone after leaving Photos', async ({ page }) => {
  await openPhotos(page, 3);
  await page.getByRole('button', { name: 'Photo 1' }).click();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Photo removed.')).toBeVisible();
  await page.getByRole('button', { name: 'Photo 1' }).click(); // the next photo, now first
  await page.getByRole('button', { name: 'Turn' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Photo removed.')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click(); // leave Photos
  await page.getByRole('button', { name: /^Photos/ }).click();
  await expect(page.locator('main h1')).toHaveText('Photos');
  await expect(page.getByText('Photo removed.')).toHaveCount(0);
});

test('"Keep" for small photos counts for that arrangement only', async ({ page }) => {
  await page.goto('/?mockIntake=60');
  await page.getByRole('button', { name: 'All on one page' }).click();
  await page.getByRole('button', { name: 'Keep 1 page' }).click();
  await expect(page.getByText('Photos will be very small', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Layout/ }).click();
  await page.getByRole('button', { name: /^Use more pages/ }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Pages/ }).click();
  await page.getByRole('button', { name: /^1 page/ }).click();
  await expect(page.getByText('Photos will be very small', { exact: false })).toBeVisible();
});

test('Colour → Black & white: the summary says so and the sheets are drawn grey', async ({ page }) => {
  // The drawn sheets are checked here (no file preview), so the grey drawing itself is what is asserted (F6).
  await page.goto('/?mockIntake=2&mockNoPreview=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Colour/ }).click();
  await expect(page.getByRole('button', { name: /^Colour.*Selected/ })).toBeVisible();
  await page.getByRole('button', { name: /^Black & white/ }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('2 photos · 2 pages · A4 · Black & white · 1 copy')).toBeVisible();
  await expect(page.locator('figure.paper-grey')).toHaveCount(2);
});

test('Ready swaps the drawn sheets for the real print file pages once the file is made', async ({ page }) => {
  await page.goto('/?mockIntake=3');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('.file-page img')).toHaveCount(3);
  // Landscape chosen: a sideways page's file image is turned for display, so it reads upright.
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Paper direction/ }).click();
  await page.getByRole('button', { name: /^Landscape/ }).click();
  await expect(page.locator('.file-page img')).toHaveCount(3);
  await expect(
    page.getByRole('figure', { name: 'Page 3 of 3, Sideways page' }).locator('.file-page img'),
  ).toHaveAttribute('style', /rotate\(90deg\)/);
});

test('without a preview the plan drawing stays (nothing blank)', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockNoPreview=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByRole('button', { name: 'PRINT' })).toBeEnabled();
  await expect(page.locator('.file-page')).toHaveCount(0);
  await expect(page.locator('figure img.paper-photo')).toHaveCount(2);
});

test('after changing to Black & white, Ready shows the new file pages, never the old colour ones', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('.file-page img').first()).toHaveAttribute('src', /colour/);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Colour/ }).click();
  await page.getByRole('button', { name: /^Black & white/ }).click();
  await expect(page.locator('.file-page img')).toHaveCount(2);
  for (const src of await page
    .locator('.file-page img')
    .evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src)))
    expect(decodeURIComponent(src)).toContain('bw');
});

test('the drawn black & white grey is Rec.601, the same grey the print uses', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await page.waitForSelector('#rec601', { state: 'attached' });
  // Pure red through the page's grey filter must come out 76 (0.299 x 255), as in the print file (CSS grayscale: 54).
  const red = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.filter = 'url(#rec601)';
    ctx.fillStyle = 'rgb(255,0,0)';
    ctx.fillRect(0, 0, 4, 4);
    return Array.from(ctx.getImageData(1, 1, 1, 1).data.slice(0, 3));
  });
  expect(red.every((v) => Math.abs(v - 76) <= 1)).toBe(true);
});

test('one page the engine could not show stays drawn; the pages after it still show the real file', async ({
  page,
}) => {
  await page.goto('/?mockIntake=3&mockNoPreviewAt=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByRole('figure', { name: /^Page 3 of 3/ }).locator('.file-page img')).toHaveCount(1);
  await expect(page.getByRole('figure', { name: /^Page 1 of 3/ }).locator('.file-page img')).toHaveCount(1);
  await expect(page.getByRole('figure', { name: /^Page 2 of 3/ }).locator('.file-page')).toHaveCount(0);
  await expect(page.getByRole('figure', { name: /^Page 2 of 3/ }).locator('img.paper-photo')).toHaveCount(1);
});

test('a change made on Ready itself never shows the old file pages for the new plan', async ({ page }) => {
  await page.goto('/?mockIntake=60&mockSlowPreview=400');
  await page.getByRole('button', { name: 'All on one page' }).click();
  await expect(page.locator('.file-page img')).toHaveCount(1);
  const oldSrc = decodeURIComponent((await page.locator('.file-page img').getAttribute('src')) ?? '');
  const oldHash = oldSrc.match(/[0-9a-f]{16}/)?.[0] ?? 'none';
  await page.getByRole('button', { name: 'Use more pages' }).click();
  await expect(page.getByText(/60 photos · [2-9] pages/)).toBeVisible();
  // From the moment the new plan is on screen, no page may show the old file, while the new pages arrive slowly.
  for (let i = 0; i < 8; i++) {
    const srcs = await page.locator('.file-page img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
    for (const src of srcs) expect(decodeURIComponent(src)).not.toContain(oldHash);
    await page.waitForTimeout(150);
  }
});

test("previews stop while Android's print screen is open (the engine is left free for printing)", async ({ page }) => {
  await page.goto('/?mockIntake=6&mockSlowPreview=300&mockDialogMs=3000');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('.file-page img').first()).toBeVisible();
  await page.getByRole('button', { name: 'PRINT' }).click();
  const atPrint = await page.evaluate(() => (globalThis as { __previewCalls?: number }).__previewCalls ?? 0);
  await page.waitForTimeout(2000);
  const later = await page.evaluate(() => (globalThis as { __previewCalls?: number }).__previewCalls ?? 0);
  expect(later - atPrint).toBeLessThanOrEqual(1); // at most the one already asked for
});

test('black & white sheets use the Rec.601 filter, not CSS grayscale', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockNoPreview=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Colour/ }).click();
  await page.getByRole('button', { name: /^Black & white/ }).click();
  await expect(page.locator('figure.paper-grey')).toHaveCount(2);
  const filters = await page
    .locator('figure.paper-grey img')
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).filter));
  expect(filters.length).toBeGreaterThan(0);
  for (const f of filters) expect(f).toContain('#rec601');
});

test('Settings → Print a test page on A4: sent, then what to measure', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: /^Print a test page/ }).click();
  await expect(page.locator('main h1')).toHaveText('Print a test page');
  await page.getByRole('button', { name: /^A4 paper/ }).click();
  await expect(page.getByText('Sent to the printer ✓')).toBeVisible();
  await expect(page.getByText('Measure the black square', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('main h1')).toHaveText('Settings');
});

test('a 4×6 test page says when the photo paper was found and saved', async ({ page }) => {
  await page.goto('/?mockPhotoPaper=1');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: /^Print a test page/ }).click();
  await page.getByRole('button', { name: /^4×6 photo paper/ }).click();
  await expect(page.getByText('4×6 photo paper is saved for passport photos', { exact: false })).toBeVisible();
});

test('a test page saved as a file says so and asks for nothing to be measured', async ({ page }) => {
  await page.goto('/?mockPrint=savedAsFile');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: /^Print a test page/ }).click();
  await page.getByRole('button', { name: /^A4 paper/ }).click();
  await expect(page.getByText('This was saved as a file, not printed', { exact: false })).toBeVisible();
  await expect(page.getByText('Measure the black square', { exact: false })).toHaveCount(0);
});

test('a test print still open when the app was closed comes back as a test page, not a customer job', async ({
  page,
}) => {
  await page.goto('/?mockPendingTest=1');
  await expect(page.locator('main h1')).toHaveText('Print a test page');
  await expect(page.getByText('Sent to the printer ✓')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print again' })).toBeVisible();
});

test('41 pages print in 2 parts: part 1 is 40 pages, then part 2, and the job counts as printed only at the end', async ({
  page,
}) => {
  await page.goto('/?mockIntake=41');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByText('Prints in 2 parts', { exact: false })).toBeVisible();
  await expect(page.locator('ol.sheets > li')).toHaveCount(40);
  await page.getByRole('button', { name: 'PRINT PART 1 OF 2' }).click();
  await expect(page.getByText('Did it print correctly?')).toBeVisible();
  // Not finished yet: Home still offers to continue this job.
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByText('Continue the last job')).toBeVisible();
});

test('after part 1, Yes goes straight to part 2; after the last part the job is done', async ({ page }) => {
  await page.goto('/?mockIntake=41');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT PART 1 OF 2' }).click();
  await page.getByRole('button', { name: /Yes, print part 2 of 2/ }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.locator('ol.sheets > li')).toHaveCount(1);
  await page.getByRole('button', { name: 'PRINT PART 2 OF 2' }).click();
  await page.getByRole('button', { name: 'Yes, done' }).click();
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await expect(page.getByText('Continue the last job')).toHaveCount(0);
});

test('40 pages are one ordinary print, no parts', async ({ page }) => {
  await page.goto('/?mockIntake=40');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByRole('button', { name: 'PRINT', exact: true })).toBeVisible();
  await expect(page.getByText('Prints in', { exact: false })).toHaveCount(0);
});

test('a part still printing when the app was closed comes back as that part, not as the whole job done', async ({
  page,
}) => {
  await page.goto('/?mockPendingPart=1');
  await expect(page.locator('main h1')).toHaveText('Printing');
  await expect(page.getByRole('button', { name: /Yes, print part 2 of 2/ })).toBeVisible();
});

test('Delete all customer files asks first; Cancel keeps everything', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: /^Delete all customer files now/ }).click();
  await expect(page.locator('main h1')).toHaveText('Delete all customer files?');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('main h1')).toHaveText('Settings');
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByText('Continue the last job')).toBeVisible();
});

test('Delete all customer files deletes the jobs and says so', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: /^Delete all customer files now/ }).click();
  await page.getByRole('button', { name: 'Delete all' }).click();
  await expect(page.getByText('Customer files deleted', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByText('Continue the last job')).toHaveCount(0);
});

test('after part 1 printed, leaving and coming back continues with part 2 (never part 1 again)', async ({ page }) => {
  await page.goto('/?mockIntake=41');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT PART 1 OF 2' }).click();
  await expect(page.getByText('Did it print correctly?')).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByText('Continue the last job').click();
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByRole('button', { name: 'PRINT PART 2 OF 2' })).toBeVisible();
  await expect(page.locator('ol.sheets > li')).toHaveCount(1);
});

test('a job changed after part 1 printed says so and prints from the start', async ({ page }) => {
  await page.goto('/?mockIntake=41');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT PART 1 OF 2' }).click();
  await expect(page.getByText('Did it print correctly?')).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByText('Continue the last job').click();
  await page.getByRole('button', { name: 'Use more pages' }).click();
  await expect(page.getByText('The job changed after part 1 was printed', { exact: false })).toBeVisible();
});

test('a 4×6 test page on the wrong paper says to choose 4×6 or 10×15 cm (or that passport photos will use A4)', async ({
  page,
}) => {
  await page.goto('/?mockPrint=wrongPaper');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: /^Print a test page/ }).click();
  await page.getByRole('button', { name: /^4×6 photo paper/ }).click();
  await expect(page.getByText('choose 4×6 (or 10×15 cm) at Paper size', { exact: false })).toBeVisible();
  await expect(page.getByText("don't change anything", { exact: false })).toHaveCount(0);
});

test('a test print still being checked when the app opens keeps asking until it knows', async ({ page }) => {
  await page.goto('/?mockPendingTest=1&mockPrint=checking,checking,sent');
  await expect(page.locator('main h1')).toHaveText('Print a test page');
  await expect(page.getByText('Sent to the printer ✓')).toBeVisible({ timeout: 10000 });
});

test('Delete all says when a job being printed was kept', async ({ page }) => {
  await page.goto('/?mockKeptOnDelete=1');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: /^Delete all customer files now/ }).click();
  await page.getByRole('button', { name: 'Delete all' }).click();
  await expect(page.getByText('is kept until it finishes', { exact: false })).toBeVisible();
});

test('a change made while on part 2 starts again from part 1 (the part number belonged to the old plan)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=41');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT PART 1 OF 2' }).click();
  await page.getByRole('button', { name: /Yes, print part 2 of 2/ }).click();
  await expect(page.getByRole('button', { name: 'PRINT PART 2 OF 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Copies/ }).click();
  await page
    .getByRole('button', { name: /More|\+/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('The job changed after part 1 was printed', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /^PRINT PART 1 OF/ })).toBeVisible();
});

test('if the part cannot be saved, the print screen does not open and Ready says so', async ({ page }) => {
  await page.goto('/?mockIntake=41&mockSaveFail=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT PART 1 OF 2' }).click();
  await expect(page.getByText("Couldn't save", { exact: false })).toBeVisible();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
});

test('a 4×6 test page made at another size than the printer’s photo paper asks for one more print to measure', async ({
  page,
}) => {
  await page.goto('/?mockPhotoPaper=1&mockRemeasure=1');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: /^Print a test page/ }).click();
  await page.getByRole('button', { name: /^4×6 photo paper/ }).click();
  await expect(page.getByText('Print the 4×6 test page once more', { exact: false })).toBeVisible();
});

test('after a restart mid-part, the next part keeps the plan it belongs to (re-review N5)', async ({ page }) => {
  await page.goto('/?mockPendingPart=1');
  await page.getByRole('button', { name: /Yes, print part 2 of 2/ }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('ps.nav') ?? '{}').stack ?? [];
        return s[s.length - 1];
      }),
    )
    .toMatchObject({ name: 'ready', params: { part: 1, partOf: 'fedcba9876543210' } });
});

test('J4: 5 passport photos in 3 taps on the shop printer’s 4×6 photo paper', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPhotoPaper=1&mockNoPreview=1');
  await page.getByRole('button', { name: 'Passport photos' }).click(); // 1
  await expect(page.locator('main h1')).toHaveText('Fit the face in the frame');
  await page.getByRole('button', { name: 'Next' }).click(); // 2
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('5 passport photos · 4×6 photo paper · Colour · 1 sheet · Charge ₹50')).toBeVisible();
  await expect(page.getByText('Put 4×6 photo paper in the printer', { exact: false })).toBeVisible();
  await expect(page.locator('figure .paper-crop')).toHaveCount(5);
  await page.getByRole('button', { name: 'PAPER LOADED — PRINT' }).click(); // 3
  await expect(page.locator('main h1')).toHaveText('Printing');
});

test('without saved 4×6 photo paper, passport photos print on A4 and say why', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('5 passport photos · A4 · Colour · 1 sheet · Charge ₹50')).toBeVisible();
  await expect(page.getByText('on A4 paper', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PRINT', exact: true })).toBeVisible();
});

// The five tests below were dropped by mistake in ad280f0 (whole-branch review I2, 2026-10-24) and are restored.
test('How many photos? 8 on 4×6 photo paper: 2 sheets, and no price (only 5 has one)', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPhotoPaper=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^How many photos/ }).click();
  await page.getByRole('button', { name: '8', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('8 passport photos · 4×6 photo paper · Colour · 2 sheets')).toBeVisible();
  await expect(page.getByText('Charge', { exact: false })).toHaveCount(0);
});

test('a passport photo that reaches less than 200 dpi says it may print blurry', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockLowRes=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('This photo is small', { exact: false })).toBeVisible();
});

test('the real-file preview of a 4×6 sheet has the 4×6 shape, not A4', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPhotoPaper=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  const fig = page.locator('figure:has(.file-page)').first();
  await expect(fig).toHaveAttribute('style', /aspect-ratio: 283\.464 \/ 425\.232/);
});

test('Passport photos tapped while the photos are still loading waits, then opens the frame (never a dead tap)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=1&mockSlowThumbs=1500');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await expect(page.locator('main h1')).toHaveText('Fit the face in the frame', { timeout: 8000 });
});

test('fitting the face again from Change returns to the same Ready (Back never lands on another Ready)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Photo in the frame/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
});

test('several photos: Which photo? comes first', async ({ page }) => {
  await page.goto('/?mockIntake=3');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await expect(page.locator('main h1')).toHaveText('Which photo?');
  await page.getByRole('button', { name: 'Photo 2' }).click();
  await expect(page.locator('main h1')).toHaveText('Fit the face in the frame');
});

/** The photo under the still passport frame covers the whole frame (it can never show an empty edge). */
const photoCoversFrame = (page: Page) =>
  page.evaluate(() => {
    const f = document.querySelector('.passport-frame')?.getBoundingClientRect();
    const p = document.querySelector('.face-photo')?.getBoundingClientRect();
    return (
      !!f && !!p && p.left <= f.left + 1 && p.right >= f.right - 1 && p.top <= f.top + 1 && p.bottom >= f.bottom - 1
    );
  });

test('the photo moves and zooms under the still frame with buttons, always fills it, and Start again puts it back (owner)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  const photo = page.locator('.face-photo');
  const frame = await page.locator('.passport-frame').getAttribute('style');
  const frameBox = await page.locator('.passport-frame').boundingBox();
  const start = await photo.getAttribute('style');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect((await photo.boundingBox())?.width ?? 0).toBeGreaterThan(frameBox?.width ?? 0);
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Move photo left' }).click();
  expect(await photoCoversFrame(page)).toBe(true);
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
  expect(await photoCoversFrame(page)).toBe(true);
  // The frame itself never moves on the stage.
  await expect(page.locator('.passport-frame')).toHaveAttribute('style', frame ?? '');
  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(photo).toHaveAttribute('style', start ?? '');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
});

test('dragging the photo with a finger moves it under the frame, and the print follows (owner)', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  const photo = page.locator('.face-photo');
  const before = await photo.boundingBox();
  const f = await page.locator('.passport-frame').boundingBox();
  if (!f || !before) throw new Error('no stage');
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
  await page.mouse.down();
  await page.mouse.move(f.x + f.width / 2 + 200, f.y + f.height / 2 + 20, { steps: 10 });
  await page.mouse.up();
  const after = await photo.boundingBox();
  expect(after?.x ?? 0).toBeGreaterThan(before.x + 10);
  expect(await photoCoversFrame(page)).toBe(true);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  // The photo moved right as far as it goes: the frame shows its left edge, and that is what prints (centred, the
  // frame of the zoomed photo starts well inside it).
  const cropX = () =>
    page.evaluate(
      () =>
        (globalThis as { __lastPlan?: { pages: { placements: { crop: { x: number } }[] }[] } }).__lastPlan?.pages[0]
          ?.placements[0]?.crop.x ?? 1,
    );
  await expect.poll(cropX).toBeLessThan(0.001);
});

test.describe('two fingers', () => {
  test.use({ hasTouch: true });
  test('pinching the photo zooms it in under the frame (owner)', async ({ page }) => {
    await page.goto('/?mockIntake=1');
    await page.getByRole('button', { name: 'Passport photos' }).click();
    const photo = page.locator('.face-photo');
    const before = await photo.boundingBox();
    const f = await page.locator('.passport-frame').boundingBox();
    if (!f || !before) throw new Error('no stage');
    const cdp = await page.context().newCDPSession(page);
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    const touch = (type: string, d: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          type === 'touchEnd'
            ? []
            : [
                { x: cx - d, y: cy, id: 1 },
                { x: cx + d, y: cy, id: 2 },
              ],
      });
    await touch('touchStart', 20);
    for (const d of [30, 40, 50, 60]) await touch('touchMove', d);
    await touch('touchEnd', 0);
    const after = await photo.boundingBox();
    expect(after?.width ?? 0).toBeGreaterThan(before.width * 1.5);
    expect(await photoCoversFrame(page)).toBe(true);
  });
});

type BorderPlan = {
  paper: { id: string };
  pages: { placements: { border?: number; box: { w: number; h: number } }[]; guides?: unknown[] }[];
};
const passportPrint = (page: Page) =>
  page.evaluate(() => {
    const p = (globalThis as { __lastPlan?: BorderPlan }).__lastPlan;
    const first = p?.pages[0];
    const box = first?.placements[0]?.box;
    return {
      paper: p?.paper.id,
      border: first?.placements[0]?.border ?? 0,
      cutLines: first?.guides?.length ?? 0,
      mm: box ? [Math.round((box.w * 254) / 72) / 10, Math.round((box.h * 254) / 72) / 10] : [],
    };
  });

const orientations = (page: Page) =>
  page.evaluate(
    () =>
      (globalThis as { __lastPlan?: { pages: { orientation: string }[] } }).__lastPlan?.pages.map(
        (p) => p.orientation,
      ) ?? [],
  );

test('paper direction: Portrait by default; Change → Paper direction → Landscape turns every page (owner)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect.poll(() => orientations(page)).toEqual(['portrait', 'portrait']);
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('button', { name: /^Paper direction.*Portrait/ })).toBeVisible();
  await page.getByRole('button', { name: /^Paper direction/ }).click();
  await page.getByRole('button', { name: /^Landscape/ }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect.poll(() => orientations(page)).toEqual(['landscape', 'landscape']);
  await expect(page.getByText(/A4 Landscape/)).toBeVisible();
});

test('print quality: photos go to the printer as a document; Best photo quality sends them as photos (owner)', async ({
  page,
}) => {
  const sentAs = () => page.evaluate(() => (globalThis as { __lastContentType?: string }).__lastContentType);
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT' }).click();
  await expect.poll(sentAs).toBe('document');
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('button', { name: /^Print quality.*Normal/ })).toBeVisible();
  await page.getByRole('button', { name: /^Print quality/ }).click();
  await page.getByRole('button', { name: /^Best photo quality/ }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await page.getByRole('button', { name: 'PRINT' }).click();
  await expect.poll(sentAs).toBe('photo');
});

// Review (2026-10-24): on 4×6 photo paper the job always goes as a document (the print service would enlarge a photo
// there), so Best photo quality would do nothing: it is not offered on 4×6.
test('Print quality is not offered on 4×6 photo paper, where it could not change anything', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockPhotoPaper=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('button', { name: /^Print quality/ })).toBeVisible();
  await page.getByRole('button', { name: /^Paper(?! direction| type)/ }).click();
  await page.getByRole('button', { name: /4×6 photo paper/ }).click();
  await expect(page.getByText('Put 4×6 photo paper in the printer', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('button', { name: /^Paper(?! direction| type).*4×6/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Print quality/ })).toHaveCount(0);
});

// Spec Part 4: documents too print on upright paper unless Landscape is chosen (review, 2026-10-24).
test('a document starts on upright paper; Landscape lays every page sideways, and the choice has pictures', async ({
  page,
}) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1');
  await expect.poll(async () => (await orientations(page)).every((o) => o === 'portrait')).toBe(true);
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('button', { name: /^Paper direction.*Portrait/ })).toBeVisible();
  await page.getByRole('button', { name: /^Paper direction/ }).click();
  // Each choice shows the document's own first page on that paper.
  await expect(page.locator('main figure')).toHaveCount(2);
  await page.getByRole('button', { name: /^Landscape/ }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect.poll(async () => (await orientations(page)).every((o) => o === 'landscape')).toBe(true);
});

test('passport border: 1½ pt by default; Change → Border sets 3 pt; No border brings the cut lines back (owner)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect.poll(async () => (await passportPrint(page)).border).toBe(1.5);
  expect((await passportPrint(page)).cutLines).toBe(0);
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('button', { name: /^Border.*Normal \(1½ pt\)/ })).toBeVisible();
  await page.getByRole('button', { name: /^Border/ }).click();
  await page.getByRole('button', { name: /^Very thick \(3 pt\)/ }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect.poll(async () => (await passportPrint(page)).border).toBe(3);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Border/ }).click();
  await page.getByRole('button', { name: /^No border/ }).click();
  await expect.poll(async () => (await passportPrint(page)).cutLines).toBeGreaterThan(0);
  expect((await passportPrint(page)).border).toBe(0);
});

/** Settings → Passport photos and prices → Custom size: type the shop's own size (cm). */
const setCustomSize = async (page: Page, w: string, h: string) => {
  await page.goto('/?screen=settings');
  await page.getByRole('button', { name: /^Passport photos and prices/ }).click();
  await page.getByRole('button', { name: /^Custom size/ }).click();
  await page.getByLabel('Width in cm').fill(w);
  await page.getByLabel('Height in cm').fill(h);
  await page.getByRole('button', { name: 'Save' }).click();
};

test("the shop's own passport size: set in Settings, chosen on a job, printed exactly (owner)", async ({ page }) => {
  await setCustomSize(page, '3.44', '4.23');
  await expect(page.getByRole('button', { name: /^Custom size.*3\.44 × 4\.23 cm/ })).toBeVisible();
  await page.goto('/?mockIntake=1&mockPhotoPaper=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Size/ }).click();
  await page.getByRole('button', { name: /^Custom: 3\.44 × 4\.23 cm/ }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect.poll(async () => (await passportPrint(page)).mm).toEqual([34.4, 42.3]);
});

// Review (2026-10-24): the size typed in Settings was saved but new jobs still used 3.5 × 4.5 cm until it was also
// chosen. Saving it makes it the shop's passport size.
test("the custom size saved in Settings is the shop's size from then on: new passport jobs use it", async ({
  page,
}) => {
  await setCustomSize(page, '3.44', '4.23');
  await expect(page.getByRole('button', { name: /^Size.*3\.44 × 4\.23 cm/ })).toBeVisible();
  await page.goto('/?mockIntake=1&mockPhotoPaper=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect.poll(async () => (await passportPrint(page)).mm).toEqual([34.4, 42.3]);
});

test('a custom size outside 1.5–10 cm is refused with a reason', async ({ page }) => {
  await page.goto('/?screen=settings');
  await page.getByRole('button', { name: /^Passport photos and prices/ }).click();
  await page.getByRole('button', { name: /^Custom size/ }).click();
  await page.getByLabel('Width in cm').fill('0.5');
  await page.getByLabel('Height in cm').fill('4');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Each side must be between 1.5 and 10 cm.')).toBeVisible();
  await expect(page.locator('main h1')).toHaveText('Custom size');
});

test('a passport size too big for the 4×6 photo paper prints on A4 and Ready says why', async ({ page }) => {
  await setCustomSize(page, '10', '10');
  await page.goto('/?mockIntake=1&mockPhotoPaper=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Size/ }).click();
  await page.getByRole('button', { name: /^Custom: 10 × 10 cm/ }).click();
  await expect(page.getByText("This size doesn't fit the 4×6 photo paper, so it prints on A4.")).toBeVisible();
  await expect.poll(async () => (await passportPrint(page)).paper).toBe('A4');
});

test('a sideways photo can be turned on the frame screen; the frame keeps its passport shape', async ({ page }) => {
  await page.goto('/?mockIntake=3');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Photo 3' }).click(); // a landscape photo
  const photo = page.locator('.face-photo');
  const before = await photo.getAttribute('style');
  await page.getByRole('button', { name: 'Turn' }).click();
  await expect(photo).not.toHaveAttribute('style', before ?? '');
  const shape = await page.locator('.passport-frame').evaluate((e) => {
    const r = e.getBoundingClientRect();
    return r.width / r.height;
  });
  expect(Math.abs(shape - 35 / 45)).toBeLessThan(0.02);
});

test('a passport photo that cannot be printed offers Choose another photo, never full-page prints of the others', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2&mockRenderDamaged=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Photo 1' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('button', { name: 'Choose another photo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print without it' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Choose another photo' }).click();
  await expect(page.locator('main h1')).toHaveText('Which photo?');
});

test('one photo that cannot be printed: Choose another photo goes back to Received, never a second one', async ({
  page,
}) => {
  await page.goto('/?mockIntake=1&mockRenderDamaged=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Choose another photo' }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
  await page.getByRole('button', { name: 'Back' }).click();
  await leave(page);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
});

// ---- Phase 7: documents and locked PDFs ----

test('J5: a shared PDF goes straight to Ready in colour (owner, round 3) and prints in 1 tap', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1');
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('1 PDF · 3 pages · A4 · Colour · 1 copy')).toBeVisible();
  await page.getByRole('button', { name: 'PRINT', exact: true }).click(); // 1
  await expect(page.locator('main h1')).toHaveText('Printing');
});

test('Pages to print: leaving a page out prints the others', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Pages to print/ }).click();
  await expect(page.locator('main h1')).toHaveText('Pages to print');
  await page.getByRole('checkbox', { name: 'Page 2' }).uncheck();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('1 PDF · 2 pages · A4 · Colour · 1 copy')).toBeVisible();
  // Review M2: Change says how many of how many.
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('button', { name: /^Pages to print/ })).toContainText('2 of 3 pages');
});

test('a PDF still locked: no page choices until it is unlocked (its pages would be left out for good)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2&mockPdfAt=2&mockPdfLocked=1');
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByText('Unlock the PDF first', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pages to print/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Page order/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByLabel('First 4 letters of the name').fill('RAMA');
  await page.getByLabel('Year of birth').fill('1965');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Page order/ }).click();
  await expect(page.getByRole('button', { name: /^File \d+, page/ })).toHaveCount(4);
});

test('Page order: moving a page later changes what prints first', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockNoPreview=1');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Page order/ }).click();
  await page.getByRole('button', { name: 'Page 1' }).click();
  await expect(page.locator('main h1')).toHaveText('Page 1');
  await page.getByRole('button', { name: 'Move later' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('main h1')).toHaveText('Page order');
  await page.getByRole('button', { name: 'Done' }).click();
  const first = await page.locator('ol.sheets > li').first().locator('img').getAttribute('src');
  expect(decodeURIComponent(first ?? '')).toContain('PDF page 2');
});

test('a locked PDF asks for its password; the e-Aadhaar helper builds it; a wrong one says so', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockPdfLocked=1');
  await expect(page.getByText('This PDF is locked', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('main h1')).toHaveText('Unlock PDF');
  await page.getByLabel('First 4 letters of the name').fill('rama');
  await expect(page.getByLabel('First 4 letters of the name')).toHaveValue('RAMA');
  await page.getByLabel('Year of birth').fill('1966');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByText("That password didn't work", { exact: false })).toBeVisible();
  await page.getByLabel('Year of birth').fill('1965');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('1 PDF · 3 pages', { exact: false })).toBeVisible();
  // The password is never stored (PLAN §G5): not in any saved screen or setting.
  const stored = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  expect(stored).not.toContain('RAMA1965');
});

test('the e-Aadhaar helper asks for a missing year instead of saying the password is wrong', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockPdfLocked=1');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByLabel('First 4 letters of the name').fill('RAMA');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByText('Type the year of birth', { exact: false })).toBeVisible();
  await expect(page.getByText("That password didn't work", { exact: false })).toHaveCount(0);
  await page.getByLabel('Year of birth').fill('196');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByText('Type the year of birth', { exact: false })).toBeVisible();
});

test('Other password: the field never shows the text; Show writes it large below', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockPdfLocked=1');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByRole('button', { name: 'Other password' }).click();
  const field = page.getByLabel('Password', { exact: true });
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveAttribute('autocomplete', 'off');
  await field.fill('RAMA1965');
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(page.locator('.password-shown')).toHaveText('RAMA1965');
  await expect(field).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
});

test('on a phone with no built-in unlock the app unlocks the PDF itself and sends the copy in chunks', async ({
  page,
}) => {
  await page.route('**/mock-locked.pdf', (r) =>
    r.fulfill({ body: readFileSync('tests/fixtures/pdf/user-aes256.pdf'), contentType: 'application/pdf' }),
  );
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockPdfLocked=1&mockTier=NONE');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByLabel('First 4 letters of the name').fill('RAMA');
  await page.getByLabel('Year of birth').fill('1965');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print', { timeout: 15000 });
  const sent = await page.evaluate(() => (globalThis as { __unlockedBytes?: number }).__unlockedBytes ?? 0);
  expect(sent).toBeGreaterThan(500);
});

test('a damaged PDF says so and what to do', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockPdfDamaged=1');
  await expect(page.getByText('This PDF is damaged', { exact: false })).toBeVisible();
});

test('forms and stamps: a warning only on phones whose built-in engine may not draw them', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockPdfForms=1&mockTier=NONE');
  await expect(page.getByText('filled-in boxes or stamps', { exact: false })).toBeVisible();
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockPdfForms=1&mockTier=NATIVE_35');
  await expect(page.getByText('1 PDF · 3 pages', { exact: false })).toBeVisible();
  await expect(page.getByText('filled-in boxes or stamps', { exact: false })).toHaveCount(0);
});

test('a PDF of more than 300 pages opens on Pages to print', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockPdfPages=320');
  await expect(page.locator('main h1')).toHaveText('Pages to print');
  await expect(page.getByText('320 pages', { exact: false })).toBeVisible();
  // Review I4: page images are asked for as they come into view, not all 320 at once.
  await expect(page.getByRole('checkbox', { name: 'Page 1', exact: true })).toBeVisible();
  const asked = await page.evaluate(() => (globalThis as { __pageImages?: number }).__pageImages ?? 0);
  expect(asked).toBeGreaterThan(0);
  expect(asked).toBeLessThan(100);
  // Review I3: Back goes to Ready and stays there (it asks once).
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await page.waitForTimeout(500);
  await expect(page.locator('main h1')).toHaveText('Ready to print');
});

test('a PDF of more than 500 pages says only the first 500 can be printed', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockPdfPages=620');
  await expect(page.locator('main h1')).toHaveText('Pages to print');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(
    page.getByText('This PDF has 620 pages. Only the first 500 can be printed.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('1 PDF · 500 pages', { exact: false })).toBeVisible();
});

test('photos and a PDF together print as pages, in received order', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockPdfAt=2');
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('1 photo · 1 PDF · 4 pages · A4 · Colour · 1 copy')).toBeVisible();
});

// ---- Phase 8: print styles (PLAN §F4, §I-7, §J7) ----

type PlanLike = { exact?: unknown; colour: string; pages: { placements: { style: string }[] }[] };
const lastPlan = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (globalThis as { __lastPlan?: PlanLike }).__lastPlan);

test('Print style: Sharp Black prints black & white in that style and Ready says so', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('button', { name: /^Print style/ })).toContainText('Original');
  await page.getByRole('button', { name: /^Print style/ }).click();
  await expect(page.locator('main h1')).toHaveText('Print style');
  await expect(page.getByRole('heading', { name: 'Black & white' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Original/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Sharp Black/ }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('2 photos · 2 pages · A4 · Black & white · Sharp Black · 1 copy')).toBeVisible();
  await expect.poll(async () => (await lastPlan(page))?.pages[0]?.placements[0]?.style).toBe('sharp');
  expect((await lastPlan(page))?.colour).toBe('bw');
});

test('choosing Colour after a black & white style goes back to Original (never "Vibrant in grey")', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Print style/ }).click();
  await page.getByRole('button', { name: /^OCV Black/ }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Colour/ }).click();
  await page.getByRole('button', { name: /^Colour/ }).click();
  await expect(page.getByText('2 photos · 2 pages · A4 · Colour · 1 copy')).toBeVisible();
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('button', { name: /^Print style/ })).toContainText('Original');
});

test('passport photos have no print style (nothing changed except crop and size)', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('button', { name: /^Colour/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Print style/ })).toHaveCount(0);
});

test("a styled PDF is drawn page by page, never sent as the customer's own file", async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Colour/ }).click();
  await page.getByRole('button', { name: /^Colour/ }).click();
  await expect.poll(async () => !!(await lastPlan(page))?.exact).toBe(true);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Print style/ }).click();
  await page.getByRole('button', { name: /^Vibrant/ }).click();
  await expect(page.getByText('1 PDF · 3 pages · A4 · Colour · Vibrant · 1 copy')).toBeVisible();
  await expect.poll(async () => (await lastPlan(page))?.pages[0]?.placements[0]?.style).toBe('vibrant');
  expect((await lastPlan(page))?.exact).toBeUndefined();
});

test('when the examples cannot be made, the styles can still be chosen', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockSamplesFail=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Print style/ }).click();
  await expect(page.getByText("The examples couldn't be made", { exact: false })).toBeVisible();
  await expect(page.getByText('Making the examples', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: /^Soft Tone/ }).click();
  await expect(page.getByText('Colour · Soft Tone', { exact: false })).toBeVisible();
});

test('a turned first photo shows its examples turned, like the print', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Photos/ }).click();
  await page.getByRole('button', { name: 'Photo 1' }).click();
  await page.getByRole('button', { name: 'Turn' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: /^Print style/ }).click();
  await expect(page.locator('img.style-sample.turn-1')).toHaveCount(6);
});

// ---- Phase 9: smart auto-crop (PLAN §F5, §I-3, §J6) ----

/** An analysis file ("PSAG", 300 × 200 grey) with black bars over the top and bottom 10 % (rows 0–19, 180–199). */
function barsFile(): Buffer {
  const w = 300;
  const h = 200;
  const out = Buffer.alloc(8 + w * h);
  out.write('PSAG', 0, 'ascii');
  out.writeUInt16BE(w, 4);
  out.writeUInt16BE(h, 6);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      out[8 + y * w + x] = y < 20 || y >= 180 ? 3 : 90 + Math.round(60 * Math.sin(x / 9) * Math.cos(y / 13));
  return out;
}
const serveBars = (page: import('@playwright/test').Page) =>
  page.route('**/mock-bars.grey', (r) => r.fulfill({ body: barsFile(), contentType: 'application/octet-stream' }));

test('J1 with black edges: one question for the job, then the photos print without them', async ({ page }) => {
  await serveBars(page);
  await page.goto('/?mockIntake=2&mockBars=1');
  await page.getByRole('button', { name: 'All on one page' }).click();
  await expect(page.locator('main h1')).toHaveText('Black edges?');
  await expect(page.getByText('2 photos have black edges.')).toBeVisible();
  // The example "without the edges" has the photo's shape cut by the crop (the mock photo is 1200 × 1600).
  const cut = await page.locator('.edges-cut').boundingBox();
  expect((cut?.width ?? 0) / (cut?.height ?? 1)).toBeCloseTo((0.75 * 1) / 0.79, 1);
  await page.getByRole('button', { name: 'Remove black edges' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect
    .poll(async () =>
      (await lastPlan(page))?.pages[0]?.placements.map((p) => (p as unknown as { crop: { y: number } }).crop.y),
    )
    .toEqual([expect.closeTo(0.105, 2), expect.closeTo(0.105, 2)]);
  // Asked once: Back to Received and another choice goes straight to Ready.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
});

test('Keep as they are: nothing is cut, and the question is not asked again', async ({ page }) => {
  await serveBars(page);
  await page.goto('/?mockIntake=2&mockBars=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Keep as they are' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect
    .poll(async () =>
      (await lastPlan(page))?.pages.flatMap((p) =>
        p.placements.map((x) => (x as unknown as { crop: { h: number } }).crop.h),
      ),
    )
    .toEqual([1, 1]);
});

test('J6: a photo printed as a document — black edges removed, in colour (owner, round 3)', async ({ page }) => {
  await serveBars(page);
  await page.goto('/?mockIntake=1&mockBars=1');
  await page.getByRole('button', { name: 'Print as document' }).click();
  await expect(page.getByText('This photo has black or white edges.')).toBeVisible();
  await page.getByRole('button', { name: 'Remove the edges' }).click();
  await expect(page.getByText('1 photo · 1 page · A4 · Colour · 1 copy')).toBeVisible();
});

test('photos without black edges go straight to Ready (no question)', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
});

type Placed = { crop: { x: number; y: number; w: number; h: number } };
const crops = async (page: import('@playwright/test').Page) =>
  (await lastPlan(page))?.pages.flatMap((pg) => pg.placements.map((x) => (x as unknown as Placed).crop));

// The crop frame (owner, round 3: the middle bars only): the arrows move the chosen side; a side moved is a crop.
test('manual crop: the top side moved down with the arrows, then printed that way; Whole photo puts it back', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Photos/ }).click();
  await page.getByRole('button', { name: 'Photo 1' }).click();
  await page.getByRole('button', { name: /^Crop/ }).click();
  await expect(page.locator('main h1')).toHaveText('Crop photo 1');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Down' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /^Crop · Cropped/ })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect.poll(async () => (await crops(page))?.[0]?.y).toBeCloseTo(0.03, 5);
  expect((await crops(page))?.[0]?.h).toBeCloseTo(0.97, 5);
  // Whole photo: the crop goes.
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Photos/ }).click();
  await page.getByRole('button', { name: 'Photo 1' }).click();
  await page.getByRole('button', { name: /^Crop/ }).click();
  await page.getByRole('button', { name: 'Whole photo' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /^Crop$/ })).toBeVisible();
});

test('the crop screen starts on the black edges found, even after "Keep as they are"', async ({ page }) => {
  await serveBars(page);
  await page.goto('/?mockIntake=2&mockBars=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Keep as they are' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Photos/ }).click();
  await page.getByRole('button', { name: 'Photo 1' }).click();
  await page.getByRole('button', { name: /^Crop/ }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect.poll(async () => (await crops(page))?.[0]?.y).toBeCloseTo(0.105, 2);
  expect((await crops(page))?.[1]?.h).toBe(1);
});

test('a suggestion from another choice is never reused (the question only for what this choice found)', async ({
  page,
}) => {
  await serveBars(page);
  await page.goto('/?mockIntake=2&mockBars=doc');
  await page.getByRole('button', { name: 'Print as document' }).click();
  await expect(page.locator('main h1')).toHaveText('Edges to remove?');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
});

test('leaving Received while it looks at the photos never opens a screen later', async ({ page }) => {
  await serveBars(page);
  await page.goto('/?mockIntake=2&mockBars=1&mockSlowAnalysis=1500');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByText('Looking at the photos', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await page.waitForTimeout(2500);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
});

test('J6: a wrong "Remove black edges" can be undone from the page tools of a document (Crop → Whole photo)', async ({
  page,
}) => {
  await serveBars(page);
  await page.goto('/?mockIntake=1&mockBars=1');
  await page.getByRole('button', { name: 'Print as document' }).click();
  await expect(page.locator('main h1')).toHaveText('Edges to remove?');
  await expect(page.getByText('This photo has black or white edges.')).toBeVisible();
  await page.getByRole('button', { name: 'Remove the edges' }).click();
  await expect.poll(async () => (await crops(page))?.[0]?.y).toBeCloseTo(0.105, 2);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Page order/ }).click();
  await page.getByRole('button', { name: 'Page 1' }).click();
  // Drawn like the print: the cut photo, not the whole one squashed (re-review I-C).
  await expect(page.locator('.paper-crop')).toHaveCount(1);
  await page.getByRole('button', { name: /^Crop · Cropped/ }).click();
  await page.getByRole('button', { name: 'Whole photo' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  // Whole photo sticks: the crop screen now starts on the whole photo, not on the edges found (gate M-1).
  await page.getByRole('button', { name: /^Crop$/ }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect.poll(async () => (await crops(page))?.[0]?.h).toBe(1);
});

test('Start again puts the frame back where it was when the crop screen opened', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Photos/ }).click();
  await page.getByRole('button', { name: 'Photo 1' }).click();
  await page.getByRole('button', { name: /^Crop/ }).click();
  const frame = page.locator('.scan-lines polygon');
  const before = await frame.getAttribute('points');
  await page.getByRole('button', { name: 'Down' }).click();
  expect(await frame.getAttribute('points')).not.toBe(before);
  await page.getByRole('button', { name: 'Start again' }).click();
  expect(await frame.getAttribute('points')).toBe(before);
});

const openCrop = async (page: Page) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Photos/ }).click();
  await page.getByRole('button', { name: 'Photo 1' }).click();
  await page.getByRole('button', { name: /^Crop/ }).click();
};

/** Drags the middle of [sel] by (dx, dy) screen px in small steps (a mouse: one finger). */
const dragBy = async (page: Page, sel: string, dx: number, dy: number) => {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error(`no ${sel}`);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
};
const framePoints = async (page: Page) =>
  ((await page.locator('.scan-lines polygon').getAttribute('points')) ?? '')
    .split(' ')
    .map((p) => p.split(',').map(Number));
/** The frame made smaller by its side handles (each side moved in by about a fifth of the photo). */
const shrinkFrame = async (page: Page) => {
  const b = await page.locator('.scan-stage').boundingBox();
  if (!b) throw new Error('no stage');
  await dragBy(page, '[aria-label="The left side"]', b.width / 5, 0);
  await dragBy(page, '[aria-label="The right side"]', -b.width / 5, 0);
  await dragBy(page, '[aria-label="The top side"]', 0, b.height / 5);
  await dragBy(page, '[aria-label="The bottom side"]', 0, -b.height / 5);
};

test('Crop: dragging inside the frame moves it (owner, 2026-10-23)', async ({ page }) => {
  await openCrop(page);
  await shrinkFrame(page);
  const frame = page.locator('.scan-lines polygon');
  const b = await frame.boundingBox();
  if (!b) throw new Error('no frame');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  const a = await frame.boundingBox();
  expect(a?.x ?? 0).toBeGreaterThan(b.x + 15);
  expect(a?.y ?? 0).toBeGreaterThan(b.y + 8);
  expect(a?.width ?? 0).toBeCloseTo(b.width, 0);
});

test.describe('two fingers on Crop', () => {
  test.use({ hasTouch: true });
  test('pinching makes the frame bigger (owner, 2026-10-23)', async ({ page }) => {
    await openCrop(page);
    await shrinkFrame(page);
    const frame = page.locator('.scan-lines polygon');
    const b = await frame.boundingBox();
    if (!b) throw new Error('no frame');
    const cdp = await page.context().newCDPSession(page);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const touch = (type: string, d: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          type === 'touchEnd'
            ? []
            : [
                { x: cx - d, y: cy, id: 1 },
                { x: cx + d, y: cy, id: 2 },
              ],
      });
    // Fingers 1.4 times further apart (the frame then still fits inside the photo).
    await touch('touchStart', 10);
    for (const d of [11, 12, 13, 14]) await touch('touchMove', d);
    await touch('touchEnd', 0);
    expect((await frame.boundingBox())?.width ?? 0).toBeGreaterThan(b.width * 1.25);
  });
});

test('after one side bar is dragged, another still drags (re-review I-B)', async ({ page }) => {
  await openCrop(page);
  const before = await framePoints(page);
  await dragBy(page, '[aria-label="The right side"]', -100, 0); // the right side, in
  const narrow = await framePoints(page);
  // The first drag really moved the side (a browser drag must never cancel it after one step).
  expect(narrow[1]?.[0] ?? 100).toBeLessThan((before[1]?.[0] ?? 0) - 10);
  // Another bar (the top one: the bottom one may sit under the action bar in this short window) still drags.
  await dragBy(page, '[aria-label="The top side"]', 0, 80);
  const after = await framePoints(page);
  expect(after[0]?.[1] ?? 0).toBeGreaterThan((narrow[0]?.[1] ?? 0) + 10);
});

test('back from Crop, the page tools are on the same page (re-review m-1)', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockPdfAt=2');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Page order/ }).click();
  await page.getByRole('button', { name: 'File 1, page 1' }).click();
  await page.getByRole('button', { name: 'Move later' }).click();
  await expect(page.locator('main h1')).toHaveText('File 1, page 1');
  await page.getByRole('button', { name: /^Crop/ }).click();
  await expect(page.locator('main h1')).toHaveText('Crop: File 1, page 1');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('main h1')).toHaveText('File 1, page 1');
});

test('a save that finishes after Home never opens a screen behind the shopkeeper (a screen off the top cannot navigate)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2&mockPdfAt=2&mockSlowSave=1200');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Page order/ }).click();
  await page.getByRole('button', { name: 'File 1, page 1' }).click();
  await page.getByRole('button', { name: 'Move later' }).click();
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await page.waitForTimeout(1800);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
});

test("Back, then the same screen again: the old one's late save never acts on the new one", async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockSlowSave=1200');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Page order/ }).click();
  await page.getByRole('button', { name: 'Page 1' }).click();
  await page.getByRole('button', { name: 'Move later' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Page 3' }).click();
  await expect(page.locator('main h1')).toHaveText('Page 3');
  await page.waitForTimeout(1800);
  await expect(page.locator('main h1')).toHaveText('Page 3');
});

test('safe start after repeated crashes: only Home under the problem (so Android Back goes to Home)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2');
  await expect(page.locator('main h1')).toHaveText('Files received'); // remembered for coming back (PLAN §D5)
  await page.goto('/?mockSafeStart=1');
  await expect(page.getByText('stopped by itself', { exact: false })).toBeVisible();
  // Under the problem there is Home only, never the screen remembered from before the crashes.
  await expect
    .poll(() =>
      page.evaluate(() =>
        (JSON.parse(localStorage.getItem('ps.nav') ?? '{}').stack ?? []).map((s: { name: string }) => s.name),
      ),
    )
    .toEqual(['home', 'problem']);
});

test('Move later keeps the page tools on screen (no reload, focus stays on the button)', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Page order/ }).click();
  await page.getByRole('button', { name: 'Page 1' }).click();
  const later = page.getByRole('button', { name: 'Move later' });
  // A new screen first puts focus on its title (focus-on-route-change); let that happen, then use the button. Under a
  // busy test run the page's facts may still be loading (title not yet "Page 1", button disabled): wait for them, as a
  // person would (review minor 13: the old "flake" was this race in the test).
  await expect(page.locator('main h1')).toBeFocused();
  await expect(page.locator('main h1')).toHaveText('Page 1');
  await expect(later).toBeEnabled();
  await later.focus();
  await later.press('Enter');
  await expect(page.locator('main h1')).toHaveText('Page 1');
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Move later');
});

test('the photos are looked at for black edges while the shopkeeper reads the choices (the choice never waits for it)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2');
  await expect(page.getByRole('button', { name: 'One on each page' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (globalThis as { __analysisCalls?: number }).__analysisCalls ?? 0))
    .toBeGreaterThan(0);
});

test('a big job tapped at once still gets the black-edge question for the photos looked at so far (review I5)', async ({
  page,
}) => {
  await serveBars(page);
  // One photo every 1.5 s on the phone's single analysis thread: all 6 would take 9 s, more than the 8 s limit.
  await page.goto('/?mockIntake=6&mockBars=1&mockSlowAnalysisEach=1500');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByText(/[1-5] photos have black edges/)).toBeVisible({ timeout: 10_000 });
  // The early run was stopped, so the phone is free for Ready's previews.
  expect(
    await page.evaluate(() => (globalThis as { __analysisCancels?: number }).__analysisCancels ?? 0),
  ).toBeGreaterThan(0);
});

// ---- Phase 10: big jobs (PLAN §F6, §H2.7: progress always has words, a bar and Cancel) ----

test('a big share says how far the photos are, and Cancel stops it and goes Home', async ({ page }) => {
  await page.goto('/?mockIntake=40&mockSlowThumbs=4000');
  await expect(page.getByText(/Getting the photos ready… \d+ of 40/)).toBeVisible();
  await expect(page.locator('progress')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await expect
    .poll(() => page.evaluate(() => (globalThis as { __thumbCancels?: number }).__thumbCancels ?? 0))
    .toBeGreaterThan(0);
});

test('while pages are being prepared, Cancel stops it and goes back', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockSlowRender=4000');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByText('Preparing pages…', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
});

// New files arrived (PLAN §I-17, §J8): a share while another job is open asks what to do; nothing is lost.

test('a share while a job is open asks first; Start a new job opens it and Back returns to the open job', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await shareAgain(page, 3);
  await expect(page.locator('main h1')).toHaveText('New files arrived');
  await expect(page.getByText('3 new files arrived while this job is open.')).toBeVisible();
  await page.getByRole('button', { name: 'Start a new job' }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
  await expect(page.getByRole('img', { name: /^\d of 3$/ })).toHaveCount(3);
  await page.getByRole('button', { name: 'Back' }).click();
  await leave(page);
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('2 photos · 2 pages', { exact: false })).toBeVisible();
});

test('Add them to this job: every file is on Received, the new job is gone from Recent jobs', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await shareAgain(page, 3);
  await page.getByRole('button', { name: 'Add them to this job' }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
  await expect(page.getByRole('img', { name: /^\d of 5$/ })).toHaveCount(5);
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByText('5 photos · 5 pages', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await page.getByRole('button', { name: 'Recent jobs' }).click();
  await expect(page.getByRole('button', { name: /^5 files/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^3 files/ })).toHaveCount(0);
});

test('Keep working returns to the open job; the new files wait in Recent jobs', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await shareAgain(page, 3);
  await page.getByRole('button', { name: 'Keep working on this job' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await page.getByRole('button', { name: 'Recent jobs' }).click();
  await expect(page.getByRole('button', { name: /^3 files.*Not printed yet/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^2 files/ })).toBeVisible();
});

test('a second share while the question is open joins it: Add takes both (review I4)', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await expect(page.locator('main h1')).toHaveText('Files received');
  await shareAgain(page, 3);
  await expect(page.locator('main h1')).toHaveText('New files arrived');
  await shareAgain(page, 4);
  await expect(page.getByText('7 new files arrived while this job is open.')).toBeVisible();
  await page.getByRole('button', { name: 'Add them to this job' }).click();
  await expect(page.getByRole('img', { name: /^\d+ of 9$/ })).toHaveCount(9);
  await page.getByRole('button', { name: 'Back' }).click();
  await leave(page);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
});

test('a share that lands while Add is saving gets a working question; nothing is lost (review I2)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2&mockSlowSave=1500');
  await expect(page.locator('main h1')).toHaveText('Files received');
  await shareAgain(page, 3);
  await page.getByRole('button', { name: 'Add them to this job' }).click();
  await shareAgain(page, 4);
  await expect(page.getByRole('button', { name: 'Add them to this job' })).toBeEnabled({ timeout: 5000 });
  await page.getByRole('button', { name: 'Add them to this job' }).click();
  await expect(page.getByRole('img', { name: /^\d+ of 9$/ })).toHaveCount(9, { timeout: 10_000 });
});

test('after printing, new files are not added to the printed job (it would print again) (review I3)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT' }).click();
  await expect(page.locator('main h1')).not.toHaveText('Ready to print');
  await shareAgain(page, 1);
  await expect(page.locator('main h1')).toHaveText('New files arrived');
  await expect(page.getByText('This job was printed already', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add them to this job' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start a new job' }).click();
  await expect(page.getByRole('img', { name: /^\d+ of 1$/ })).toHaveCount(1);
});

// Race matrix (PLAN §D2c, §R level 8): taps faster than the app can answer.
test('ten quick taps on PRINT send one print', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  const print = page.getByRole('button', { name: 'PRINT' });
  await expect(print).toBeEnabled();
  await print.evaluate((b: HTMLElement) => {
    for (let i = 0; i < 10; i++) b.click();
  });
  await expect(page.locator('main h1')).not.toHaveText('Ready to print');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (globalThis as { __printCalls?: number }).__printCalls)).toBe(1);
});

test('ten quick taps on a choice open one Ready; one Back returns to Received', async ({ page }) => {
  await page.goto('/?mockIntake=3&mockSlowSave=300');
  const choice = page.getByRole('button', { name: 'One on each page' });
  await choice.evaluate((b: HTMLElement) => {
    for (let i = 0; i < 10; i++) b.click();
  });
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
});

// Owner, round 4: the Backs stop at "Leave this job?" (the job's first screen); Leave reaches Home.
test('ten quick taps on Back from deep inside stop at the Leave question, never leave the app in a broken state', async ({
  page,
}) => {
  await page.goto('/?mockIntake=3');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Copies/ }).click();
  const back = page.getByRole('button', { name: 'Back' });
  for (let i = 0; i < 10; i++) await back.click({ timeout: 2000 }).catch(() => {});
  await expect(page.getByRole('dialog', { name: 'Leave this job?' })).toBeVisible();
  await expect(page.locator('main h1')).toHaveText('Files received');
  await leave(page);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await page.getByRole('button', { name: /Continue the last job/ }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
});

// Phone storage full (PLAN §J8): what happened, what to do, and a way to make room from here.
test('storage full while preparing: Delete old PrintSaathi jobs keeps the job being prepared', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockNoSpace=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByText('Phone storage is full.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Delete old PrintSaathi jobs' }).click();
  await expect(page.locator('main h1')).toHaveText("Delete other customers' files?");
  await page.getByRole('button', { name: 'Delete old files' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  expect(await page.evaluate(() => (globalThis as { __deleteKeepOpen?: boolean }).__deleteKeepOpen)).toBe(true);
});

test('a share that found the phone full offers Delete old PrintSaathi jobs', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockStorageFull=1');
  await expect(page.getByText('Phone storage is full. Delete old WhatsApp videos, then share again.')).toBeVisible();
  await page.getByRole('button', { name: 'Delete old PrintSaathi jobs' }).click();
  await expect(page.locator('main h1')).toHaveText("Delete other customers' files?");
});

test('a share that filled the phone part-way says so on Received and offers Delete old PrintSaathi jobs', async ({
  page,
}) => {
  await page.goto('/?mockIntake=4&mockStorageFullAt=3');
  await expect(page.getByRole('img', { name: /^\d of 2$/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Delete old PrintSaathi jobs' }).click();
  await expect(page.locator('main h1')).toHaveText("Delete other customers' files?");
});

// ---- Phase 10b: Settings (PLAN §I-15) ----

const openSettings = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('mock-settings'));
  await page.goto('/?screen=settings');
  await expect(page.locator('main h1')).toHaveText('Settings');
};

test('Settings shows every value as it is now; nothing says "not ready"', async ({ page }) => {
  await openSettings(page);
  await expect(page.getByText('Not ready yet', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Delete customer files after.*1 day/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Shop name.*Not set yet/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Passport photos and prices.*35 × 45 mm.*5 photos/ })).toBeVisible();
});

test('Delete customer files after: 7 days is kept after the app restarts', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('button', { name: /Delete customer files after/ }).click();
  await expect(page.locator('main h1')).toHaveText('Delete customer files after');
  await page.getByRole('button', { name: /7 days/ }).click();
  await expect(page.locator('main h1')).toHaveText('Settings');
  await expect(page.getByRole('button', { name: /Delete customer files after.*7 days/ })).toBeVisible();
  await page.goto('/?screen=settings');
  await expect(page.getByRole('button', { name: /Delete customer files after.*7 days/ })).toBeVisible();
});

test('Shop name is saved and shown', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('button', { name: /Shop name/ }).click();
  await page.getByLabel('Shop name').fill('Star Xerox');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: /Shop name.*Star Xerox/ })).toBeVisible();
});

test('a setting that cannot be saved says so and stays as it was', async ({ page }) => {
  await page.goto('/?screen=settings&mockSettingsFail=1');
  await page.getByRole('button', { name: /Delete customer files after/ }).click();
  await page.getByRole('button', { name: /1 hour/ }).click();
  await expect(page.getByText("Couldn't save this change", { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: /Delete customer files after.*1 day/ })).toBeVisible();
});

/** The owner's settings, saved before the app starts (as if set earlier in Settings). */
const withSettings = (page: import('@playwright/test').Page, settings: object) =>
  page.addInitScript((s) => localStorage.setItem('mock-settings', JSON.stringify(s)), settings);

test("passport photos start with the owner's count and charge the owner's price", async ({ page }) => {
  await withSettings(page, { passport: { preset: '35x45', count: 8, prices: { 8: 80 } } });
  await page.goto('/?mockIntake=1&mockPhotoPaper=1&mockNoPreview=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('8 passport photos · 4×6 photo paper · Colour · 2 sheets · Charge ₹80')).toBeVisible();
});

test('photo paper reminder off: passport photos print with a plain PRINT', async ({ page }) => {
  await withSettings(page, { photoPaperReminder: false });
  await page.goto('/?mockIntake=1&mockPhotoPaper=1&mockNoPreview=1');
  await page.getByRole('button', { name: 'Passport photos' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('button', { name: 'PRINT', exact: true })).toBeVisible();
  await expect(page.getByText('Put 4×6 photo paper in the printer', { exact: false })).toHaveCount(0);
});

// Owner, round 3: "for all print preview print output must be colour; let user change if they want B&W". Every new job
// starts in colour, whatever an older version's Settings said (they set B&W for documents) and whatever was printed last.
test('every new job starts in colour, even with Settings from 1.0.224 saying black & white', async ({ page }) => {
  await withSettings(page, { defaults: { photos: { colour: 'bw', paper: 'A4' }, documents: { colour: 'bw' } } });
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByText('2 photos · 2 pages · A4 · Colour · 1 copy')).toBeVisible();
  await page.goto('/?mockIntake=1&mockPdfAt=1');
  await expect(page.getByText('1 PDF · 3 pages · A4 · Colour · 1 copy')).toBeVisible();
});

test('a job printed in black & white never makes the next job start in black & white', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Colour/ }).click();
  await page.getByRole('button', { name: /Black & white/ }).click();
  await page.getByRole('button', { name: 'PRINT', exact: true }).click();
  await page.getByRole('button', { name: /Yes/ }).click();
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await shareAgain(page, 3);
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByText('3 photos · 3 pages · A4 · Colour · 1 copy')).toBeVisible();
});

test('Space at paper edges: More keeps at least 9 mm clear on the print', async ({ page }) => {
  await withSettings(page, { edges: 'more' });
  await page.goto('/?mockIntake=3');
  await page.getByRole('button', { name: 'All on one page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect.poll(() => page.evaluate(() => !!(globalThis as { __lastPlan?: unknown }).__lastPlan)).toBe(true);
  const edgeMm = await page.evaluate(() => {
    type P = {
      paper: { wPt: number; hPt: number };
      pages: { orientation: string; placements: { box: { x: number; y: number; w: number; h: number } }[] }[];
    };
    const plan = (globalThis as { __lastPlan?: P }).__lastPlan as P;
    return (
      Math.min(
        ...plan.pages.flatMap((p) => {
          const [w, h] =
            p.orientation === 'landscape' ? [plan.paper.hPt, plan.paper.wPt] : [plan.paper.wPt, plan.paper.hPt];
          return p.placements.map((x) => Math.min(x.box.x, x.box.y, w - x.box.x - x.box.w, h - x.box.y - x.box.h));
        }),
      ) *
      (25.4 / 72)
    );
  });
  expect(edgeMm).toBeGreaterThanOrEqual(9 - 1e-6);
});

// Owner, 2026-10-24: "default margin layout must be narrow, same as Word".
test('Settings → Margins offers Word’s Narrow, Normal and Small; Narrow is chosen and keeps 12.7 mm', async ({
  page,
}) => {
  await openSettings(page);
  await expect(page.getByRole('button', { name: /^Margins.*Narrow \(1\.27 cm\), like Word/ })).toBeVisible();
  await page.getByRole('button', { name: /^Margins/ }).click();
  await expect(page.locator('main h1')).toHaveText('Margins');
  for (const name of [/Narrow \(1\.27 cm\)/, /Normal \(2\.54 cm\)/, /Small \(0\.6 cm\)/])
    await expect(page.getByRole('button', { name })).toBeVisible();
  await expect(page.getByRole('button', { name: /Narrow \(1\.27 cm\)/ })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/?mockIntake=3');
  await page.getByRole('button', { name: 'All on one page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect.poll(() => page.evaluate(() => !!(globalThis as { __lastPlan?: unknown }).__lastPlan)).toBe(true);
  const firstMm = await page.evaluate(() => {
    type P = { pages: { placements: { box: { x: number; y: number } }[] }[] };
    const b = ((globalThis as { __lastPlan?: P }).__lastPlan as P).pages[0]?.placements[0]?.box ?? { x: 0, y: 0 };
    return [b.x * (25.4 / 72), b.y * (25.4 / 72)];
  });
  expect(firstMm[0]).toBeGreaterThanOrEqual(12.7 - 1e-6);
  expect(firstMm[1]).toBeGreaterThanOrEqual(12.7 - 1e-6);
});

test('Send problem report shares a plain report through Android, with nothing about customers', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('button', { name: /^Send problem report/ }).click();
  await expect(page.locator('main h1')).toHaveText('Send problem report');
  await expect(page.getByText('no customer photos, files, names or passwords', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Send problem report', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (globalThis as { __sharedText?: string }).__sharedText ?? ''))
    .toContain('PrintSaathi problem report');
});

test('a share while the screen shows a job that is gone opens the new files at once (no question)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2');
  await expect(page.locator('main h1')).toHaveText('Files received');
  // The open job is deleted underneath (retention, Delete all elsewhere).
  await page.evaluate(() =>
    (
      globalThis as { Capacitor?: { Plugins: { PrintEngine: { deleteJob(o: { id: string }): Promise<void> } } } }
    ).Capacitor?.Plugins.PrintEngine.deleteJob({
      id: 'mock-intake',
    }),
  );
  await shareAgain(page, 3);
  await expect(page.getByRole('img', { name: /^\d of 3$/ })).toHaveCount(3);
  await expect(page.locator('main h1')).toHaveText('Files received');
});

// ---- Phase 10b: Choose from phone (PLAN §D3, §J0) ----

test('J0 Photos: choose from phone → Received with the photos picked', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Photos/ }).click(); // 1 (the phone's photo picker: 4 picked)
  await expect(page.locator('main h1')).toHaveText('Files received');
  await expect(page.getByRole('img', { name: /^\d of 4$/ })).toHaveCount(4);
  await expect(page.getByText('Coming in the next update', { exact: false })).toHaveCount(0);
});

test('J0 Passport photos: one photo chosen → straight to the frame, then Next → Ready', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Passport photos/ }).click(); // 1
  await expect(page.locator('main h1')).toHaveText('Fit the face in the frame');
  await page.getByRole('button', { name: 'Next' }).click(); // 2
  await expect(page.locator('main h1')).toHaveText('Ready to print');
});

test('J0 Documents & PDF: a PDF chosen → Ready', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Documents & PDF/ }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('1 PDF · 3 pages', { exact: false })).toBeVisible();
});

test('choosing nothing in the picker leaves Home as it was', async ({ page }) => {
  await page.goto('/?mockPick=0');
  await page.getByRole('button', { name: /^Photos/ }).click();
  await page.waitForTimeout(500);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await expect(page.getByText("Couldn't open the phone's files", { exact: false })).toHaveCount(0);
});

test('a picker that cannot open says so where the shopkeeper tapped', async ({ page }) => {
  await page.goto('/?mockPick=fail');
  await page.getByRole('button', { name: /^Photos/ }).click();
  await expect(page.getByText("Couldn't open the phone's files", { exact: false })).toBeVisible();
});

test('Recent jobs says how long files are kept as chosen in Settings (review I4)', async ({ page }) => {
  await withSettings(page, { retention: '7d' });
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await page.getByRole('button', { name: 'Recent jobs' }).click();
  await expect(page.getByText('Customer files are deleted 7 days after they were last used.')).toBeVisible();
});

test('Back from the passport frame after Choose from phone stays on Received (review I1)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Passport photos/ }).click();
  await expect(page.locator('main h1')).toHaveText('Fit the face in the frame');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
  await page.waitForTimeout(1500);
  await expect(page.locator('main h1')).toHaveText('Files received');
});

// ---- Phase 10c: photos on 4×6 photo paper (PLAN §K3) ----

test('photos can print on the shop printer’s 4×6 photo paper: Change → Paper', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockPhotoPaper=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Paper(?! direction| type)/ }).click();
  await expect(page.locator('main h1')).toHaveText('Paper');
  await page.getByRole('button', { name: /4×6 photo paper/ }).click();
  await expect(page.getByText('2 photos · 2 pages · 4×6 photo paper · Colour · 1 copy')).toBeVisible();
});

test('without the printer’s 4×6 paper set up, Paper offers A4 and says how to add photo paper', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Paper(?! direction| type)/ }).click();
  await expect(page.getByText('print the 4×6 test page', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /4×6 photo paper/ })).toHaveCount(0);
});

test('the paper printed last is how the next photo job starts', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockPhotoPaper=1');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Paper(?! direction| type)/ }).click();
  await page.getByRole('button', { name: /4×6 photo paper/ }).click();
  await expect(page.getByText('Put 4×6 photo paper in the printer', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'PAPER LOADED — PRINT' }).click();
  await page.getByRole('button', { name: /Yes/ }).click();
  await shareAgain(page, 3);
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByText('3 photos · 3 pages · 4×6 photo paper', { exact: false })).toBeVisible();
});

test('a small photo on a photo layout says it may print blurry (PLAN §F6: under 100 dpi)', async ({ page }) => {
  await page.goto('/?mockIntake=3&mockDpi=2:90');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.getByText('Photo 2 is small, so it may print blurry.')).toBeVisible();
});

test('a photo at 110 dpi is fine on a photo layout', async ({ page }) => {
  await page.goto('/?mockIntake=3&mockDpi=2:110');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await page.waitForTimeout(500);
  await expect(page.getByText('may print blurry', { exact: false })).toHaveCount(0);
});

// ---- Phase 10c: a phone that cannot print (PLAN §D4, §K12, §I-18) ----

test('a phone with no printing app says so on Home and Help says how to add one', async ({ page }) => {
  await page.goto('/?mockNoPrintService=1');
  await expect(page.getByText('No printing app on this phone yet', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'How to fix it' }).click();
  await expect(page.locator('main h1')).toHaveText('Help');
  await expect(page.getByText('Brother Print Service Plugin', { exact: false }).first()).toBeVisible();
});

test('a phone with a printing app shows no such warning', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await page.waitForTimeout(500);
  await expect(page.getByText('No printing app on this phone yet', { exact: false })).toHaveCount(0);
});

test('a Word file shared with a PDF is named on Ready, never silently left out (PLAN §J8)', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockPdfAt=1&mockOfficeAt=2');
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(
    page.getByText("1 Office file (Word, Excel or PowerPoint) can't be printed yet", { exact: false }),
  ).toBeVisible();
});

test('an Office file among photos says what it is on Received', async ({ page }) => {
  await page.goto('/?mockIntake=3&mockOfficeAt=2');
  await expect(page.getByText("Office file: can't be printed yet. Ask for a PDF.")).toBeVisible();
  await expect(page.getByText('PDFs arrive in a later update', { exact: false })).toHaveCount(0);
});

test('"No" after printing offers Send problem report (PLAN §J8: print looks wrong)', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT', exact: true }).click();
  await page.getByRole('button', { name: /^No/ }).click();
  await page.getByRole('button', { name: 'Send problem report' }).click();
  await expect(page.locator('main h1')).toHaveText('Send problem report');
});

test('a locked PDF can be left out: Print without this file (PLAN §J8)', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockPdfAt=1&mockPdfLocked=1');
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await page.getByRole('button', { name: 'Print without this file' }).click();
  await expect(page.getByText('1 photo · 1 page', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlock' })).toHaveCount(0);
});

test('the Unlock screen also offers Print without this file', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockPdfAt=1&mockPdfLocked=1');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByRole('button', { name: 'Print without this file' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('1 photo · 1 page', { exact: false })).toBeVisible();
});

test('Ready has Previous page / Next page buttons, never swipe-only paging (PLAN §I-5, §H2.4)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/?mockIntake=3');
  await page.getByRole('button', { name: 'One on each page' }).click();
  const prev = page.getByRole('button', { name: 'Previous page' });
  const next = page.getByRole('button', { name: 'Next page' });
  await expect(prev).toBeDisabled();
  await next.click();
  await next.click();
  await expect(page.getByRole('status').filter({ hasText: 'Page 3 of 3' })).toBeVisible();
  await expect(page.locator('ol.sheets > li').nth(2)).toBeInViewport();
  await expect(next).toBeDisabled();
  await prev.click();
  await expect(page.getByRole('status').filter({ hasText: 'Page 2 of 3' })).toBeVisible();
});

// Owner, round 7: a printed job opens on its pages (PRINT is there); its second button is Choose again, back to "What
// did the customer ask?" (review I2: passport photos or an ID card copy from the same file).
test('Recent jobs shows a picture of each job; a printed job opens on its pages and has Choose again (PLAN §I-14)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await page.getByRole('button', { name: 'PRINT', exact: true }).click();
  await page.getByRole('button', { name: /Yes/ }).click();
  await page.getByRole('button', { name: 'Recent jobs' }).click();
  await expect(page.locator('.tile img.tile-image')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Print again' })).toHaveCount(0);
  await page.getByRole('button', { name: /^2 files/ }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('2 photos · 2 pages', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Choose again' }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
  await expect(page.getByRole('button', { name: 'Passport photos' })).toBeVisible();
});

test('first start: four short steps with Next, then Done; never again (PLAN §I-16)', async ({ page }) => {
  await page.goto('/?mockFirstRun=1');
  await expect(page.locator('main h1')).toHaveText('Welcome to PrintSaathi');
  await expect(page.getByText('Step 1 of 4')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 4 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await page.reload();
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await page.waitForTimeout(500);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
});

test('the same photo twice in a document job: Ready offers Remove extra copy (PLAN §J8)', async ({ page }) => {
  await page.goto('/?mockIntake=4&mockPdfAt=2');
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('These photos are the same: 1 and 4')).toBeVisible();
  await page.getByRole('button', { name: 'Remove extra copy' }).click();
  await expect(page.getByText('These photos are the same', { exact: false })).toHaveCount(0);
  await expect(page.getByText('2 photos · 1 PDF', { exact: false })).toBeVisible();
});

// ---- Phase 10c: receiving a big share (PLAN §D2, §I-4, §H2.7) ----

/** A share copied one file every [msEach] (the mock's hook exists once the app has looked for shares). */
const shareSlowly = async (page: import('@playwright/test').Page, n: number, msEach: number) => {
  await page.waitForFunction(() => typeof (globalThis as Record<string, unknown>).__mockShareSlow === 'function');
  await page.evaluate(
    ([k, ms]) =>
      (globalThis as { __mockShareSlow?: (n: number, ms: number) => void }).__mockShareSlow?.(
        k as number,
        ms as number,
      ),
    [n, msEach],
  );
};

test('a big share shows "Receiving files… k of n" with a bar, then the photos', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await shareSlowly(page, 6, 400);
  await expect(page.locator('main h1')).toHaveText('Receiving files');
  await expect(page.getByRole('status').filter({ hasText: /Receiving files… \d of 6/ })).toBeVisible();
  await expect(page.locator('progress')).toBeVisible();
  await expect(page.locator('main h1')).toHaveText('Files received', { timeout: 10_000 });
  await expect(page.getByRole('img', { name: /^\d of 6$/ })).toHaveCount(6);
});

test('Cancel while receiving stops it; what arrived waits in Recent jobs and says so', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await shareSlowly(page, 8, 500);
  await expect(page.locator('main h1')).toHaveText('Receiving files');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await page.waitForTimeout(1500);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi'); // nothing opens by itself after Cancel
  await page.getByRole('button', { name: 'Recent jobs' }).click();
  await page
    .getByRole('button', { name: /files|file/ })
    .first()
    .click();
  await expect(page.getByText(/Receiving was stopped: \d of 8 files arrived\./)).toBeVisible();
});

test('a small quick share never flashes the receiving screen', async ({ page }) => {
  await page.goto('/');
  await shareSlowly(page, 2, 50);
  await expect(page.locator('main h1')).toHaveText('Files received');
  expect(await page.evaluate(() => (globalThis as { __receivingShown?: number }).__receivingShown ?? 0)).toBe(0);
});

// ---- Phase 10c gate review ----

/** The phone's own Back button (e2e builds expose the app's handler). */
const androidBack = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (globalThis as { __androidBack?: () => void }).__androidBack?.());

test('a slow share while a job is open still asks "New files arrived" after Receiving (review I1)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await shareSlowly(page, 4, 500);
  await expect(page.locator('main h1')).toHaveText('Receiving files');
  await expect(page.locator('main h1')).toHaveText('New files arrived', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Add them to this job' }).click();
  await expect(page.getByRole('img', { name: /^\d of 6$/ })).toHaveCount(6);
});

test("the phone's Back on the first-start steps leaves them for good (review I2)", async ({ page }) => {
  await page.goto('/?mockFirstRun=1');
  await expect(page.locator('main h1')).toHaveText('Welcome to PrintSaathi');
  await page.waitForFunction(() => typeof (globalThis as Record<string, unknown>).__androidBack === 'function');
  await androidBack(page);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await page.waitForTimeout(800);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
});

test('Back on Receiving only leaves the screen: the files still arrive and open (review I9)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await shareSlowly(page, 5, 400);
  await expect(page.locator('main h1')).toHaveText('Receiving files');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await expect(page.locator('main h1')).toHaveText('Files received', { timeout: 10_000 });
  await expect(page.getByRole('img', { name: /^\d of 5$/ })).toHaveCount(5);
});

test('Cancel stops only the share being shown (review I9)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await shareSlowly(page, 6, 400);
  await expect(page.locator('main h1')).toHaveText('Receiving files');
  await page.getByRole('button', { name: 'Cancel' }).click();
  const cancelled = await page.evaluate(() => (globalThis as { __cancelledIntakes?: string[] }).__cancelledIntakes);
  expect(cancelled).toHaveLength(1);
});

test('Receiving is never brought back after a restart (review M1)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await shareSlowly(page, 8, 600);
  await expect(page.locator('main h1')).toHaveText('Receiving files');
  await page.reload();
  await expect(page.locator('main h1')).not.toHaveText('Receiving files');
});

test('removing an extra copy on Ready never says a photo cannot be opened (review I3)', async ({ page }) => {
  await page.goto('/?mockIntake=4&mockPdfAt=2');
  await expect(page.getByText('These photos are the same: 1 and 4')).toBeVisible();
  await page.getByRole('button', { name: 'Remove extra copy' }).click();
  await expect(page.getByText('These photos are the same', { exact: false })).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(page.getByText("can't be opened", { exact: false })).toHaveCount(0);
});

test('an iPhone photo in a document job is named once, with what to do (review M3)', async ({ page }) => {
  await page.goto('/?mockIntake=3&mockPdfAt=1&mockHeifAt=2');
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText("1 iPhone photo can't be printed yet.", { exact: false })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByText("can't be opened", { exact: false })).toHaveCount(0);
});

test('a stopped share of a PDF says so on Ready too (review M5)', async ({ page }) => {
  await page.goto('/?mockPdfAt=1');
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await shareSlowly(page, 6, 500);
  await expect(page.locator('main h1')).toHaveText('Receiving files');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Recent jobs' }).click();
  await page
    .getByRole('button', { name: /files|file/ })
    .first()
    .click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(
    page.getByText(/Receiving was stopped: \d of 6 files arrived\. To print the (rest|other one)/),
  ).toBeVisible();
});

test('Recent jobs shows customer photos, so it asks for screenshot protection (review I7)', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (globalThis as { __customerShown?: boolean }).__customerShown)).toBe(false);
  await page.getByRole('button', { name: 'Recent jobs' }).click();
  await expect(page.locator('main h1')).toHaveText('Recent jobs');
  await expect
    .poll(() => page.evaluate(() => (globalThis as { __customerShown?: boolean }).__customerShown))
    .toBe(true);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect
    .poll(() => page.evaluate(() => (globalThis as { __customerShown?: boolean }).__customerShown))
    .toBe(false);
});

test('on 4×6 paper the Change screens count and draw 4×6 sheets, like Ready (review I5)', async ({ page }) => {
  await page.goto('/?mockIntake=6&mockPhotoPaper=1');
  await page.getByRole('button', { name: 'Use more pages' }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Paper(?! direction| type)/ }).click();
  await page.getByRole('button', { name: /4×6 photo paper/ }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  const summary = await page.getByText(/6 photos · \d+ pages? · 4×6 photo paper/).textContent();
  const pages = summary?.match(/· (\d+) pages? ·/)?.[1];
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('button', { name: /^Pages/ })).toContainText(`(${pages} page`);
  await page.getByRole('button', { name: /^Layout/ }).click();
  await expect(page.locator('main .paper').first()).toBeVisible();
  // Every sheet drawn is 4×6 shaped (2:3), not A4 (1:1.414).
  const ratios = await page.locator('main .paper').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return Math.max(r.width, r.height) / Math.min(r.width, r.height);
    }),
  );
  expect(ratios.length).toBeGreaterThan(0);
  for (const r of ratios) expect(r).toBeCloseTo(1.5, 1);
});

test('a job set to 4×6 on a printer without 4×6 set up says it prints on A4, everywhere (review I6)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(
        'mock-settings',
        JSON.stringify({ defaults: { photos: { colour: 'colour', paper: 'PHOTO_4x6' }, documents: { colour: 'bw' } } }),
      );
    }
  });
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  await expect(page.getByText('2 photos · 2 pages · A4 · Colour · 1 copy')).toBeVisible();
  await expect(page.getByText('4×6 photo paper is not set up for this printer, so this prints on A4.')).toBeVisible();
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('button', { name: /^Paper(?! direction| type)/ })).toContainText(
    'A4 (4×6 paper not set up)',
  );
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'PRINT' }).click();
  await page.getByRole('button', { name: /^Yes/ }).click();
  // What printed is what the next photo job starts on: A4, not a 4×6 that never printed.
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mock-settings') ?? '{}').defaults?.photos?.paper))
    .toBe('A4');
});

test('Settings offers 4×6 paper for photos only once the printer’s 4×6 paper is set up (review I6)', async ({
  page,
}) => {
  await page.goto('/?screen=settings');
  await page.getByRole('button', { name: /^Paper for photos/ }).click();
  await expect(page.getByRole('button', { name: /4×6 photo paper/ })).toHaveCount(0);
  await expect(page.getByText('print the 4×6 test page', { exact: false })).toBeVisible();
  await page.goto('/?screen=settings&mockPhotoPaper=1');
  await page.getByRole('button', { name: /^Paper for photos/ }).click();
  await expect(page.getByRole('button', { name: /4×6 photo paper/ })).toHaveCount(1);
});

test('the page buttons stay in reach while paging, and follow the shopkeeper scrolling (review I8)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/?mockIntake=5');
  await page.getByRole('button', { name: 'One on each page' }).click();
  const next = page.getByRole('button', { name: 'Next page' });
  for (let i = 0; i < 3; i++) {
    await next.click();
    await page.waitForTimeout(600);
    await expect(next).toBeInViewport();
  }
  await expect(page.getByRole('status').filter({ hasText: 'Page 4 of 5' })).toBeVisible();
  // Scrolling by hand to the first page: the label follows.
  await page.waitForTimeout(500);
  await page.locator('ol.sheets > li').nth(0).scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector('ol.sheets > li')?.scrollIntoView({ block: 'center' }));
  await expect(page.getByRole('status').filter({ hasText: 'Page 1 of 5' })).toBeVisible();
});

// ---- Phase 11: tap counts (PLAN §A success 2, §J tap rule, §U UX) ----
// Counted inside PrintSaathi from the first tap after Share up to and including PRINT: every tap the shopkeeper makes in the
// app is counted by the page itself (trusted clicks), and the journey ends when the print reaches the phone. Taps in
// Android's own picker (J0) are added as the plan counts them (one: Add / the photo / Open).
const JOURNEYS: { name: string; url: string; taps: (string | RegExp)[]; picker?: number; expected: number }[] = [
  { name: 'J1 photos on one page', url: '/?mockIntake=7', taps: ['All on one page', 'PRINT'], expected: 2 },
  { name: 'J2 photos over more pages', url: '/?mockIntake=6', taps: ['Use more pages', 'PRINT'], expected: 2 },
  { name: 'J3 one photo per page', url: '/?mockIntake=3', taps: ['One on each page', 'PRINT'], expected: 2 },
  {
    name: 'J4 passport photos',
    url: '/?mockIntake=1&mockPhotoPaper=1',
    taps: ['Passport photos', 'Next', 'PAPER LOADED — PRINT'],
    expected: 3,
  },
  { name: 'J5 a PDF', url: '/?mockIntake=1&mockPdfAt=1', taps: ['PRINT'], expected: 1 },
  { name: 'J0 Photos from Home', url: '/', taps: [/^Photos/, 'One on each page', 'PRINT'], picker: 1, expected: 4 },
  {
    name: 'J0 Passport photos from Home',
    url: '/?mockPhotoPaper=1',
    taps: [/^Passport photos/, 'Next', 'PAPER LOADED — PRINT'],
    picker: 1,
    expected: 4,
  },
  { name: 'J0 Documents from Home', url: '/', taps: [/^Documents & PDF/, 'PRINT'], picker: 1, expected: 3 },
  // Phase 14: ID card copy (Received's choice, then the cards screen's Card copy, the size, PRINT).
  {
    name: 'J-card two card photos',
    url: '/?mockIntake=2',
    // Owner, round 4: "let the user see the crop screen" for front and back: a Done on each (two taps more).
    taps: ['ID card copy', 'Done', 'Done', 'Card copy', /^Real card size/, 'PRINT'],
    expected: 6,
  },
  {
    name: 'J-card from Home',
    url: '/',
    // The owner asked for "gallery or file manager?" first (2026-10-23): one decision more than the spec's 5.
    taps: [/^Aadhaar & ID cards/, /^Photos of the card/, 'Done', 'Done', 'Card copy', /^Real card size/, 'PRINT'],
    picker: 1,
    expected: 8,
  },
];

for (const j of JOURNEYS)
  test(`tap count: ${j.name} = ${j.expected} (PLAN §A2)`, async ({ page }) => {
    await page.addInitScript(() => {
      const g = globalThis as { __taps?: number };
      g.__taps = 0;
      document.addEventListener(
        'click',
        (e) => {
          if (e.isTrusted) g.__taps = (g.__taps ?? 0) + 1;
        },
        true,
      );
    });
    await page.goto(j.url);
    for (const name of j.taps) {
      const button = page.getByRole('button', { name, exact: typeof name === 'string' });
      await expect(button).toBeEnabled({ timeout: 10_000 });
      await button.click();
    }
    await expect.poll(() => page.evaluate(() => (globalThis as { __printCalls?: number }).__printCalls ?? 0)).toBe(1);
    const taps = await page.evaluate(() => (globalThis as { __taps?: number }).__taps ?? 0);
    expect(taps + (j.picker ?? 0)).toBe(j.expected);
  });

// ---- Phase 11: what a screen reader and a keyboard meet on every screen (PLAN §U Accessibility, §H2) ----
for (const size of [
  { width: 360, height: 800, text: 100 },
  { width: 320, height: 640, text: 200 },
])
  for (const [screen, reach] of Object.entries(SCREENS))
    test(`screen reader and keyboard: ${screen} @ ${size.width}, text ${size.text} %`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' }); // the resting layout (Phase 13 motion has its own tests)
      await page.setViewportSize({ width: size.width, height: size.height });
      if (reach.route === 'bars') await serveBars(page);
      await page.goto(reach.url);
      for (const name of reach.taps ?? []) await page.getByRole('button', { name }).click();
      if (reach.share) {
        await expect(page.locator('main h1')).not.toHaveText('Files received');
        await shareAgain(page, reach.share);
      }
      if (reach.title) await expect(page.locator('main h1')).toHaveText(reach.title);
      await page.evaluate((t) => {
        document.documentElement.style.fontSize = `${t}%`;
      }, size.text);
      // The first screen is drawn after the app's code has run: under load the page's "load" came first and the check
      // found no screen yet (no title, focus on the page itself). The title gets focus in the same step that draws it.
      await expect(page.locator('main h1')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        const main = document.querySelector('main');
        const h1s = main?.querySelectorAll('h1') ?? [];
        // One title, and the screen reader starts on it (focus-on-route-change).
        if (h1s.length !== 1) out.push(`${h1s.length} titles`);
        if (document.activeElement !== h1s[0])
          out.push(`focus starts on <${document.activeElement?.tagName}>, not the title`);
        // Swiping through the screen goes top to bottom, left to right on a row: the order things are read in. The
        // bottom action bar is read last (it comes last in the page); inside it the same order holds (review I4).
        const all = Array.from(
          main?.querySelectorAll<HTMLElement>(
            'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        ).filter((el) => el.getBoundingClientRect().height > 0);
        for (const focusable of [
          all.filter((el) => !el.closest('.actionbar')),
          all.filter((el) => el.closest('.actionbar')),
        ])
          for (let i = 1; i < focusable.length; i++) {
            const a = (focusable[i - 1] as HTMLElement).getBoundingClientRect();
            const b = (focusable[i] as HTMLElement).getBoundingClientRect();
            const sameRow = Math.abs(b.top - a.top) < 8;
            if (!(b.top >= a.bottom - 4 || (sameRow && b.left >= a.left) || b.top > a.top + 8))
              out.push(
                `read out of order: "${focusable[i]?.textContent?.trim().slice(0, 25)}" after "${focusable[i - 1]?.textContent?.trim().slice(0, 25)}"`,
              );
          }
        return out;
      });
      expect(problems).toEqual([]);
      // Every control shows where the keyboard is (switch access, a keyboard on a tablet): from the first control (Back)
      // to the last, until focus wraps. The ring must be drawn (not clipped by a box around the control) and the control
      // must not sit under a pinned bar (WCAG 2.4.11), gate review I1/I6.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const visited = new Set<string>();
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab');
        const seen = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body || !el.closest('main')) return null;
          const id = `${el.tagName}|${el.textContent?.trim().slice(0, 40)}|${Math.round(el.getBoundingClientRect().top + window.scrollY)}`;
          const what = `<${el.tagName.toLowerCase()}> ${el.textContent?.trim().slice(0, 25)}`;
          const s = getComputedStyle(el);
          const ring = s.boxShadow !== 'none' || (s.outlineStyle !== 'none' && Number.parseFloat(s.outlineWidth) >= 2);
          if (!ring) return { id, problem: `no focus ring on ${what}` };
          const r = el.getBoundingClientRect();
          if (!s.boxShadow.includes('inset'))
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
              const o = getComputedStyle(a);
              if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
              // overflow: clip may paint a little outside the box (overflow-clip-margin).
              const m =
                o.overflowX === 'clip' || o.overflowY === 'clip'
                  ? Number.parseFloat(o.overflowClipMargin || '0') || 0
                  : 0;
              const b = a.getBoundingClientRect();
              const ar = { left: b.left - m, right: b.right + m, top: b.top - m, bottom: b.bottom + m };
              if (r.left - 3 < ar.left || r.right + 3 > ar.right || r.top - 3 < ar.top || r.bottom + 3 > ar.bottom)
                return { id, problem: `focus ring clipped on ${what}` };
            }
          const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
          if (!hit || !(el === hit || el.contains(hit) || hit.contains(el)))
            return { id, problem: `focused ${what} is covered by ${hit?.className || hit?.tagName}` };
          return { id, problem: null };
        });
        if (seen === null || visited.has(seen.id)) break;
        visited.add(seen.id);
        expect(seen.problem).toBeNull();
      }
      expect(visited.size).toBeGreaterThan(0);
    });

// ---- Phase 13: motion (spec Part 1) ----
test('motion: a push enters forward, Back enters back, Home fades', async ({ page }) => {
  await page.goto('/?mockIntake=3');
  await expect(page.locator('main h1')).toHaveText('Files received');
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print'); // the new screen, not Received (review M1)
  await expect(page.locator('.screen-host')).toHaveClass(/enter-forward/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
  await expect(page.locator('.screen-host')).toHaveClass(/enter-back/);
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await expect(page.locator('.screen-host')).toHaveClass(/enter-fade/);
});

test('motion: nothing lasts longer than 400 ms on the main screens', async ({ page }) => {
  // Every animation's end (delay + all its runs) except a busy button's spinner, which turns while work goes on
  // (review M2: endTime, more screens, sampled at once and again).
  const longest = () =>
    page.evaluate(() =>
      Math.max(
        0,
        ...document
          .getAnimations()
          .filter(
            (a) => !((a.effect as KeyframeEffect | null)?.target as Element | null)?.classList.contains('spinner'),
          )
          .map((a) => Number(a.effect?.getComputedTiming().endTime ?? 0)),
      ),
    );
  await page.goto('/?mockIntake=4');
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  expect(await longest()).toBeLessThanOrEqual(400);
  await page.getByRole('button', { name: /^Continue the last job/ }).click();
  await expect(page.locator('main h1')).toHaveText('Files received');
  expect(await longest()).toBeLessThanOrEqual(400);
  await page.getByRole('button', { name: 'All on one page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  expect(await longest()).toBeLessThanOrEqual(400);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Layout/ }).click();
  await expect(page.locator('main h1')).toHaveText('Layout');
  expect(await longest()).toBeLessThanOrEqual(400);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'PRINT', exact: true }).click();
  await expect(page.locator('main h1')).toHaveText('Printing');
  expect(await longest()).toBeLessThanOrEqual(400);
  // Something does move on a normal phone (the test would pass vacuously otherwise).
  await page.getByRole('button', { name: 'Home' }).click();
  expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
});

test('motion: with reduced motion nothing animates on the main screens', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?mockIntake=2');
  const none = () => page.evaluate(() => document.getAnimations().length);
  await expect(page.locator('main h1')).toHaveText('Files received');
  expect(await none()).toBe(0);
  await page.getByRole('button', { name: 'One on each page' }).click();
  await expect(page.locator('main h1')).toHaveText('Ready to print');
  expect(await none()).toBe(0);
  await page.getByRole('button', { name: 'PRINT', exact: true }).click();
  await expect(page.locator('main h1')).toHaveText('Printing');
  expect(await none()).toBe(0);
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.locator('main h1')).toHaveText('PrintSaathi'); // Home itself (review M3)
  expect(await none()).toBe(0);
});

// ---- Phase 13 gate review ----
test('page tools moving a page never replay the entrance (review I1)', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /^Page order/ }).click();
  await page.getByRole('button', { name: 'Page 2' }).click();
  await expect(page.locator('main h1')).toHaveText('Page 2');
  await page.waitForTimeout(400);
  const before = await page.locator('.screen-host').getAttribute('class');
  await page.getByRole('button', { name: /^Move later/ }).click();
  await page.waitForTimeout(30);
  expect(await page.locator('.screen-host').getAttribute('class')).toBe(before);
  // The entrance runs on the screen inside the host: look there (subtree) for an entrance animation.
  const entering = await page
    .locator('.screen-host')
    .evaluate(
      (e) =>
        e.getAnimations({ subtree: true }).filter((a) => (a as CSSAnimation).animationName?.startsWith('ps-enter'))
          .length,
    );
  expect(entering).toBe(0);
});

test('the print check mark stays small at big text on short screens (review I4)', async ({ page }) => {
  for (const vp of [
    { width: 320, height: 640 },
    { width: 800, height: 360 },
  ]) {
    await page.setViewportSize(vp);
    await page.goto('/?mockIntake=2');
    await page.getByRole('button', { name: 'One on each page' }).click();
    await page.getByRole('button', { name: 'PRINT', exact: true }).click();
    await expect(page.locator('.sent-mark svg')).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    const h = await page.locator('.sent-mark svg').evaluate((e) => e.getBoundingClientRect().height);
    expect(h).toBeLessThanOrEqual(vp.height * 0.12 + 1);
  }
});

test('Recent jobs rows do not animate; only short choice lists rise (review I5)', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await page.getByRole('button', { name: 'Recent jobs' }).click();
  await expect(page.locator('main h1')).toHaveText('Recent jobs');
  const moving = await page.evaluate(() =>
    Array.from(document.querySelectorAll('main .tile')).reduce((n, e) => n + e.getAnimations().length, 0),
  );
  expect(moving).toBe(0);
});

test('Back on Home fades (it minimises; nothing slides in) (review M9)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1')).toHaveText('PrintSaathi');
  await page.waitForFunction(() => typeof (globalThis as Record<string, unknown>).__androidBack === 'function');
  await page.evaluate(() => (globalThis as { __androidBack?: () => void }).__androidBack?.());
  await expect(page.locator('.screen-host')).not.toHaveClass(/enter-back/);
});

test("a picker that can't open leaves Home's tiles in place (review M5)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/?mockPick=fail');
  await page.getByRole('button', { name: /^Photos/ }).click();
  await expect(page.getByText("Couldn't open the phone's files", { exact: false })).toBeVisible();
  // Passport photos stays on the same row as Photos: the note does not open a hole in the grid.
  const top = (name: RegExp) => page.getByRole('button', { name }).evaluate((e) => e.getBoundingClientRect().top);
  expect(await top(/^Passport photos/)).toBe(await top(/^Photos/));
});

test('no sideways scroll while a screen slides in (review M7)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/?mockIntake=3');
  await page.getByRole('button', { name: 'One on each page' }).click();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide).toBeLessThanOrEqual(0);
});

test('Continue the last job shows its first photo (spec Part 1)', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await page.getByRole('button', { name: 'Home' }).click();
  await leave(page);
  await expect(page.getByRole('button', { name: /^Continue the last job/ }).locator('img.tile-image')).toHaveCount(1);
});
