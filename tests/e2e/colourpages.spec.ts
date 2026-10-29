import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// Round 10 (owner: "What if some pages need to be printed in colour and some in black and white", and a screenshot of
// Ready where a page picture showed through the status-bar strip above the pinned Previous / Next buttons).
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
const summary = (page: Page) => page.locator('.summary');
const pageSwitch = (page: Page, n: number) => page.getByRole('group', { name: `Colour of page ${n}` });
const topSwitch = (page: Page) => page.getByRole('group', { name: 'Print in', exact: true });
const plannedStyles = (page: Page) =>
  page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __lastPlan: { colour: string; pages: { placements: { style: string }[] }[] };
        }
      ).__lastPlan,
  );
const styles = async (page: Page) => (await plannedStyles(page)).pages.map((p) => p.placements[0]?.style);
// A PDF of four pages; pages 2 and 4 have a red stamp (colour in them).
const FOUR = '/?mockIntake=1&mockPdfAt=1&mockPdfPages=4&mockColourPages=2,4';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function readyWith(page: Page, url: string) {
  await page.goto(url);
  await expect(title(page)).toHaveText('Ready to print');
  await expect(summary(page)).toBeVisible();
}

test('the pinned page buttons cover the status-bar strip above them (owner screenshot)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/?mockIntake=6');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  const pager = page.locator('.pager-pinned');
  await expect(pager).toBeVisible();
  // A phone's status bar is 40 px tall here: the sheets scroll under that strip, so it must be painted over in the
  // page colour (as the brand bar on Home does), or a half picture shows between the clock and the buttons.
  await page.evaluate(() => document.documentElement.style.setProperty('--safe-area-inset-top', '40px'));
  const look = () =>
    pager.evaluate((el) => {
      const s = getComputedStyle(el);
      const probe = document.createElement('i');
      probe.style.color = 'var(--bg)';
      document.body.append(probe);
      const bg = getComputedStyle(probe).color;
      probe.remove();
      return { shadow: s.boxShadow, top: s.top, bg, stuck: el.classList.contains('pager-stuck') };
    });
  // At the top of the page the bar sits in the flow: its band must not paint over the button above it (review I1).
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(async () => (await look()).stuck).toBe(false);
  expect((await look()).shadow).toBe('none');
  // Scrolled until it is stuck at the top, the band covers the status-bar strip.
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect.poll(async () => (await look()).stuck).toBe(true);
  const stuck = await look();
  expect(stuck.top).toBe('40px');
  expect(stuck.shadow).toContain(stuck.bg);
  expect(stuck.shadow).toContain('-40px');
  // ...and goes again when the page is back at the top.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(async () => (await look()).stuck).toBe(false);
});

test('a page with photos of both colours is shown as both, not as Colour (review I4)', async ({ page }) => {
  // No file pictures: the drawn page is what is looked at.
  await page.goto('/?mockIntake=3&mockNoPreview=1');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await pageSwitch(page, 2).getByRole('button', { name: 'Black & white' }).click();
  await expect(summary(page)).toContainText('2 colour, 1 black & white');
  // Back to one page: the page holds a colour photo and a grey one.
  await button(page, 'Change').click();
  await button(page, /^Layout/).click();
  await button(page, /^All on one page/).click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(summary(page)).toContainText('1 with both');
  await expect.poll(async () => (await plannedStyles(page)).colour).toBe('colour');
  await expect(page.locator('.paper-photo-grey')).toHaveCount(1);
});

test('the first guess does not undo All colour when Ready is opened again (review I3)', async ({ page }) => {
  await readyWith(page, FOUR);
  await button(page, 'Choose pages in colour').click();
  await expect(summary(page)).toContainText('2 colour, 2 black & white');
  await button(page, 'All colour').click();
  await expect(summary(page)).toHaveText('1 PDF · 4 pages · A4 · Colour · 1 copy');
  await button(page, 'Change').click();
  await button(page, /^Copies/).click();
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Choose pages in colour').click();
  await page.waitForTimeout(800);
  await expect(summary(page)).toHaveText('1 PDF · 4 pages · A4 · Colour · 1 copy');
});

