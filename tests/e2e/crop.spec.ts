import { expect, type Page, test } from '@playwright/test';

// The scanner app's crop (owner, 2026-10-24): the picture with a frame, a magnifier under the finger, and a bottom bar
// of Cancel, Whole photo, Turn left, Turn right and Done. Round 3 (owner): no corner circles, only the four middle bars,
// each moving its side straight in or out. A frame straightened before (or found on an ID card) keeps its slant;
// `mockQuad=1` gives photo 1 such a frame, as a job saved by 1.0.224 would have.
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

const openCrop = async (page: Page, more = '') => {
  await page.goto(`/?mockIntake=2${more}`);
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

test('the frame has no corner circles: four side bars in reading order, and the bottom bar', async ({ page }) => {
  await openCrop(page);
  await expect(page.locator('.scan-corner')).toHaveCount(0);
  // Buttons for screen readers, read top, left, right, bottom.
  expect(await page.locator('.scan-side').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual([
    'The top side',
    'The left side',
    'The right side',
    'The bottom side',
  ]);
  for (const name of ['Cancel', 'Whole photo', 'Turn left', 'Turn right', 'Done'])
    await expect(button(page, name)).toBeVisible();
  await expect(page.getByText('Side 1 of 4: top')).toBeVisible();
});

test('a side bar moves its side straight in or out, never across the other side', async ({ page }) => {
  await openCrop(page);
  const before = await corners(page);
  await drag(page, '[aria-label="The top side"]', 40, 30); // dragged slanting: only up or down is taken
  const top = await corners(page);
  expect(top[0]?.[1]).toBeGreaterThan((before[0]?.[1] ?? 0) + 5);
  expect(top[1]?.[1]).toBeGreaterThan((before[1]?.[1] ?? 0) + 5);
  expect([top[0]?.[0], top[1]?.[0]]).toEqual([before[0]?.[0], before[1]?.[0]]);
  expect(top.slice(2)).toEqual(before.slice(2));
  await drag(page, '[aria-label="The right side"]', -40, 30); // only sideways is taken
  const right = await corners(page);
  expect(right[1]?.[0]).toBeLessThan((top[1]?.[0] ?? 0) - 5);
  expect([right[1]?.[1], right[2]?.[1]]).toEqual([top[1]?.[1], top[2]?.[1]]);
  // The top dragged below the bottom: refused (the frame keeps its last good shape).
  await drag(page, '[aria-label="The top side"]', 0, 900);
  const kept = await corners(page);
  expect(kept[0]?.[1]).toBeLessThan(kept[3]?.[1] ?? 0);
});

test('Next side and the arrows move the chosen side 1 % a tap; arrows that cannot move it are greyed', async ({
  page,
}) => {
  await openCrop(page);
  await expect(page.getByText('Side 1 of 4: top')).toBeVisible();
  await expect(button(page, 'Left')).toBeDisabled();
  await expect(button(page, 'Right')).toBeDisabled();
  await button(page, 'Down').click();
  expect((await corners(page))[0]?.[1]).toBe(1);
  await button(page, 'Next side').click();
  await expect(page.getByText('Side 2 of 4: right')).toBeVisible();
  await expect(button(page, 'Up')).toBeDisabled();
  await button(page, 'Left').click();
  expect((await corners(page))[1]?.[0]).toBe(99);
  // A bar tapped is the chosen side.
  await page.locator('[aria-label="The bottom side"]').click();
  await expect(page.getByText('Side 3 of 4: bottom')).toBeVisible();
  await expect(page.locator('[aria-label="The bottom side"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the magnifier shows what is under the finger while a bar is held, and goes after', async ({ page }) => {
  await openCrop(page);
  await expect(page.locator('.scan-loupe')).toHaveCount(0);
  await drag(page, '[aria-label="The bottom side"]', 0, -20, async () => {
    await expect(page.locator('.scan-loupe')).toHaveCount(1);
    await expect(page.locator('.scan-loupe img')).toHaveCount(1);
  });
  await expect(page.locator('.scan-loupe')).toHaveCount(0);
  // Held in the top-left third (the left bar of a short frame), it moves out of the way, to the top-right.
  const stage = await page.locator('.scan-stage').boundingBox();
  await drag(page, '[aria-label="The bottom side"]', 0, -(stage?.height ?? 0) * 0.55);
  await drag(page, '[aria-label="The left side"]', 10, 0, async () => {
    await expect(page.locator('.scan-loupe')).toHaveClass(/scan-loupe-right/);
  });
});

test('Done keeps a square frame as a plain crop, and a straightened frame stays straightened', async ({ page }) => {
  await openCrop(page);
  // The top side down, by buttons: three taps (1 % a tap).
  for (let i = 0; i < 3; i++) await button(page, 'Down').click();
  await button(page, 'Done').click();
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await first(page))?.crop.y).toBeCloseTo(0.03, 5);
  expect((await first(page))?.quad).toBeUndefined();
  // A photo straightened by an earlier version: its frame keeps its slant while a side moves.
  await openCrop(page, '&mockQuad=1');
  for (let i = 0; i < 3; i++) await button(page, 'Down').click();
  await button(page, 'Done').click();
  await button(page, 'Done').click();
  // The frame had 8 values from the start: wait for the moved top itself, never the plan from before.
  await expect.poll(async () => (await first(page))?.quad?.[1] ?? 0).toBeCloseTo(0.08, 5);
  const p = await first(page);
  expect(p?.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  expect(p?.quad?.[3]).toBeCloseTo(0.13, 5);
});

test('a slanted frame shows how it will print, made straight; Adjust shows it straight too', async ({ page }) => {
  await openCrop(page, '&mockQuad=1');
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
  await openCrop(page, '&mockQuad=1');
  const before = await corners(page);
  await button(page, 'Turn right').click();
  // Turned clockwise: the frame turns with the photo (another shape on screen), and back again.
  await expect.poll(async () => JSON.stringify(await corners(page))).not.toBe(JSON.stringify(before));
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

// Owner, round 4: the front's crop screen opens by itself; Turn left / Turn right (any way round) in its bar.
test('the ID card crop screen uses the same frame: Turn left / Turn right, and the straightened card below', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2');
  await button(page, 'ID card copy').click();
  await expect(title(page)).toHaveText('Front of the card');
  await expect(page.locator('.scan-corner')).toHaveCount(0);
  await expect(page.locator('.scan-side')).toHaveCount(4);
  for (const name of ['Cancel', 'Whole photo', 'Turn left', 'Turn right', 'Done'])
    await expect(button(page, name)).toBeVisible();
  await expect(button(page, 'Upside down')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'The card, straightened' })).toBeVisible();
});

test.describe('the crop screen at 200 % text on a small phone', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('no sideways scroll, and every control is at least 56 px', async ({ page }) => {
    await openCrop(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    // The bottom bar re-lays itself out a frame after the text size changes (as in the layout matrix).
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await expect(page.locator('.crop-bar .btn')).toHaveCount(5);
    for (const b of await page.locator('.crop-bar .btn').all()) {
      const box = await b.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
    }
  });
});

test('a document’s straightened photo page shows straight in its page tools', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockQuad=1');
  await button(page, 'Print as document').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Change').click();
  await button(page, /^Page order/).click();
  await button(page, 'Page 1').click();
  await button(page, /^Crop/).click();
  for (let i = 0; i < 5; i++) await button(page, 'Down').click();
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Page 1');
  await expect(page.locator('.doc-page-preview img[src*="Card%201%20"]')).toHaveCount(1);
});

test('turned a quarter, the straightened preview fills its box undistorted (review I3)', async ({ page }) => {
  await openCrop(page, '&mockQuad=1');
  await button(page, 'Turn right').click();
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
  // The top side 10 % down: ten taps.
  for (let i = 0; i < 10; i++) await button(page, 'Down').click();
  await button(page, 'Done').click();
  await button(page, 'Done').click();
  await expect.poll(async () => (await placed())?.crop.y ?? 0).toBeCloseTo(0.1, 5);
  const after = (await placed())?.box;
  expect(after?.w).toBeCloseTo(before?.w ?? -1, 1);
  expect(after?.h).toBeCloseTo((before?.h ?? 0) * 0.9, 1);
  expect((after?.y ?? 0) + (after?.h ?? 0)).toBeCloseTo((before?.y ?? 0) + (before?.h ?? 0), 1);
});
