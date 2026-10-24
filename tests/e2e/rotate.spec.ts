import { expect, type Page, test } from '@playwright/test';

// Turn a photo to any angle from the photo itself (owner, round 3: WPS's handle; spec 2026-10-24 Phase 28).
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
type Box = { x: number; y: number; w: number; h: number };
type Placement = { itemIndex: number; box: Box; turns: number; tilt?: { deg: number; w: number; h: number } };
type Plan = { rev: number; pages: { placements: Placement[] }[] };
const lastPlan = (page: Page) => page.evaluate(() => (globalThis as { __lastPlan?: Plan }).__lastPlan);
const placementOf = async (page: Page, item: number) =>
  (await lastPlan(page))?.pages.flatMap((p) => p.placements).find((p) => p.itemIndex === item);
const MM = 72 / 25.4;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** One photo, one on each page, on Adjust (a big photo: room for every handle). */
const openOne = async (page: Page, extra = '') => {
  await page.goto(`/?mockIntake=1${extra}`);
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await placementOf(page, 1))?.box.w ?? 0).toBeGreaterThan(0);
  await button(page, 'Adjust photos').click();
  await expect(title(page)).toHaveText('Photo 1 of 1');
};
const back = async (page: Page) => {
  const rev = (await lastPlan(page))?.rev ?? -1;
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await lastPlan(page))?.rev ?? -1).toBeGreaterThan(rev);
};
const handle = (page: Page) => page.locator('.adjust-rotate');
/** The photo's centre on screen (its outline's centre: it turns about it). */
const photoCentre = async (page: Page) => {
  const b = await page.locator('.adjust-pick[data-item="1"]').boundingBox();
  if (!b) throw new Error('no photo');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** Presses the handle and moves the finger around the photo's centre by [deg] (clockwise), in small steps. */
const turnBy = async (page: Page, deg: number, release = true) => {
  const h = await handle(page).boundingBox();
  if (!h) throw new Error('no rotate handle');
  const c = await photoCentre(page);
  const start = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
  const r = Math.hypot(start.x - c.x, start.y - c.y);
  const from = Math.atan2(start.y - c.y, start.x - c.x);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const steps = Math.max(4, Math.ceil(Math.abs(deg) / 3));
  for (let i = 1; i <= steps; i++) {
    const a = from + (((deg * i) / steps) * Math.PI) / 180;
    await page.mouse.move(c.x + r * Math.cos(a), c.y + r * Math.sin(a));
  }
  if (release) await page.mouse.up();
};

test('the rotate handle above the chosen photo turns it to any angle, shows the degrees and saves on release', async ({
  page,
}) => {
  await openOne(page);
  const h = await handle(page).boundingBox();
  const p = await page.locator('.adjust-pick[data-item="1"]').boundingBox();
  // Above the photo's top edge, in the middle, 56 px or more to touch.
  expect(h && p && h.y + h.height <= p.y + 1).toBe(true);
  expect(Math.abs((h?.x ?? 0) + (h?.width ?? 0) / 2 - ((p?.x ?? 0) + (p?.width ?? 0) / 2))).toBeLessThan(2);
  expect(Math.min(h?.width ?? 0, h?.height ?? 0)).toBeGreaterThanOrEqual(56);
  await turnBy(page, 20, false);
  // While turning, the angle shows; the photo on the page turns with the finger.
  await expect(page.locator('.adjust-degrees')).toHaveText('20°');
  await expect(page.locator('.adjust-paper .paper .paper-photo').first()).toHaveAttribute(
    'style',
    /rotate\(20(\.\d)?deg\)/,
  );
  await page.mouse.up();
  await expect(page.locator('.adjust-degrees')).toHaveCount(0);
  // The size line names the angle and the photo's own size (it keeps it when turned, as in Word).
  await expect(page.locator('.adjust-size')).toContainText('20°');
  await back(page);
  const pl = await placementOf(page, 1);
  expect(pl?.turns).toBe(0);
  expect(pl?.tilt?.deg ?? 0).toBeGreaterThanOrEqual(19);
  expect(pl?.tilt?.deg ?? 0).toBeLessThanOrEqual(21);
});

test('within 3° of straight it clicks straight: 88° saves as a quarter turn, no tilt', async ({ page }) => {
  await openOne(page);
  await turnBy(page, 88, false);
  await expect(page.locator('.adjust-degrees')).toHaveText('90°');
  await page.mouse.up();
  await back(page);
  const pl = await placementOf(page, 1);
  expect(pl?.turns).toBe(1);
  expect(pl?.tilt).toBeUndefined();
});

test('Tilt left / Tilt right turn it 1° a tap; Turn keeps the tilt', async ({ page }) => {
  await openOne(page);
  for (let i = 0; i < 3; i++) await button(page, 'Tilt right').click();
  await expect(page.locator('.adjust-size')).toContainText('3°');
  await button(page, 'Tilt left').click();
  await expect(page.locator('.adjust-size')).toContainText('2°');
  await button(page, 'Turn').click();
  await expect(page.locator('.adjust-size')).toContainText('92°');
  await back(page);
  const pl = await placementOf(page, 1);
  expect(pl?.turns).toBe(1);
  expect(pl?.tilt?.deg).toBeCloseTo(2, 6);
});

test('a tilted photo has no side bars and its frame turns with it; its round corner still resizes it', async ({
  page,
}) => {
  await openOne(page);
  await expect(page.locator('.adjust-side')).not.toHaveCount(0);
  await button(page, 'Tilt right').click();
  await expect(page.locator('.adjust-size')).toContainText('1°');
  await expect(page.locator('.adjust-side')).toHaveCount(0);
  // The chosen outline is the photo's own frame, turned (not the box around it).
  await expect(page.locator('.adjust-tilt.adjust-selected')).toHaveAttribute('style', /rotate\(1deg\)/);
  await back(page);
  const before = await placementOf(page, 1);
  await button(page, 'Adjust photos').click();
  // The page is as big as the screen: its bottom corner shows above the pinned tools once scrolled to (as a person does).
  await expect(page.locator('.adjust-tilt .adjust-handle')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const c = await page.locator('.adjust-handle').boundingBox();
  if (!c) throw new Error('no round corner');
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2 - 60, c.y + c.height / 2 - 60, { steps: 8 });
  await page.mouse.up();
  await back(page);
  const after = await placementOf(page, 1);
  // Smaller, still turned 1°: its own size went down.
  expect(after?.tilt?.deg).toBeCloseTo(1, 6);
  expect(Math.max(after?.tilt?.w ?? 0, after?.tilt?.h ?? 0)).toBeLessThan(
    Math.max(before?.tilt?.w ?? 0, before?.tilt?.h ?? 0) - 10,
  );
});

test('the size line gives the photo’s own size when it is turned, not the box around it', async ({ page }) => {
  await openOne(page);
  for (let i = 0; i < 10; i++) await button(page, 'Tilt right').click();
  await expect(page.locator('.adjust-size')).toContainText('10°');
  await back(page);
  const pl = await placementOf(page, 1);
  const own = `${Math.round((pl?.tilt?.w ?? 0) / MM) / 10} × ${Math.round((pl?.tilt?.h ?? 0) / MM) / 10} cm`;
  await button(page, 'Adjust photos').click();
  await expect(page.locator('.adjust-size')).toHaveText(`${own} · 10°`);
});

test('a photo placed by hand turns about its centre', async ({ page }) => {
  await page.goto('/?mockIntake=4');
  await button(page, 'All on one page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Adjust photos').click();
  await button(page, 'Smaller').click();
  // Placed by hand now, well clear of the margins (a turned photo near one is kept inside it).
  for (let i = 0; i < 6; i++) {
    await button(page, 'Move down').click();
    await button(page, 'Move right').click();
  }
  await back(page);
  const a = await placementOf(page, 1);
  await button(page, 'Adjust photos').click();
  for (let i = 0; i < 5; i++) await button(page, 'Tilt right').click();
  await expect(page.locator('.adjust-size')).toContainText('5°');
  await back(page);
  const b = await placementOf(page, 1);
  expect(b?.tilt?.deg).toBeCloseTo(5, 6);
  expect((b?.box.x ?? 0) + (b?.box.w ?? 0) / 2).toBeCloseTo((a?.box.x ?? 0) + (a?.box.w ?? 0) / 2, 1);
  expect((b?.box.y ?? 0) + (b?.box.h ?? 0) / 2).toBeCloseTo((a?.box.y ?? 0) + (a?.box.h ?? 0) / 2, 1);
});

test('document pages, passport photos and ID cards keep Turn: no rotate handle, no Tilt buttons', async ({ page }) => {
  const none = async () => {
    await expect(button(page, 'Turn')).toBeVisible();
    await expect(handle(page)).toHaveCount(0);
    await expect(button(page, 'Tilt right')).toHaveCount(0);
  };
  await page.goto('/?mockIntake=1&mockPdfAt=1');
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Adjust pages').click();
  await none();
  await page.goto('/?mockIntake=1');
  await button(page, 'Passport photos').click();
  await button(page, 'Next').click();
  await button(page, 'Adjust passport photo').click();
  await none();
  await page.goto('/?mockIntake=2');
  await button(page, 'ID card copy').click();
  await button(page, 'Done').click(); // the front's crop screen (owner, round 4)
  await button(page, 'Done').click(); // the back's crop screen (owner, round 4)
  await button(page, 'Card copy').click();
  await button(page, /^Real card size/).click();
  await button(page, 'Adjust cards').click();
  await none();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } });
  test('the handle turns the photo and the Tilt buttons in the sliding row fine-tune it', async ({ page }) => {
    await openOne(page);
    await expect(page.locator('.tool-row')).toBeVisible();
    await turnBy(page, 30);
    await expect(page.locator('.adjust-size')).toContainText('30°');
    await button(page, 'Tilt left').click();
    await expect(page.locator('.adjust-size')).toContainText('29°');
    await back(page);
    const pl = await placementOf(page, 1);
    expect(pl?.tilt?.deg ?? 0).toBeGreaterThanOrEqual(28);
    expect(pl?.tilt?.deg ?? 0).toBeLessThanOrEqual(30);
  });
});

