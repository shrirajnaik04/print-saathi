import { expect, type Page, test } from '@playwright/test';

// Owner, round 8: "what if someone wants to scan documents? … check screenshots of the doc scanner app. Keep things
// extremely user friendly." The phone's own camera takes each page; the page's corners are found and shown with corner
// circles (scanned pages only); Scanned pages lists them; Finish goes to Ready as a document in Clean colour.
// Mock camera: `?mockCamera=none` (no camera app), `cancel` (closed without a photo); `?mockPage=none` (no page seen).
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
const summary = (page: Page) => page.locator('.summary');
const FOUND = [0.1, 0.08, 0.9, 0.1, 0.88, 0.92, 0.12, 0.9];
type Plan = { pages: { placements: { itemIndex: number; quad?: number[]; style: string }[] }[] };
const lastPlan = (page: Page) => page.evaluate(() => (globalThis as { __lastPlan?: Plan }).__lastPlan);
const corners = async (page: Page) =>
  ((await page.locator('.scan-lines polygon').getAttribute('points')) ?? '')
    .split(' ')
    .flatMap((p) => p.split(',').map((v) => Math.round(Number(v) * 10) / 1000));

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const startScan = async (page: Page, more = '') => {
  await page.goto(`/${more}`);
  await button(page, /^Scan pages/).click();
  await expect(title(page)).toHaveText('Page 1');
};

