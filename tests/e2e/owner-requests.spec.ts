import { expect, type Page, test } from '@playwright/test';

// The owner's small requests while Phases 20–24 were built (2026-10-24, spec Part 7).
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');

test('Home never shows a printer set-up panel, even before any test page (owner: "not needed")', async ({ page }) => {
  await page.goto('/');
  await expect(button(page, /Settings/)).toBeVisible();
  await expect(page.getByText('not set up yet', { exact: false })).toHaveCount(0);
  await expect(button(page, 'Set up the printer')).toHaveCount(0);
  // The test page is still in Settings.
  await button(page, /Settings/).click();
  await expect(button(page, /^Print a test page/)).toBeVisible();
});

test('Home’s logo bar stays at the top while Home scrolls; another screen’s top bar scrolls away', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/');
  const brand = page.locator('.brand-title');
  const before = await brand.boundingBox();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const after = await brand.boundingBox();
  expect(Math.abs((after?.y ?? -999) - (before?.y ?? 0))).toBeLessThan(2);
  // Nothing shows through above it: the bar is opaque.
  expect(await brand.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  // Another screen (Settings) keeps the usual top bar that scrolls with the page.
  await page.evaluate(() => window.scrollTo(0, 0));
  await button(page, /Settings/).click();
  await expect(title(page)).toHaveText('Settings');
  const bar = page.locator('.topbar');
  const top = await bar.boundingBox();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50);
  expect((await bar.boundingBox())?.y ?? 0).toBeLessThan((top?.y ?? 0) - 40);
});

test('Fit the face: Zoom out on the left, Zoom in on the right', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await button(page, 'Passport photos').click();
  await expect(title(page)).toHaveText('Fit the face in the frame');
  const out = await button(page, 'Zoom out').boundingBox();
  const zin = await button(page, 'Zoom in').boundingBox();
  expect(out?.x ?? 999).toBeLessThan(zin?.x ?? 0);
  expect(Math.abs((out?.y ?? 0) - (zin?.y ?? 0))).toBeLessThan(2);
});
