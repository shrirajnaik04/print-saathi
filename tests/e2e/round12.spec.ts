import { expect, type Page, test } from '@playwright/test';

// Round 12 (owner, 2026-11-20): one on each page centred; each photo's corners asked in turn before Ready (the scanner
// app's way); photos of paper cut to the paper and printed saving ink.
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
type Box = { x: number; y: number; w: number; h: number };
type Plan = {
  paper: { wPt: number; hPt: number };
  pages: { placements: { itemIndex: number; box: Box; style: string; quad?: number[] }[] }[];
};
const lastPlan = (page: Page) => page.evaluate(() => (globalThis as { __lastPlan?: Plan }).__lastPlan);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('one on each page: every photo sits in the middle of its page', async ({ page }) => {
  await page.goto('/?mockIntake=3');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await lastPlan(page))?.pages.length).toBe(3);
  const plan = await lastPlan(page);
  for (const pg of plan?.pages ?? []) {
    const b = pg.placements[0]?.box as Box;
    const sideways = (pg as { orientation?: string }).orientation === 'landscape';
    const [w, h] = sideways
      ? [plan?.paper.hPt ?? 0, plan?.paper.wPt ?? 0]
      : [plan?.paper.wPt ?? 0, plan?.paper.hPt ?? 0];
    expect(b.x + b.w / 2).toBeCloseTo(w / 2, 1);
    expect(b.y + b.h / 2).toBeCloseTo(h / 2, 1);
  }
});

test('one on each page asks each photo’s corners in turn, then goes to Ready', async ({ page }) => {
  await page.goto('/?mockIntake=3&cropFirst=1');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Photo 1 of 3');
  await expect(button(page, 'Next')).toBeVisible();
  await button(page, 'Next').click();
  await expect(title(page)).toHaveText('Photo 2 of 3');
  await button(page, 'Next').click();
  await expect(title(page)).toHaveText('Photo 3 of 3');
  // The last one says Done, not Next.
  await expect(button(page, 'Next')).toHaveCount(0);
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
});

test('Skip the rest goes straight to Ready; Back goes back to the choice', async ({ page }) => {
  await page.goto('/?mockIntake=3&cropFirst=1');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Photo 1 of 3');
  await page.getByRole('button', { name: 'Back' }).first().click();
  await expect(button(page, 'One on each page')).toBeVisible();
  await button(page, 'One on each page').click();
  await button(page, 'Skip the rest').click();
  await expect(title(page)).toHaveText('Ready to print');
});

test('without the corners chain (a few photos on one page) nothing is asked: straight to Ready', async ({ page }) => {
  await page.goto('/?mockIntake=3&cropFirst=1');
  await button(page, 'All on one page').click();
  await expect(title(page)).toHaveText('Ready to print');
});

test('photos of paper are cut to the paper and print saving ink: Clean colour, Sharp Black in black & white', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2&mockAutoPage=1');
  await button(page, 'All on one page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(page.getByText('Clean colour', { exact: false }).first()).toBeVisible();
  await expect
    .poll(async () => (await lastPlan(page))?.pages[0]?.placements.every((p) => p.style === 'clean'))
    .toBe(true);
  expect((await lastPlan(page))?.pages[0]?.placements.every((p) => (p.quad?.length ?? 0) === 8)).toBe(true);
  await page.getByRole('button', { name: 'Black & white', exact: true }).click();
  await expect
    .poll(async () => (await lastPlan(page))?.pages[0]?.placements.every((p) => p.style === 'sharp'))
    .toBe(true);
});

test('where no paper is found the photos are left exactly as they are', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockAutoPage=1&mockPage=none');
  await button(page, 'All on one page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await lastPlan(page))?.pages[0]?.placements.length).toBe(2);
  const placements = (await lastPlan(page))?.pages[0]?.placements ?? [];
  expect(placements.every((p) => p.style === 'original' && !p.quad)).toBe(true);
});

// Seen on a device (round 12): a centred photo has its top side bar's touch area across the turn handle's square. The square
// now starts 14 px above the edge: the knob takes touches over its whole size, the bar keeps the rest of its area.
test('the turn knob is whole to touch, and the top side bar keeps its touch area right at the edge', async ({
  page,
}) => {
  await page.goto('/?mockIntake=1');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Adjust photos').click();
  await expect(title(page)).toHaveText('Photo 1 of 1');
  const photo = await page.locator('.adjust-pick[data-item="1"]').boundingBox();
  if (!photo) throw new Error('no photo');
  const at = (above: number) =>
    page.evaluate(
      ([x, y]) => {
        const e = document.elementFromPoint(x as number, y as number) as HTMLElement | null;
        return e?.closest('.adjust-rotate') ? 'rotate' : (e?.className ?? 'none');
      },
      [photo.x + photo.width / 2, photo.y - above],
    );
  for (const above of [18, 24, 32, 40, 48]) expect(await at(above), `${above} px above the edge`).toBe('rotate');
  expect(await at(6)).toContain('adjust-side-t');
});
