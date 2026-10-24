import { expect, type Page, test } from '@playwright/test';

// The scanner app's crop (owner, 2026-10-24): the picture with a frame, a round handle at each corner (each free: a
// slanted photo is straightened), a pill on each side, a magnifier under the finger, and a bottom bar of Cancel, Whole
// photo, Turn left, Turn right and Done.
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
type Placement = {
  itemIndex: number;
  turns: number;
  crop: { x: number; y: number; w: number; h: number };
  quad?: number[];
  box: { w: number; h: number };
};
type Plan = { pages: { placements: Placement[] }[] };
const lastPlan = (page: Page) => page.evaluate(() => (globalThis as { __lastPlan?: Plan }).__lastPlan);
const first = async (page: Page) => (await lastPlan(page))?.pages[0]?.placements[0];
const frame = (page: Page) => page.locator('.scan-lines polygon');
const corners = async (page: Page) =>
  ((await frame(page).getAttribute('points')) ?? '')
    .split(' ')
    .map((p) => p.split(',').map((v) => Math.round(Number(v) * 1000) / 1000));

const openCrop = async (page: Page) => {
  await page.goto('/?mockIntake=2');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Adjust photos').click();
  await button(page, 'Crop').click();
  await expect(title(page)).toHaveText('Crop photo 1');
};

/** Drags the centre of [sel] by (dx, dy) screen px, in small steps; [during] runs before the finger lifts. */
const drag = async (page: Page, sel: string, dx: number, dy: number, during?: () => Promise<void>) => {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error(`no ${sel}`);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 });
  if (during) await during();
  await page.mouse.up();
};

test('the scanner-style frame: four corner handles, four side handles and the bottom bar', async ({ page }) => {
  await openCrop(page);
  await expect(page.locator('.scan-corner')).toHaveCount(4);
  await expect(page.locator('.scan-side')).toHaveCount(4);
  for (const name of ['Cancel', 'Whole photo', 'Turn left', 'Turn right', 'Done'])
    await expect(button(page, name)).toBeVisible();
  await expect(page.getByText('Corner 1 of 4: top left')).toBeVisible();
});

test('a corner moves on its own and a side moves both its corners; a crossed frame is never taken', async ({
  page,
}) => {
  await openCrop(page);
  const before = await corners(page);
  await drag(page, '[aria-label="The bottom right corner"]', -40, -30); // bottom right
  const after = await corners(page);
  expect(after[2]?.[0]).toBeLessThan((before[2]?.[0] ?? 0) - 5);
  expect(after[0]).toEqual(before[0]);
  expect(after[1]).toEqual(before[1]);
  await drag(page, '.scan-side >> nth=0', 0, 30); // the top side
  const top = await corners(page);
  expect(top[0]?.[1]).toBeGreaterThan((after[0]?.[1] ?? 0) + 5);
  expect(top[1]?.[1]).toBeGreaterThan((after[1]?.[1] ?? 0) + 5);
  expect(top[2]).toEqual(after[2]);
  // The top-left corner dragged past the bottom-right one: refused (the frame keeps its last good shape).
  await drag(page, '[aria-label="The top left corner"]', 600, 600);
  const kept = await corners(page);
  expect(kept[0]?.[0]).toBeLessThan(kept[2]?.[0] ?? 0);
});

test('the magnifier shows what is under the finger while a handle is held, and goes after', async ({ page }) => {
  await openCrop(page);
  await expect(page.locator('.scan-loupe')).toHaveCount(0);
  await drag(page, '[aria-label="The bottom right corner"]', -20, -20, async () => {
    await expect(page.locator('.scan-loupe')).toHaveCount(1);
    await expect(page.locator('.scan-loupe img')).toHaveCount(1);
  });
  await expect(page.locator('.scan-loupe')).toHaveCount(0);
  // Near the top-left corner it moves out of the way, to the top-right.
  await drag(page, '[aria-label="The top left corner"]', 10, 10, async () => {
    await expect(page.locator('.scan-loupe')).toHaveClass(/scan-loupe-right/);
  });
});

test('Done keeps a square frame as a plain crop and a slanted one as a straightened frame', async ({ page }) => {
  await openCrop(page);
  // The top side down, by buttons: two corners, three taps each (1 % a tap).
  for (let i = 0; i < 3; i++) await button(page, 'Down').click();
  await button(page, 'Next corner').click();
  for (let i = 0; i < 3; i++) await button(page, 'Down').click();
  await button(page, 'Done').click();
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await first(page))?.crop.y).toBeCloseTo(0.03, 5);
  expect((await first(page))?.quad).toBeUndefined();
  // Now one corner alone: slanted, so straightened.
  await button(page, 'Adjust photos').click();
  await button(page, 'Crop').click();
  await button(page, 'Next corner').click();
  await button(page, 'Next corner').click();
  for (let i = 0; i < 5; i++) await button(page, 'Left').click();
  await button(page, 'Done').click();
  await button(page, 'Done').click();
  await expect.poll(async () => (await first(page))?.quad?.length).toBe(8);
  const p = await first(page);
  expect(p?.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  expect(p?.quad?.[4]).toBeCloseTo(0.95, 5);
  expect(p?.quad?.[1]).toBeCloseTo(0.03, 5);
});

test('a slanted frame shows how it will print, made straight; Adjust shows it straight too', async ({ page }) => {
  await openCrop(page);
  await button(page, 'Next corner').click();
  for (let i = 0; i < 4; i++) await button(page, 'Down').click();
  await expect(page.getByRole('img', { name: 'The photo, made straight' })).toBeVisible();
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Photo 1 of 2');
  // Adjust draws the engine's straightened picture, not the whole photo.
  // (The test engine's straightened pictures say "Card <item>"; its thumbnails do not.)
  await expect(page.locator('.adjust-paper img[src*="Card%201%20"]')).toHaveCount(1);
});

