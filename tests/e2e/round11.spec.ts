import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// Round 11 (owner, 2026-11-08): Passport photos first on Home; the resize corner drawn as a crop corner instead of a
// round dot; photos moved between pages by name ("Move to page 2").
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Home shows Passport photos first and Photos next to it (owner: swap them)', async ({ page }) => {
  await page.goto('/');
  await expect(title(page)).toHaveText('PrintSaathi');
  const tiles = page.locator('.tile-grid .tile-title');
  await expect(tiles.nth(0)).toHaveText('Passport photos');
  await expect(tiles.nth(1)).toHaveText('Photos');
  // The others keep their places.
  await expect(tiles).toHaveText([
    'Passport photos',
    'Photos',
    'Documents & PDF',
    'Aadhaar & ID cards',
    'Scan pages',
    'Text message',
  ]);
});

const openAdjust = async (page: Page, layout = 'All on one page', photos = 4) => {
  await page.goto(`/?mockIntake=${photos}`);
  await button(page, layout).click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Adjust photos').click();
  await expect(title(page)).toHaveText(`Photo 1 of ${photos}`);
};

test('the resize corner is a crop corner (an L on the photo’s corner), not a round dot', async ({ page }) => {
  await openAdjust(page);
  const handle = page.locator('.adjust-handle');
  await expect(handle).toBeVisible();
  const look = await handle.evaluate((el) => {
    const s = getComputedStyle(el);
    const bar = (w: 'before' | 'after') => getComputedStyle(el, `::${w}`);
    return {
      radius: s.borderTopLeftRadius,
      background: s.backgroundColor,
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
      // What is drawn on it: the corner's two arms (the L), neither of them round.
      arms: (['before', 'after'] as const).map((w) => ({
        content: bar(w).content,
        radius: bar(w).borderTopLeftRadius,
        clip: bar(w).clipPath,
      })),
    };
  });
  // No round dot: the element itself draws nothing (it is the place to touch), and it is not round.
  expect(look.radius).toBe('0px');
  expect(look.background).toBe('rgba(0, 0, 0, 0)');
  // The place to touch is still at least 56 px each way.
  expect(look.width).toBeGreaterThanOrEqual(56 - 0.5);
  expect(look.height).toBeGreaterThanOrEqual(56 - 0.5);
  // Both pieces of the L are drawn, and none is a circle.
  for (const a of look.arms) {
    expect(a.content).not.toBe('none');
    expect(a.radius).not.toBe('50%');
    // Cut to an L (an arm along each side), never a solid square (review M7).
    expect(a.clip).toMatch(/^polygon\(/);
  }
});

test('the corner sits on the photo’s bottom-right corner: the corner is inside its touch box, which is centred within 32 px of it', async ({
  page,
}) => {
  await openAdjust(page, 'One on each page', 2);
  const pick = await page.locator('.adjust-selected').first().boundingBox();
  const handle = await page.locator('.adjust-handle').boundingBox();
  if (!pick || !handle) throw new Error('no photo or corner');
  const corner = { x: pick.x + pick.width, y: pick.y + pick.height };
  expect(corner.x).toBeGreaterThanOrEqual(handle.x);
  expect(corner.x).toBeLessThanOrEqual(handle.x + handle.width);
  expect(corner.y).toBeGreaterThanOrEqual(handle.y);
  expect(corner.y).toBeLessThanOrEqual(handle.y + handle.height);
  // Not a dot hanging outside the photo (the old dot reached 1 rem past the corner and drew 32 px across it).
  expect(Math.abs(handle.x + handle.width / 2 - corner.x)).toBeLessThanOrEqual(32);
  expect(Math.abs(handle.y + handle.height / 2 - corner.y)).toBeLessThanOrEqual(32);
});

// Move to page: a photo goes to any page by its number, or to a new page, and the screen says where it is.
const mover = (page: Page) => page.getByRole('dialog');
const pageLabel = (page: Page) => page.locator('.adjust-page');
type Box = { x: number; y: number; w: number; h: number };
type Plan = { rev: number; pages: { placements: { itemIndex: number; box: Box }[] }[] };
const lastPlan = (page: Page) => page.evaluate(() => (globalThis as { __lastPlan?: Plan }).__lastPlan);
const done = async (page: Page) => {
  const rev = (await lastPlan(page))?.rev ?? -1;
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await lastPlan(page))?.rev ?? -1).toBeGreaterThan(rev);
};