test('the Print style screen shows both styles of a mixed job (review I5)', async ({ page }) => {
  await readyWith(page, FOUR);
  await pageSwitch(page, 2).getByRole('button', { name: 'Black & white' }).click();
  await button(page, 'Change').click();
  await button(page, /^Print style/).click();
  await button(page, /^Vibrant/).click();
  await button(page, 'Change').click();
  await button(page, /^Print style/).click();
  await button(page, /^Sharp Black/).click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(() => styles(page)).toEqual(['vibrant', 'sharp', 'vibrant', 'vibrant']);
  await button(page, 'Change').click();
  await button(page, /^Print style/).click();
  await expect(button(page, /^Vibrant/)).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, /^Sharp Black/)).toHaveAttribute('aria-pressed', 'true');
});

test('each page has its own Colour | Black & white switch under its picture', async ({ page }) => {
  await readyWith(page, FOUR);
  await expect(summary(page)).toHaveText('1 PDF · 4 pages · A4 · Colour · 1 copy');
  for (const n of [1, 2, 3, 4]) await expect(pageSwitch(page, n)).toBeVisible();
  await pageSwitch(page, 2).getByRole('button', { name: 'Black & white' }).click();
  await expect(summary(page)).toHaveText('1 PDF · 4 pages · A4 · 3 colour, 1 black & white · 1 copy');
  await expect.poll(async () => (await plannedStyles(page)).colour).toBe('colour');
  await expect.poll(() => styles(page)).toEqual(['original', 'bw', 'original', 'original']);
  // The page says which it is; neither half of the top switch is chosen while the colours are mixed.
  await expect(pageSwitch(page, 2).getByRole('button', { name: 'Black & white' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(pageSwitch(page, 1).getByRole('button', { name: 'Colour' })).toHaveAttribute('aria-pressed', 'true');
  for (const b of await topSwitch(page).getByRole('button').all())
    await expect(b).toHaveAttribute('aria-pressed', 'false');
});

test('the top switch sets every page again', async ({ page }) => {
  await readyWith(page, FOUR);
  await pageSwitch(page, 2).getByRole('button', { name: 'Black & white' }).click();
  await pageSwitch(page, 3).getByRole('button', { name: 'Black & white' }).click();
  await expect(summary(page)).toContainText('2 colour, 2 black & white');
  await topSwitch(page).getByRole('button', { name: 'Colour' }).click();
  await expect(summary(page)).toHaveText('1 PDF · 4 pages · A4 · Colour · 1 copy');
  await topSwitch(page).getByRole('button', { name: 'Black & white' }).click();
  await expect(summary(page)).toHaveText('1 PDF · 4 pages · A4 · Black & white · 1 copy');
  await expect.poll(async () => (await plannedStyles(page)).colour).toBe('bw');
});

test('all pages grey by hand is a plain black & white print', async ({ page }) => {
  await readyWith(page, '/?mockIntake=1&mockPdfAt=1&mockPdfPages=2');
  await pageSwitch(page, 1).getByRole('button', { name: 'Black & white' }).click();
  await pageSwitch(page, 2).getByRole('button', { name: 'Black & white' }).click();
  await expect(summary(page)).toHaveText('1 PDF · 2 pages · A4 · Black & white · 1 copy');
  await expect.poll(async () => (await plannedStyles(page)).colour).toBe('bw');
});

test('Choose pages in colour: the first guess keeps pages with colour in them and greys the plain ones', async ({
  page,
}) => {
  await readyWith(page, FOUR);
  await button(page, 'Choose pages in colour').click();
  await expect(page.getByRole('heading', { name: 'Which pages in colour?' })).toBeVisible();
  await expect(summary(page)).toHaveText('1 PDF · 4 pages · A4 · 2 colour, 2 black & white · 1 copy');
  const card = (n: number) => page.getByRole('button', { name: new RegExp(`^Page ${n}: `) });
  await expect(card(1)).toHaveAccessibleName('Page 1: Black & white');
  await expect(card(2)).toHaveAccessibleName('Page 2: Colour');
  await expect(card(3)).toHaveAccessibleName('Page 3: Black & white');
  await expect(card(4)).toHaveAccessibleName('Page 4: Colour');
  await expect.poll(() => styles(page)).toEqual(['bw', 'original', 'bw', 'original']);
  // A tap changes that page; the guess is not made again.
  await card(1).click();
  await expect(card(1)).toHaveAccessibleName('Page 1: Colour');
  await expect(summary(page)).toContainText('3 colour, 1 black & white');
  await button(page, 'All black & white').click();
  await expect(summary(page)).toHaveText('1 PDF · 4 pages · A4 · Black & white · 1 copy');
  await button(page, 'All colour').click();
  await expect(summary(page)).toHaveText('1 PDF · 4 pages · A4 · Colour · 1 copy');
  await expect.poll(async () => (await plannedStyles(page)).colour).toBe('colour');
});

test('a page whose picture cannot be read stays in colour (nothing is greyed without evidence)', async ({ page }) => {
  await readyWith(page, '/?mockIntake=1&mockPdfAt=1&mockPdfPages=3&mockColourPages=1&mockBrokenPageImage=3');
  await button(page, 'Choose pages in colour').click();
  await expect(summary(page)).toContainText('2 colour, 1 black & white');
  await expect.poll(() => styles(page)).toEqual(['original', 'bw', 'original']);
});

test('photos get a colour each, with their own switch', async ({ page }) => {
  await page.goto('/?mockIntake=3');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await pageSwitch(page, 2).getByRole('button', { name: 'Black & white' }).click();
  await expect(summary(page)).toContainText('2 colour, 1 black & white');
  await expect.poll(() => styles(page)).toEqual(['original', 'bw', 'original']);
});

test('no colour choices for one page, nor for passport photos', async ({ page }) => {
  await readyWith(page, '/?mockIntake=1&mockPdfAt=1&mockPdfPages=1');
  await expect(button(page, 'Choose pages in colour')).toHaveCount(0);
  await expect(page.getByRole('group', { name: /^Colour of page/ })).toHaveCount(0);
  await page.goto('/?mockIntake=1');
  await button(page, 'Passport photos').click();
  await expect(title(page)).not.toHaveText('PrintSaathi');
  await page.waitForTimeout(500);
  await expect(page.getByRole('group', { name: /^Colour of page/ })).toHaveCount(0);
  await expect(button(page, 'Choose pages in colour')).toHaveCount(0);
});

test('the chooser fits a 320 px screen at the biggest text, with big controls and no clipped words', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await readyWith(page, FOUR);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await button(page, 'Choose pages in colour').click();
  await expect(page.getByRole('heading', { name: 'Which pages in colour?' })).toBeVisible();
  for (const b of [button(page, 'All colour'), button(page, 'All black & white'), page.locator('.colour-card').first()])
    expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test('Change → Colour says "Some in colour" for a mixed job, and choosing Colour there sets every page', async ({
  page,
}) => {
  await readyWith(page, FOUR);
  await pageSwitch(page, 3).getByRole('button', { name: 'Black & white' }).click();
  await expect(summary(page)).toContainText('3 colour, 1 black & white');
  await button(page, 'Change').click();
  await expect(button(page, /^Colour\s*Some in colour/)).toBeVisible();
  await button(page, /^Colour\s*Some in colour/).click();
  // Neither choice is ticked while the pages differ.
  await expect(page.locator('button.choice')).toHaveCount(2);
  for (const b of await page.locator('button.choice').all()) await expect(b).toHaveAttribute('aria-pressed', 'false');
  await button(page, /^Colour/)
    .first()
    .click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(summary(page)).toHaveText('1 PDF · 4 pages · A4 · Colour · 1 copy');
});

test('Adjust draws the grey pages grey and the colour pages in colour', async ({ page }) => {
  await readyWith(page, FOUR);
  await pageSwitch(page, 2).getByRole('button', { name: 'Black & white' }).click();
  await expect(summary(page)).toContainText('3 colour, 1 black & white');
  await button(page, 'Adjust pages').click();
  await expect(page.locator('.paper-grey')).toHaveCount(1);
});