test('Whole photo, Turn left and Turn right: the photo turns and the frame stays on the same part', async ({
  page,
}) => {
  await openCrop(page);
  await button(page, 'Next corner').click();
  for (let i = 0; i < 10; i++) await button(page, 'Left').click(); // top right 10 % in
  const before = await corners(page);
  await button(page, 'Turn right').click();
  // Turned clockwise: the slanted top-right corner comes to the right side, near the bottom.
  await expect
    .poll(async () => corners(page))
    .toEqual([
      [0, 0],
      [100, 0],
      [100, 90],
      [0, 100],
    ]);
  await button(page, 'Turn left').click();
  await expect.poll(async () => corners(page)).toEqual(before);
  await button(page, 'Turn right').click();
  await button(page, 'Whole photo').click();
  expect(await corners(page)).toEqual([
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ]);
  await button(page, 'Done').click();
  await button(page, 'Done').click();
  await expect.poll(async () => (await first(page))?.turns).toBe(1);
  expect((await first(page))?.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  expect((await first(page))?.quad).toBeUndefined();
});

test('Cancel saves nothing', async ({ page }) => {
  await openCrop(page);
  for (let i = 0; i < 5; i++) await button(page, 'Down').click();
  await button(page, 'Cancel').click();
  await expect(title(page)).toHaveText('Photo 1 of 2');
  await button(page, 'Done').click();
  await expect.poll(async () => (await first(page))?.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  expect((await first(page))?.quad).toBeUndefined();
});

test('Fix corners (ID cards) uses the same frame: Upside down, and the straightened card below', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await button(page, 'ID card copy').click();
  await button(page, 'Fix corners (Front)').click();
  await expect(title(page)).toHaveText('Fix corners');
  await expect(page.locator('.scan-corner')).toHaveCount(4);
  await expect(page.locator('.scan-side')).toHaveCount(4);
  for (const name of ['Cancel', 'Whole photo', 'Upside down', 'Done']) await expect(button(page, name)).toBeVisible();
  await expect(button(page, 'Turn left')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'The card, straightened' })).toBeVisible();
});

test.describe('the crop screen at 200 % text on a small phone', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('no sideways scroll, and every control is at least 56 px', async ({ page }) => {
    await openCrop(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await expect(page.locator('.crop-bar .btn')).toHaveCount(5);
    for (const b of await page.locator('.crop-bar .btn').all()) {
      const box = await b.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
    }
  });
});

test('a document’s photo page straightened in Crop shows straight in its page tools', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await button(page, 'Print as document').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Change').click();
  await button(page, /^Page order/).click();
  await button(page, 'Page 1').click();
  await button(page, /^Crop/).click();
  await button(page, 'Next corner').click();
  for (let i = 0; i < 5; i++) await button(page, 'Left').click();
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Page 1');
  await expect(page.locator('.doc-page-preview img[src*="Card%201%20"]')).toHaveCount(1);
});

test('turned a quarter, the straightened preview fills its box undistorted (review I3)', async ({ page }) => {
  await openCrop(page);
  await button(page, 'Turn right').click();
  await button(page, 'Next corner').click();
  for (let i = 0; i < 6; i++) await button(page, 'Down').click();
  const shot = page.getByRole('img', { name: 'The photo, made straight' });
  await expect(shot.locator('img')).toHaveCount(1);
  const box = await shot.boundingBox();
  const img = await shot.locator('img').boundingBox();
  expect(Math.abs((img?.width ?? 0) - (box?.width ?? -99))).toBeLessThan(3);
  expect(Math.abs((img?.height ?? 0) - (box?.height ?? -99))).toBeLessThan(3);
});

test('cropping a photo placed by hand keeps the part left where it was, at its size (review I4)', async ({ page }) => {
  await page.goto('/?mockIntake=4');
  await button(page, 'All on one page').click();
  await expect(title(page)).toHaveText('Ready to print');
  const item = 1; // Photo 1, the one Adjust opens on
  const placed = async () =>
    (await lastPlan(page))?.pages.flatMap((p) => p.placements).find((p) => p.itemIndex === item);
  await expect.poll(async () => (await placed())?.box.h ?? 0).toBeGreaterThan(0);
  const unmoved = (await placed())?.box.y ?? 0;
  await button(page, 'Adjust photos').click();
  await button(page, 'Move down').click(); // placed by hand: drawn last, so looked up by its number
  await button(page, 'Done').click();
  // The move saved: 2 mm lower.
  await expect.poll(async () => ((await placed())?.box.y ?? 0) - unmoved).toBeCloseTo((2 * 72) / 25.4, 1);
  const before = (await placed())?.box;
  await button(page, 'Adjust photos').click();
  await button(page, 'Crop').click();
  // The top side 10 % down: two corners, ten taps each.
  for (let i = 0; i < 10; i++) await button(page, 'Down').click();
  await button(page, 'Next corner').click();
  for (let i = 0; i < 10; i++) await button(page, 'Down').click();
  await button(page, 'Done').click();
  await button(page, 'Done').click();
  await expect.poll(async () => (await placed())?.crop.y ?? 0).toBeCloseTo(0.1, 5);
  const after = (await placed())?.box;
  expect(after?.w).toBeCloseTo(before?.w ?? -1, 1);
  expect(after?.h).toBeCloseTo((before?.h ?? 0) * 0.9, 1);
  expect((after?.y ?? 0) + (after?.h ?? 0)).toBeCloseTo((before?.y ?? 0) + (before?.h ?? 0), 1);
});