test('Move to page: from a page with company to a new page, and back to the first page', async ({ page }) => {
  await openAdjust(page);
  await expect(pageLabel(page)).toHaveText('Page 1 of 1');
  await button(page, 'Move to page').click();
  await expect(mover(page).getByRole('heading', { name: 'Move photo 1 to which page?' })).toBeVisible();
  // One page only: a new page is the only place to go (its own page is never listed).
  await expect(mover(page).getByRole('button')).toHaveText(['A new page at the end', 'Cancel']);
  await mover(page).getByRole('button', { name: 'A new page at the end' }).click();
  await expect(mover(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Photo 1 is now on page 2.' })).toBeVisible();
  await expect(pageLabel(page)).toHaveText('Page 2 of 2');
  await done(page);
  expect((await lastPlan(page))?.pages.map((p) => p.placements.map((x) => x.itemIndex).sort())).toEqual([
    [2, 3, 4],
    [1],
  ]);
  // Alone on the last page: back to page 1 only (there is nothing new to make), at the place it had.
  await button(page, 'Adjust photos').click();
  await button(page, 'Move to page').click();
  await expect(mover(page).getByRole('button')).toHaveText(['Page 1 3 photos', 'Cancel']);
  await expect(mover(page).getByRole('button', { name: 'Page 1, 3 photos' })).toBeVisible(); // read as words (M5)
  await mover(page).getByRole('button', { name: 'Page 1, 3 photos' }).click();
  await expect(pageLabel(page)).toHaveText('Page 1 of 1');
  await expect(page.getByRole('status').filter({ hasText: 'Photo 1 is now on page 1.' })).toBeVisible();
  await done(page);
  expect((await lastPlan(page))?.pages.map((p) => p.placements.map((x) => x.itemIndex).sort())).toEqual([[1, 2, 3, 4]]);
});

test('Move to page: any page by its number; the page it left is gone and the others count again', async ({ page }) => {
  await openAdjust(page, 'One on each page', 4);
  await button(page, 'Move to page').click();
  await expect(mover(page).getByRole('button')).toHaveText([
    'Page 2 1 photo',
    'Page 3 1 photo',
    'Page 4 1 photo',
    'A new page at the end',
    'Cancel',
  ]);
  await mover(page).getByRole('button', { name: 'Page 3, 1 photo' }).click();
  // A page is as big as its photo here, so there is no free space: it says so. Page 1 is empty now, so pages 2, 3 and 4
  // became 1, 2 and 3 and the photo is on page 2.
  await expect(
    page.getByRole('status').filter({
      hasText:
        'Photo 1 is now on page 2. There was no free space, so it covers another photo. Move it or make it smaller.',
    }),
  ).toBeVisible();
  await expect(pageLabel(page)).toHaveText('Page 2 of 3');
  await done(page);
  expect((await lastPlan(page))?.pages.map((p) => p.placements.map((x) => x.itemIndex).sort())).toEqual([
    [2],
    [1, 3],
    [4],
  ]);
});

test('Move to page: Undo takes the move back in one step, and Redo does it again', async ({ page }) => {
  await openAdjust(page);
  await button(page, 'Move to page').click();
  await mover(page).getByRole('button', { name: 'A new page at the end' }).click();
  await expect(pageLabel(page)).toHaveText('Page 2 of 2');
  await expect(page.getByRole('status').filter({ hasText: 'Photo 1 is now on page 2.' })).toBeVisible();
  await button(page, 'Undo the last change').click();
  await expect(pageLabel(page)).toHaveText('Page 1 of 1');
  // The note belonged to the move: it is gone with it (review I1).
  await expect(page.getByRole('status').filter({ hasText: 'is now on page' })).toHaveCount(0);
  await button(page, 'Redo what was undone').click();
  await expect(pageLabel(page)).toHaveText('Page 2 of 2');
});

test('Move to page: Cancel, Escape and a photo with nowhere to go change nothing', async ({ page }) => {
  await openAdjust(page, 'One on each page', 2);
  await button(page, 'Next photo').click();
  await expect(title(page)).toHaveText('Photo 2 of 2');
  // Alone on the last page: page 1 only.
  await button(page, 'Move to page').click();
  await expect(mover(page).getByRole('button')).toHaveText(['Page 1 1 photo', 'Cancel']);
  await mover(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(mover(page)).toHaveCount(0);
  await button(page, 'Move to page').click();
  // Escape goes to the list once it is open (pressed before, it would reach the page behind: a race, not the app).
  await expect(mover(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(mover(page)).toHaveCount(0);
  await expect(pageLabel(page)).toHaveText('Page 2 of 2');
  await expect(button(page, 'Undo the last change')).toBeDisabled();
});

test('Move to page: the list fits a 320 px screen at the biggest text, with every choice reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openAdjust(page, 'One on each page', 12);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await button(page, 'Move to page').click();
  const sheet = mover(page);
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box?.width ?? 999).toBeLessThanOrEqual(320);
  expect((box?.y ?? -1) + (box?.height ?? 0)).toBeLessThanOrEqual(640 + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  // Every choice is a big target, and the last one (Cancel) can be reached by scrolling the sheet.
  for (const b of await sheet.getByRole('button').all())
    expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
  await sheet.getByRole('button', { name: 'Cancel' }).scrollIntoViewIfNeeded();
  await expect(sheet.getByRole('button', { name: 'Cancel' })).toBeInViewport();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test('Move to page is off while a photo is held to be moved, and back when it is let go', async ({ page }) => {
  await openAdjust(page);
  const b = await page.locator('.adjust-pick[data-item="1"]').boundingBox();
  if (!b) throw new Error('no photo 1');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await expect(page.getByRole('status').filter({ hasText: 'Moving photo 1.' })).toBeVisible();
  await expect(button(page, 'Move to page')).toBeDisabled();
  await page.mouse.up();
  await expect(button(page, 'Move to page')).toBeEnabled();
});

test('Android Back closes the page list and stays on Adjust (review I3)', async ({ page }) => {
  await openAdjust(page);
  await button(page, 'Move to page').click();
  await expect(mover(page)).toBeVisible();
  await page.evaluate(() => (globalThis as { __androidBack?: () => void }).__androidBack?.());
  await expect(mover(page)).toHaveCount(0);
  await expect(title(page)).toHaveText('Photo 1 of 4');
  // A second Back is the usual one: it leaves Adjust.
  await page.evaluate(() => (globalThis as { __androidBack?: () => void }).__androidBack?.());
  await expect(title(page)).toHaveText('Ready to print');
});

test('the page list opens on its question, not on the first page (review M4)', async ({ page }) => {
  await openAdjust(page, 'One on each page', 4);
  await button(page, 'Move to page').click();
  await expect(mover(page).getByRole('heading', { name: 'Move photo 1 to which page?' })).toBeFocused();
  // Enter on it moves nothing.
  await page.keyboard.press('Enter');
  await expect(mover(page)).toBeVisible();
});

// Owner, round 11: "this blue button doesn't look good, make it a rotate symbol, so it looks like the image can be
// rotated with it. Just solid blue doesn't look good."
test('the turn handle above the photo is a rotation symbol (a circular arrow on a white knob), not a solid blue dot', async ({
  page,
}) => {
  await openAdjust(page);
  const handle = page.locator('.adjust-rotate');
  await expect(handle).toBeVisible();
  // The arrow is a drawn symbol inside the knob, hidden from screen readers (Tilt left and right are the named tools).
  const arrow = handle.locator('svg');
  await expect(arrow).toHaveCount(1);
  const look = await handle.evaluate((el) => {
    const knob = el.querySelector('.icon') as HTMLElement;
    const k = getComputedStyle(knob);
    const svg = knob.querySelector('svg') as SVGElement;
    const b = knob.getBoundingClientRect();
    const h = el.getBoundingClientRect();
    return {
      face: k.backgroundColor,
      round: k.borderTopLeftRadius,
      arrow: getComputedStyle(svg).color,
      primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
      knob: b.width,
      arrowWidth: svg.getBoundingClientRect().width,
      touch: [h.width, h.height],
      hidden: knob.getAttribute('aria-hidden'),
      after: getComputedStyle(el, '::after').content,
    };
  });
  // White face (like the side handles), the arrow in the main colour, and no solid dot drawn by the handle itself.
  expect(look.face).toBe('rgb(255, 255, 255)');
  expect(look.arrow).not.toBe('rgb(255, 255, 255)');
  expect(look.after === 'none' || look.after === 'normal').toBe(true);
  expect(look.round).not.toBe('0px');
  expect(look.hidden).toBe('true');
  // A knob a finger can see (at least 32 px) with an arrow big enough to read (at least 18 px); the place to touch stays 56 px.
  expect(look.knob).toBeGreaterThanOrEqual(32 - 0.5);
  expect(look.arrowWidth).toBeGreaterThanOrEqual(18);
  expect(look.touch[0]).toBeGreaterThanOrEqual(56 - 0.5);
  expect(look.touch[1]).toBeGreaterThanOrEqual(56 - 0.5);
});
