import { expect, type Page, test } from '@playwright/test';

// Press and hold to place a photo anywhere on its page, and its sides to crop (owner, 2026-10-24; spec Part 5).
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
type Box = { x: number; y: number; w: number; h: number };
type Plan = {
  rev: number;
  paper: { wPt: number; hPt: number };
  pages: { placements: { itemIndex: number; box: Box; crop: Box; quad?: number[] }[] }[];
};
const lastPlan = (page: Page) => page.evaluate(() => (globalThis as { __lastPlan?: Plan }).__lastPlan);
const MM = 72 / 25.4;

// Positions are measured at rest: a screen slides in for 240 ms (Phase 13 motion has its own tests).
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const openAdjust = async (page: Page, photos = 4) => {
  await page.goto(`/?mockIntake=${photos}`);
  await button(page, 'All on one page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Adjust photos').click();
  await expect(title(page)).toHaveText(`Photo 1 of ${photos}`);
};
const pick = (page: Page, item: number) => page.locator(`.adjust-pick[data-item="${item}"]`);
const centre = async (page: Page, item: number) => {
  const b = await pick(page, item).boundingBox();
  if (!b) throw new Error(`no photo ${item}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
};
/** Press and hold [item] (0.6 s), drag it by (dx, dy) screen px, let go: a mouse, one finger. */
const holdAndDrag = async (page: Page, item: number, dx: number, dy: number) => {
  const c = await centre(page, item);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 10 });
  await page.mouse.up();
};
/** Done on Adjust, then Ready's plan of the newest job (a change on Adjust: wait until Ready drew it). */
const back = async (page: Page, changed = true) => {
  const rev = (await lastPlan(page))?.rev ?? -1;
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  if (changed) await expect.poll(async () => (await lastPlan(page))?.rev ?? -1).toBeGreaterThan(rev);
};
const boxOf = async (page: Page, item: number) =>
  (await lastPlan(page))?.pages.flatMap((p) => p.placements).find((p) => p.itemIndex === item)?.box;

test('press and hold, then drag: the photo goes where it is dropped; the others stay', async ({ page }) => {
  await openAdjust(page);
  await back(page, false);
  const before = await lastPlan(page);
  await button(page, 'Adjust photos').click();
  const ptPerPx = (before?.paper.wPt ?? 595) / ((await page.locator('.adjust-paper .paper').boundingBox())?.width ?? 1);
  // Photo 1 (at the top-left margin) a little right and well down: free space, no margin in the way.
  await holdAndDrag(page, 1, 20, 80);
  await expect(page.getByRole('status').filter({ hasText: 'Moving photo' })).toHaveCount(0);
  await back(page);
  const moved = await boxOf(page, 1);
  const was = before?.pages[0]?.placements.find((p) => p.itemIndex === 1)?.box;
  // Within the 2 mm a guide may pull it.
  expect(Math.abs((moved?.x ?? 0) - (was?.x ?? 0) - 20 * ptPerPx)).toBeLessThan(2.5 * MM);
  expect(Math.abs((moved?.y ?? 0) - (was?.y ?? 0) - 80 * ptPerPx)).toBeLessThan(2.5 * MM);
  for (const item of [2, 3, 4]) {
    const b = await boxOf(page, item);
    const o = before?.pages[0]?.placements.find((p) => p.itemIndex === item)?.box;
    expect(b?.x).toBeCloseTo(o?.x ?? -1, 3);
    expect(b?.y).toBeCloseTo(o?.y ?? -1, 3);
  }
});

test('while held, it says what is happening; a quick move does not lift a photo', async ({ page }) => {
  await openAdjust(page);
  const c = await centre(page, 2);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await expect(page.getByText('Moving photo 2. Lift your finger to drop it.')).toBeVisible();
  await expect(pick(page, 2)).toHaveClass(/adjust-lifted/);
  await page.mouse.up();
  await expect(pick(page, 2)).not.toHaveClass(/adjust-lifted/);
  // A quick move (no hold): nothing lifts, nothing moves.
  const before = await centre(page, 3);
  await page.mouse.move(before.x, before.y);
  await page.mouse.down();
  await page.mouse.move(before.x + 60, before.y + 60, { steps: 4 });
  await page.mouse.up();
  const after = await centre(page, 3);
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
});

test.describe('with a finger', () => {
  test.use({ hasTouch: true });
  test('hold and drag with a finger places the photo; a cancelled lift saves nothing and the next hold works', async ({
    page,
  }) => {
    await openAdjust(page);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }],
      });
    // Cancelled by the system mid-lift (Review Focus 1): nothing is saved.
    let c = await centre(page, 2);
    await touch('touchStart', c.x, c.y);
    await page.waitForTimeout(600);
    await touch('touchMove', c.x + 20, c.y + 20);
    await touch('touchCancel', 0, 0);
    let after = await centre(page, 2);
    expect(after.x).toBeCloseTo(c.x, 0);
    expect(await page.locator('.adjust-lifted')).toHaveCount(0);
    // The next hold works.
    c = await centre(page, 2);
    await touch('touchStart', c.x, c.y);
    await page.waitForTimeout(600);
    for (let k = 1; k <= 8; k++) await touch('touchMove', c.x + 5 * k, c.y + 8 * k);
    await touch('touchEnd', 0, 0);
    after = await centre(page, 2);
    expect(after.y).toBeGreaterThan(c.y + 40);
  });
});

test('dropped near the page’s middle it snaps there, with a guide line while held', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await button(page, 'All on one page').click();
  await button(page, 'Adjust photos').click();
  await expect(title(page)).toHaveText('Photo 1 of 1');
  // A small photo alone on its page: only the middle lines and the margins to snap to.
  for (let i = 0; i < 8; i++) await button(page, 'Smaller').click();
  const paper = await page.locator('.adjust-paper .paper').boundingBox();
  if (!paper) throw new Error('no paper');
  const c = await centre(page, 1);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForTimeout(600);
  // To about 1 mm right of the middle (the paper is ~0.7 px a point here).
  await page.mouse.move(paper.x + paper.width / 2 + 2, c.y, { steps: 10 });
  await expect(page.locator('.adjust-guide').first()).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.adjust-guide')).toHaveCount(0);
  await back(page);
  const b = await boxOf(page, 1);
  expect((b?.x ?? 0) + (b?.w ?? 0) / 2).toBeCloseTo((210 * MM) / 2, 3);
});

test('Move up / down / left / right move it 2 mm a tap; To next page makes a page for it', async ({ page }) => {
  await openAdjust(page);
  await button(page, 'Move right').click();
  await button(page, 'Move right').click();
  await button(page, 'Move down').click();
  await back(page);
  const first = await boxOf(page, 1);
  await button(page, 'Adjust photos').click();
  await button(page, 'Move left').click();
  await back(page);
  expect(((await boxOf(page, 1))?.x ?? 0) - (first?.x ?? 0)).toBeCloseTo(-2 * MM, 3);
  await button(page, 'Adjust photos').click();
  await expect(button(page, 'Move earlier')).toHaveCount(0); // placed by hand: pages, not order
  await button(page, 'To next page').click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await back(page);
  await expect.poll(async () => (await lastPlan(page))?.pages.length).toBe(2);
  expect((await lastPlan(page))?.pages[1]?.placements.map((p) => p.itemIndex)).toEqual([1]);
});

test('placed by hand, Smaller keeps the photo’s centre (Bigger too, until a margin is in the way)', async ({
  page,
}) => {
  await openAdjust(page);
  await button(page, 'Move down').click(); // placed by hand now
  await back(page);
  const a = await boxOf(page, 1);
  await button(page, 'Adjust photos').click();
  await button(page, 'Smaller').click();
  await back(page);
  const b = await boxOf(page, 1);
  expect(b?.w ?? 0).toBeLessThan((a?.w ?? 0) - 5);
  expect((b?.x ?? 0) + (b?.w ?? 0) / 2).toBeCloseTo((a?.x ?? 0) + (a?.w ?? 0) / 2, 1);
  expect((b?.y ?? 0) + (b?.h ?? 0) / 2).toBeCloseTo((a?.y ?? 0) + (a?.h ?? 0) / 2, 1);
});

test('a photo dropped onto another prints on top, and Adjust and Ready say so; Automatic tidies it all', async ({
  page,
}) => {
  await openAdjust(page);
  const a = await centre(page, 1);
  const b = await centre(page, 2);
  await holdAndDrag(page, 2, a.x - b.x + 10, a.y - b.y + 10);
  await expect(page.getByText('Photo 2 covers part of photo 1.')).toBeVisible();
  await back(page);
  await expect(page.getByText('Some photos cover part of another. Check the preview.')).toBeVisible();
  // The one moved last is drawn last (on top).
  const order = (await lastPlan(page))?.pages[0]?.placements.map((p) => p.itemIndex) ?? [];
  expect(order[order.length - 1]).toBe(2);
  await button(page, 'Adjust photos').click();
  await button(page, 'Automatic').click();
  await expect(page.getByText('covers part of')).toHaveCount(0);
  await back(page);
  await expect(page.getByText('Some photos cover part of another')).toHaveCount(0);
});

// Sides to crop (Word's crop on the same frame, owner 2026-10-24).
test('dragging the left side in cuts the left off and keeps the size of what is left', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await boxOf(page, 1))?.w ?? 0).toBeGreaterThan(0);
  const before = await boxOf(page, 1);
  await button(page, 'Adjust photos').click();
  const side = page.locator('.adjust-side-l');
  await expect(side).toBeVisible();
  const s = await side.boundingBox();
  if (!s) throw new Error('no side handle');
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 + 40, s.y + s.height / 2, { steps: 8 });
  await page.mouse.up();
  await back(page);
  const p = (await lastPlan(page))?.pages[0]?.placements[0];
  expect(p?.crop.x ?? 0).toBeGreaterThan(0.05);
  // The part left keeps its scale: its width on paper over the share of the photo it shows is unchanged.
  expect((p?.box.w ?? 0) / (p?.crop.w ?? 1)).toBeCloseTo(before?.w ?? 0, 0);
});

test('a small photo has no side handles (Crop is the way), its round corner still resizes', async ({ page }) => {
  await openAdjust(page);
  // As small as it goes (2 cm): on this screen every side is shorter than the 96 px the handles need.
  while (await button(page, 'Smaller').isEnabled()) await button(page, 'Smaller').click();
  await expect(page.locator('.adjust-side')).toHaveCount(0);
  await expect(page.locator('.adjust-handle')).toHaveCount(1);
});

/** Drags the chosen photo's [side] handle by (dx, dy) screen px. */
const dragSide = async (page: Page, side: 'l' | 'r' | 't' | 'b', dx: number, dy: number) => {
  const s = await page.locator(`.adjust-side-${side}`).boundingBox();
  if (!s) throw new Error(`no ${side} side handle`);
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 + dx, s.y + s.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
};

test('a side dragged back out brings the photo back, as far as the photo goes', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await button(page, 'One on each page').click();
  await button(page, 'Adjust photos').click();
  await dragSide(page, 'r', -40, 0);
  await back(page);
  expect((await lastPlan(page))?.pages[0]?.placements[0]?.crop.w ?? 1).toBeLessThan(0.95);
  await button(page, 'Adjust photos').click();
  await dragSide(page, 'r', 400, 0);
  await back(page);
  const p = (await lastPlan(page))?.pages[0]?.placements[0];
  expect(p?.crop.w).toBeCloseTo(1, 6);
});

test('a straightened photo’s side crop cuts its straightened picture (the frame’s corners move)', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await button(page, 'One on each page').click();
  await button(page, 'Adjust photos').click();
  await button(page, 'Crop').click();
  await button(page, 'Next corner').click();
  for (let i = 0; i < 6; i++) await button(page, 'Left').click();
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Photo 1 of 1');
  await back(page);
  const before = (await lastPlan(page))?.pages[0]?.placements[0]?.quad;
  expect(before).toHaveLength(8);
  await button(page, 'Adjust photos').click();
  await dragSide(page, 't', 0, 40);
  await back(page);
  const after = (await lastPlan(page))?.pages[0]?.placements[0]?.quad;
  // The top corners moved down the frame; the bottom ones stayed.
  expect(after?.[1] ?? 0).toBeGreaterThan((before?.[1] ?? 0) + 0.02);
  expect(after?.slice(4)).toEqual(before?.slice(4));
});

// Device finding (API 35, 2026-10-24): a long press on the page's label started the phone's text selection.
test('a long press anywhere on the page area never selects text (label and size line included)', async ({ page }) => {
  await openAdjust(page);
  for (const sel of ['.adjust-stage', '.adjust-page', '.adjust-size', '.adjust-paper'])
    expect(
      await page
        .locator(sel)
        .first()
        .evaluate((e) => getComputedStyle(e).userSelect),
    ).toBe('none');
});

// Device findings (API 35, 2026-10-24): the "Moving photo" line pushed the page down when a photo lifted (it then sat
// below the finger), and a snap guide was drawn over the pinned Done bar.
test('lifting a photo never moves the page, and the page’s layers stay under the pinned bar', async ({ page }) => {
  await openAdjust(page);
  const paper = page.locator('.adjust-paper figure');
  const before = await paper.boundingBox();
  const c = await centre(page, 2);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await expect(page.getByText('Moving photo 2.', { exact: false })).toBeVisible();
  const during = await paper.boundingBox();
  await page.mouse.up();
  expect(during?.y).toBeCloseTo(before?.y ?? -1, 0);
  expect(await page.locator('.adjust-paper').evaluate((e) => getComputedStyle(e).isolation)).toBe('isolate');
});

// ---- Whole-branch review findings (2026-10-24) ----
test('a tap where photos overlap picks the one drawn on top, on Adjust and on Ready (review I2)', async ({ page }) => {
  await openAdjust(page);
  const a = await centre(page, 1);
  const b = await centre(page, 2);
  await holdAndDrag(page, 2, a.x - b.x + 10, a.y - b.y + 10); // photo 2 now on top of photo 1
  await button(page, 'Previous photo').click();
  await expect(title(page)).toHaveText('Photo 1 of 4');
  const top = await centre(page, 2);
  await page.mouse.click(top.x - 5, top.y - 5);
  await expect(title(page)).toHaveText('Photo 2 of 4');
  await back(page);
  const paper = await page.locator('.sheets .paper').first().boundingBox();
  const p2 = await boxOf(page, 2);
  const plan = await lastPlan(page);
  if (!paper || !p2 || !plan) throw new Error('no page');
  const s = paper.width / plan.paper.wPt;
  await page.mouse.click(paper.x + (p2.x + 10) * s, paper.y + (p2.y + 10) * s);
  await expect(title(page)).toHaveText('Photo 2 of 4');
});

test('Adjust opened by a tap on a photo on Ready shows its side handles (review I5)', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  const paper = await page.locator('.sheets .paper').first().boundingBox();
  if (!paper) throw new Error('no page');
  await page.mouse.click(paper.x + paper.width / 2, paper.y + paper.height / 3);
  await expect(title(page)).toHaveText('Photo 1 of 1');
  await expect(page.locator('.adjust-side').first()).toBeVisible();
  // Touched at 56 px like every handle the shopkeeper presses.
  const h = await page.locator('.adjust-side').first().boundingBox();
  expect(Math.min(h?.width ?? 0, h?.height ?? 0)).toBeGreaterThanOrEqual(56 - 0.5);
});

test('a lift ends when the app is put away mid-drag, and the next hold works (review I7)', async ({ page }) => {
  await openAdjust(page);
  const c = await centre(page, 2);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await expect(pick(page, 2)).toHaveClass(/adjust-lifted/);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('.adjust-lifted')).toHaveCount(0);
  await expect(page.getByText('Moving photo', { exact: false })).toHaveCount(0);
  await page.mouse.up();
  await holdAndDrag(page, 1, 0, 40);
  await expect(button(page, 'To next page')).toBeVisible();
});

test('holding a photo without moving it changes nothing (the job is not placed by hand)', async ({ page }) => {
  await openAdjust(page);
  const c = await centre(page, 2);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(button(page, 'Move earlier')).toBeVisible();
  await expect(button(page, 'To next page')).toHaveCount(0);
});