test('Scan pages: the photo opens as Page 1, the page found, with four corner circles and four side bars', async ({
  page,
}) => {
  await startScan(page);
  await expect(page.locator('.scan-corner')).toHaveCount(4);
  await expect(page.locator('.scan-side')).toHaveCount(4);
  for (const h of await page.locator('.scan-handle').all()) {
    const b = await h.boundingBox();
    expect(b?.width ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
    expect(b?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
  }
  // Corner buttons for screen readers, read top left, top right, bottom left, bottom right.
  expect(await page.locator('.scan-corner').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(
    ['The top left corner', 'The top right corner', 'The bottom left corner', 'The bottom right corner'],
  );
  await expect(page.getByText('Point 1 of 8: top left corner')).toBeVisible();
  await expect.poll(() => corners(page)).toEqual(FOUND);
  for (const name of ['Turn left', 'Turn right', 'Whole photo', 'Retake', 'Done'])
    await expect(button(page, name)).toBeVisible();
});

test('Next point and the arrows move a corner on its own, or a side', async ({ page }) => {
  await startScan(page);
  await expect.poll(() => corners(page)).toEqual(FOUND);
  await button(page, 'Next point').click();
  await expect(page.getByText('Point 2 of 8: top right corner')).toBeVisible();
  await button(page, 'Right').click();
  await expect.poll(async () => (await corners(page))[2]).toBeCloseTo(0.91, 3);
  expect((await corners(page))[0]).toBeCloseTo(0.1, 3); // the other corners stay
  for (let k = 0; k < 3; k++) await button(page, 'Next point').click();
  await expect(page.getByText('Point 5 of 8: top side')).toBeVisible();
  await expect(button(page, 'Left')).toBeDisabled();
  await button(page, 'Up').click();
  await expect.poll(async () => (await corners(page))[1]).toBeCloseTo(0.07, 3);
  expect((await corners(page))[3]).toBeCloseTo(0.09, 3);
  // Tapping a corner circle chooses it.
  await page.getByRole('button', { name: 'The bottom right corner' }).click();
  await expect(page.getByText('Point 3 of 8: bottom right corner')).toBeVisible();
});

test('no page seen: the whole photo, and it says to move the corners', async ({ page }) => {
  await startScan(page, '?mockPage=none');
  await expect(page.getByText("Couldn't find the page's edges. Move the corners onto them.")).toBeVisible();
  expect(await corners(page)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
});

test('Done → Scanned pages; Scan another page → Page 2; Finish → Ready as a document in Clean colour', async ({
  page,
}) => {
  await startScan(page);
  await expect.poll(() => corners(page)).toEqual(FOUND);
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Scanned pages');
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  await button(page, 'Scan another page').click();
  await expect(title(page)).toHaveText('Page 2');
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Scanned pages');
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await button(page, 'Finish (2 pages)').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(summary(page)).toHaveText('Scanned pages · 2 pages · A4 · Colour · Clean colour · 1 copy');
  const plan = await lastPlan(page);
  expect(plan?.pages.length).toBe(2);
  expect(plan?.pages[0]?.placements[0]?.quad).toEqual(FOUND);
  expect(plan?.pages[0]?.placements[0]?.style).toBe('clean');
});

const twoPages = async (page: Page) => {
  await startScan(page);
  await button(page, 'Done').click();
  await button(page, 'Scan another page').click();
  await expect(title(page)).toHaveText('Page 2');
  await button(page, 'Done').click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
};

test('Move earlier, Delete with Undo, and Look for every page', async ({ page }) => {
  await twoPages(page);
  await button(page, 'Move earlier').click();
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await button(page, 'Delete').click();
  await expect(page.getByText('Page deleted.')).toBeVisible();
  await expect(button(page, 'Finish (1 page)')).toBeVisible();
  await button(page, 'Undo').click();
  await expect(button(page, 'Finish (2 pages)')).toBeVisible();
  await page.getByRole('button', { name: /^Black & White/ }).click();
  await expect(page.getByRole('button', { name: /^Black & White/ })).toHaveAttribute('aria-pressed', 'true');
  await button(page, 'Finish (2 pages)').click();
  await expect(summary(page)).toHaveText('Scanned pages · 2 pages · A4 · Black & white · 1 copy');
  const plan = await lastPlan(page);
  // The second photo first (moved earlier; a page added gets a number above every earlier one); every page in the same
  // look.
  const order = plan?.pages.map((p) => p.placements[0]?.itemIndex) ?? [];
  expect(order.length).toBe(2);
  expect(order[0]).toBeGreaterThan(1);
  expect(order[1]).toBe(1);
  expect(plan?.pages.every((p) => p.placements[0]?.style === 'bw')).toBe(true);
});

test('Retake keeps the page in its place', async ({ page }) => {
  await twoPages(page);
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await button(page, 'Fix edges').click();
  await expect(title(page)).toHaveText('Page 1');
  const photo = page.locator('.scan-picture img');
  const before = await photo.getAttribute('src');
  await button(page, 'Retake').click();
  // The new photo, still Page 1.
  await expect.poll(() => photo.getAttribute('src')).not.toBe(before);
  await expect(title(page)).toHaveText('Page 1');
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Scanned pages');
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await button(page, 'Finish (2 pages)').click();
  await expect(summary(page)).toContainText('Scanned pages · 2 pages');
  const order = (await lastPlan(page))?.pages.map((p) => p.placements[0]?.itemIndex) ?? [];
  // The first page is the new photo (not photo 1); the second page is the same as before.
  expect(order.length).toBe(2);
  expect(order[0]).not.toBe(1);
  expect(order[1]).not.toBe(1);
  expect(order[0]).not.toBe(order[1]);
});

test('a scan job opened again from Continue or Recent jobs opens on Scanned pages (review I2)', async ({ page }) => {
  await startScan(page);
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Scanned pages');
  // Home asks before leaving a job not printed yet.
  const leave = async () => {
    await button(page, 'Home').click();
    await button(page, 'Leave').click();
  };
  await leave();
  await button(page, /^Continue the last job/).click();
  await expect(title(page)).toHaveText('Scanned pages');
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  await leave();
  await button(page, 'Recent jobs').click();
  await page.locator('main .tile').first().click();
  await expect(title(page)).toHaveText('Scanned pages');
});

test('a double tap on Scan another page or Retake opens the camera once (review I4)', async ({ page }) => {
  // The camera takes a moment to answer, as a real one does.
  await startScan(page, '?mockCameraSlow=400');
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Scanned pages');
  const calls = () => page.evaluate(() => (globalThis as { __scanCalls?: number }).__scanCalls ?? 0);
  const before = await calls();
  await button(page, 'Scan another page').dblclick();
  await expect(title(page)).toHaveText('Page 2');
  expect((await calls()) - before).toBe(1);
  const again = await calls();
  await button(page, 'Retake').dblclick();
  await page.waitForTimeout(500);
  expect((await calls()) - again).toBe(1);
});

test('a camera that gives no photo says so (review M5)', async ({ page }) => {
  await page.goto('/?mockCamera=empty');
  await button(page, /^Scan pages/).click();
  await expect(page.getByRole('alert')).toContainText("The camera didn't give the photo. Please try again.");
  await expect(title(page)).toHaveText('PrintSaathi');
});

test('Done waits while the page is being looked for (review M3)', async ({ page }) => {
  await page.goto('/?mockPageSlow=1500');
  await button(page, /^Scan pages/).click();
  await expect(title(page)).toHaveText('Page 1');
  await expect(page.getByText('Looking for the page…')).toBeVisible();
  await expect(button(page, 'Done')).toBeDisabled();
  await expect(button(page, 'Done')).toBeEnabled({ timeout: 5000 });
  await expect.poll(() => corners(page)).toEqual(FOUND);
});

test('no camera app says so; nothing else changes', async ({ page }) => {
  await page.goto('/?mockCamera=none');
  await button(page, /^Scan pages/).click();
  await expect(page.getByRole('alert')).toContainText('This phone has no camera app.');
  await expect(title(page)).toHaveText('PrintSaathi');
});

test('the camera closed without a photo changes nothing', async ({ page }) => {
  await page.goto('/?mockCamera=cancel');
  await button(page, /^Scan pages/).click();
  await page.waitForTimeout(300);
  await expect(title(page)).toHaveText('PrintSaathi');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Print style offers Clean colour for every job', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await button(page, 'One on each page').click();
  await button(page, 'Change').click();
  await page.getByRole('button', { name: /^Print style/ }).click();
  await expect(page.getByRole('button', { name: /^Clean colour/ })).toBeVisible();
});

test('a document job can add a page from the camera', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1');
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Change').click();
  await page.getByRole('button', { name: /^Page order/ }).click();
  await button(page, 'Add files').click();
  await page.getByRole('button', { name: /^Scan with camera/ }).click();
  await expect(title(page)).toHaveText(/^Page \d+$/);
  await button(page, 'Done').click();
  await expect(title(page)).not.toHaveText(/^Page \d+$/);
});

test('the Scanned pages screen fits 320 px: no sideways scroll, big buttons', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await startScan(page);
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Scanned pages');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  for (const name of ['Scan another page', 'Fix edges', 'Turn', 'Delete', 'Finish (1 page)']) {
    const b = await button(page, name).boundingBox();
    expect(b?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
  }
});