// Review I2 / M4 (round 3): turning keeps the photo's own size and its centre under the finger; on release it never
// snaps back to its old angle first.
test('turned in automatic sizes, a photo keeps its own size (the others flow around it)', async ({ page }) => {
  await page.goto('/?mockIntake=4');
  await button(page, 'All on one page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await placementOf(page, 1))?.box.w ?? 0).toBeGreaterThan(0);
  const before = await placementOf(page, 1);
  const long = Math.max(before?.box.w ?? 0, before?.box.h ?? 0);
  await button(page, 'Adjust photos').click();
  for (let i = 0; i < 5; i++) await button(page, 'Tilt right').click();
  await expect(page.locator('.adjust-size')).toContainText('5°');
  await back(page);
  const after = await placementOf(page, 1);
  expect(Math.max(after?.tilt?.w ?? 0, after?.tilt?.h ?? 0)).toBeCloseTo(long, 1);
});

test('while the handle turns it, the photo turns about its own centre and keeps its size', async ({ page }) => {
  // Saving takes as long as on a phone: the photo must not show its old angle while the turn is saved.
  await openOne(page, '&mockSlowSave=400');
  const shown = () =>
    page.evaluate(() => {
      const e = document.querySelector('.adjust-paper .paper .paper-photo') as HTMLElement;
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: e.offsetWidth, h: e.offsetHeight };
    });
  const a = await shown();
  await turnBy(page, 25, false);
  await expect(page.locator('.adjust-degrees')).toHaveText('25°');
  const b = await shown();
  expect(Math.abs(b.x - a.x)).toBeLessThan(1.5);
  expect(Math.abs(b.y - a.y)).toBeLessThan(1.5);
  expect(Math.abs(b.w - a.w)).toBeLessThan(1.5);
  // Lifted: from then on it is drawn at its new angle; it never shows its old angle again on the way.
  await page.evaluate(() => {
    const seen: string[] = [];
    (globalThis as { __seen?: string[] }).__seen = seen;
    const end = performance.now() + 1500;
    const look = () => {
      const e = document.querySelector('.adjust-paper .paper .paper-photo') as HTMLElement | null;
      seen.push(e?.style.transform ?? '');
      if (performance.now() < end) requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await page.mouse.up();
  await page.waitForTimeout(1700);
  const seen = await page.evaluate(() => (globalThis as { __seen?: string[] }).__seen ?? []);
  expect(seen.length).toBeGreaterThan(10);
  expect(seen.filter((s) => !/rotate\(2[45](\.\d+)?deg\)/.test(s))).toEqual([]);
});

test('turned past the half turn (across the left side), the angle carries on: 300° is −60°', async ({ page }) => {
  await openOne(page);
  await turnBy(page, 300, false);
  await expect(page.locator('.adjust-degrees')).toHaveText('-60°');
  await page.mouse.up();
  await back(page);
  const pl = await placementOf(page, 1);
  expect(pl?.turns).toBe(3);
  expect(pl?.tilt?.deg ?? 0).toBeGreaterThanOrEqual(29);
  expect(pl?.tilt?.deg ?? 0).toBeLessThanOrEqual(31);
});
