import { expect, type Page, test } from '@playwright/test';

// Adjust on every preview (owner, 2026-10-23): tap a photo → Smaller / Bigger / drag its corner, Turn, Crop, Move,
// Remove; photos flow like Word's "Square" wrap and spill onto new pages by themselves.
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
type Plan = {
  pages: { orientation: string; placements: { itemIndex: number; turns: number; box: { w: number; h: number } }[] }[];
};
const lastPlan = (page: Page) => page.evaluate(() => (globalThis as { __lastPlan?: Plan }).__lastPlan);
const sizeText = (page: Page) => page.locator('.adjust-size').innerText();

const openAdjust = async (page: Page, layout = 'All on one page', photos = 4) => {
  await page.goto(`/?mockIntake=${photos}`);
  await button(page, layout).click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Adjust photos').click();
  await expect(title(page)).toHaveText(`Photo 1 of ${photos}`);
};

test('Adjust from Ready: Bigger grows the chosen photo, and the photos that no longer fit go to a new page', async ({
  page,
}) => {
  await openAdjust(page);
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  const before = await sizeText(page);
  for (let i = 0; i < 4; i++) await button(page, 'Bigger').click();
  expect(await sizeText(page)).not.toBe(before);
  await expect(page.getByText(/^Page 1 of [2-9]$/)).toBeVisible();
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await lastPlan(page))?.pages.length ?? 0).toBeGreaterThan(1);
});

test('Smaller and Bigger stop at the limits; the size is said in cm', async ({ page }) => {
  await openAdjust(page, 'One on each page', 2);
  await expect(page.locator('.adjust-size')).toHaveText(/^\d+(\.\d+)? × \d+(\.\d+)? cm$/);
  await expect(button(page, 'Bigger')).toBeDisabled(); // one on each page: already as big as fits
  for (let i = 0; i < 40 && (await button(page, 'Smaller').isEnabled()); i++) await button(page, 'Smaller').click();
  await expect(button(page, 'Smaller')).toBeDisabled();
  await expect(button(page, 'Bigger')).toBeEnabled();
});

test('dragging the round corner resizes the chosen photo', async ({ page }) => {
  await openAdjust(page);
  const before = await sizeText(page);
  const handle = page.locator('.adjust-handle');
  const b = await handle.boundingBox();
  if (!b) throw new Error('no handle');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 40, b.y + b.height / 2 - 40, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => sizeText(page)).not.toBe(before);
});

// Whole-branch review I1 (2026-10-24): a corner dragged until the photo flows to the next page lost its finger (the
// handle was rebuilt on the other page), so the drag never ended: the screen kept a size that was never saved.
test('dragging a corner until the photo moves to the next page: the screen follows it and prints that size', async ({
  page,
}) => {
  await openAdjust(page);
  for (let i = 0; i < 3; i++) await button(page, 'Next photo').click();
  await expect(title(page)).toHaveText('Photo 4 of 4');
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  const b = await page.locator('.adjust-handle').boundingBox();
  if (!b) throw new Error('no handle');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 400, b.y + b.height / 2 + 400, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByText(/^Page 2 of 2$/)).toBeVisible();
  // The drag is over: the buttons act again and the screen shows what they do.
  const dragged = await sizeText(page);
  await button(page, 'Smaller').click();
  await expect.poll(() => sizeText(page)).not.toBe(dragged);
  const shown = (await sizeText(page))
    .match(/([\d.]+) × ([\d.]+) cm/)
    ?.slice(1)
    .map(Number) ?? [0, 0];
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  const MM = 72 / 25.4;
  // The size printed is the size the screen showed (± 0.5 mm: the screen rounds to a millimetre).
  await expect
    .poll(async () => {
      const box = (await lastPlan(page))?.pages.flatMap((p) => p.placements).find((x) => x.itemIndex === 4)?.box;
      return !!box && Math.abs(box.w / MM - shown[0] * 10) <= 0.5 && Math.abs(box.h / MM - shown[1] * 10) <= 0.5;
    })
    .toBe(true);
});

// Review (2026-10-24): Ready's "photos will be very small" panel offered Use more pages, which threw away the sizes
// the shopkeeper had just chosen (no Undo). Sizes chosen on Adjust are deliberate: no such offer.
test('a photo made small on purpose on Adjust: Ready never offers to undo the sizes chosen', async ({ page }) => {
  await openAdjust(page);
  for (let i = 0; i < 40 && (await button(page, 'Smaller').isEnabled()); i++) await button(page, 'Smaller').click();
  await expect(page.locator('.adjust-size')).toHaveText(/^2 × 1\.5 cm$|^1\.5 × 2 cm$/);
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(button(page, 'Adjust photos')).toBeVisible();
  await expect(button(page, 'Use more pages')).toHaveCount(0);
});

test('Turn turns the chosen photo, and the print follows', async ({ page }) => {
  await openAdjust(page);
  await button(page, 'Turn').click();
  await button(page, 'Done').click();
  await expect
    .poll(async () => (await lastPlan(page))?.pages.flatMap((p) => p.placements).find((x) => x.itemIndex === 1)?.turns)
    .toBe(1);
});

test('tapping another photo on the page chooses it; Next and Previous do too', async ({ page }) => {
  await openAdjust(page);
  const second = page.locator('.adjust-pick').nth(1);
  await second.click();
  await expect(title(page)).toHaveText('Photo 2 of 4');
  await button(page, 'Next photo').click();
  await expect(title(page)).toHaveText('Photo 3 of 4');
  await button(page, 'Previous photo').click();
  await expect(title(page)).toHaveText('Photo 2 of 4');
});

test('Automatic puts every photo back; Back keeps the sizes chosen', async ({ page }) => {
  await openAdjust(page);
  const start = await sizeText(page);
  await button(page, 'Bigger').click();
  const bigger = await sizeText(page);
  expect(bigger).not.toBe(start);
  await button(page, 'Back').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Adjust photos').click();
  await expect(page.locator('.adjust-size')).toHaveText(bigger);
  await button(page, 'Automatic').click();
  await expect(page.locator('.adjust-size')).toHaveText(start);
  await expect(button(page, 'Automatic')).toBeDisabled();
});

test('Remove takes the photo out with Undo; Move later changes the order', async ({ page }) => {
  await openAdjust(page);
  await button(page, 'Move later').click();
  await expect(title(page)).toHaveText('Photo 2 of 4');
  await button(page, 'Remove').click();
  await expect(title(page)).toHaveText(/^Photo \d of 3$/);
  await button(page, 'Undo').click();
  await expect(title(page)).toHaveText(/^Photo \d of 4$/);
});

// Review (2026-10-24): Undo of Remove brought the photo back at an average size, not the size it had. Undo undoes.
test('Undo of Remove brings the photo back at the size it had', async ({ page }) => {
  await openAdjust(page);
  for (let i = 0; i < 4; i++) await button(page, 'Smaller').click();
  const had = (await sizeText(page))
    .match(/([\d.]+) × ([\d.]+) cm/)
    ?.slice(1)
    .map(Number) ?? [0, 0];
  await button(page, 'Remove').click();
  await expect(title(page)).toHaveText(/^Photo \d of 3$/);
  await button(page, 'Undo').click();
  await expect(title(page)).toHaveText(/^Photo \d of 4$/);
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  const MM = 72 / 25.4;
  await expect
    .poll(async () => {
      const box = (await lastPlan(page))?.pages.flatMap((p) => p.placements).find((x) => x.itemIndex === 1)?.box;
      return !!box && Math.abs(box.w / MM - had[0] * 10) <= 0.5 && Math.abs(box.h / MM - had[1] * 10) <= 0.5;
    })
    .toBe(true);
});

test('one on each page: Smaller makes the photo smaller on its own page, centred', async ({ page }) => {
  await openAdjust(page, 'One on each page', 2);
  for (let i = 0; i < 3; i++) await button(page, 'Smaller').click();
  await button(page, 'Done').click();
  await expect.poll(async () => (await lastPlan(page))?.pages.length).toBe(2);
});

test('a tap on a photo on Ready opens Adjust with that photo chosen', async ({ page }) => {
  await page.goto('/?mockIntake=4&mockNoPreview=1');
  await button(page, 'All on one page').click();
  await expect(title(page)).toHaveText('Ready to print');
  const third = page.locator('.sheets figure .paper-photo').nth(2);
  await third.click();
  await expect(title(page)).toHaveText('Photo 3 of 4');
});

type DocPlan = { pages: { placements: { box: { w: number }; turns: number; border?: number }[] }[] };
const firstBoxes = (page: Page) =>
  page.evaluate(() => (globalThis as { __lastPlan?: DocPlan }).__lastPlan?.pages.map((p) => p.placements[0]));

test('documents: Adjust pages makes a page smaller on its sheet and turns it', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1');
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await firstBoxes(page))?.length ?? 0).toBeGreaterThan(0);
  const before = (await firstBoxes(page))?.[0]?.box.w ?? 0;
  await button(page, 'Adjust pages').click();
  await expect(title(page)).toHaveText(/^Page 1 of \d+$/);
  await button(page, 'Smaller').click();
  await button(page, 'Smaller').click();
  await expect(page.locator('.adjust-size')).toContainText('90 %');
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await firstBoxes(page))?.[0]?.box.w ?? 0).toBeCloseTo(before * 0.9, 1);
  // Turning is its own step (a turned page takes another shape on its sheet).
  await button(page, 'Adjust pages').click();
  await button(page, 'Turn').click();
  await button(page, 'Done').click();
  await expect.poll(async () => (await firstBoxes(page))?.[0]?.turns).toBe(1);
});

test('passport: Adjust passport photo makes every photo 1 mm bigger at a time, keeping its shape', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await button(page, 'Passport photos').click();
  await button(page, 'Next').click();
  await button(page, 'Adjust passport photo').click();
  await expect(title(page)).toHaveText('Passport photo');
  await expect(page.locator('.adjust-size')).toContainText('3.5 × 4.5 cm');
  await button(page, 'Bigger').click();
  await expect(page.locator('.adjust-size')).toContainText('3.6 × 4.63 cm');
  await expect(button(page, /^Border/)).toBeVisible();
  await button(page, 'Done').click();
  await expect.poll(async () => Math.round((((await firstBoxes(page))?.[0]?.box.w ?? 0) * 254) / 72) / 10).toBe(36);
});

test('ID cards: Adjust cards makes both cards bigger in 10 % steps and turns the chosen one', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await button(page, 'ID card copy').click();
  await button(page, 'Card copy').click();
  await button(page, /^Real card size/).click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Adjust cards').click();
  await expect(title(page)).toHaveText('Card 1 of 2');
  await button(page, 'Bigger').click();
  await button(page, 'Bigger').click();
  await expect(page.locator('.adjust-size')).toContainText('120 %');
  await button(page, 'Next card').click();
  await expect(title(page)).toHaveText('Card 2 of 2');
  await button(page, 'Turn').click();
  await button(page, 'Done').click();
  await expect(page.getByText(/^ID card · 120 % · A4/)).toBeVisible();
  await expect.poll(async () => (await firstBoxes(page))?.length).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (globalThis as { __lastPlan?: DocPlan }).__lastPlan?.pages[0]?.placements.map((p) => p.turns),
      ),
    )
    .toEqual([0, 2]);
});

// Owner, 2026-10-24 ("Allow to resize. Resizes must be allowed for all sections that have photos in the preview"):
// the round corner resizes ID cards, document pages and passport photos too, exactly as Smaller / Bigger do.
const dragCorner = async (page: Page, dx: number, dy: number) => {
  // A whole page's corner can sit below the screen: brought into view first, as a finger would scroll to it.
  await page.locator('.adjust-handle').scrollIntoViewIfNeeded();
  const b = await page.locator('.adjust-handle').boundingBox();
  if (!b) throw new Error('no round corner');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 10 });
  await page.mouse.up();
};

test('ID cards: dragging the round corner out makes the cards bigger, in the steps Bigger takes', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await button(page, 'ID card copy').click();
  await button(page, 'Card copy').click();
  await button(page, /^Real card size/).click();
  await button(page, 'Adjust cards').click();
  await expect(title(page)).toHaveText('Card 1 of 2');
  await expect(page.getByText('Drag the round corner or use the buttons below.')).toBeVisible();
  await expect(page.locator('.adjust-size')).toContainText('100 %');
  await dragCorner(page, 80, 50);
  await expect(page.locator('.adjust-size')).toHaveText(/^(1[1-9]0|200) % · /);
  const shown = Number((await sizeText(page)).match(/^(\d+) %/)?.[1]);
  await button(page, 'Done').click();
  await expect(page.getByText(new RegExp(`^ID card · ${shown} % · A4`))).toBeVisible();
});

test('documents: dragging the round corner in makes the page smaller on its sheet', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1');
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Adjust pages').click();
  await expect(title(page)).toHaveText(/^Page 1 of \d+$/);
  await expect(page.locator('.adjust-size')).toContainText('100 %');
  await dragCorner(page, -60, -80);
  await expect(page.locator('.adjust-size')).toHaveText(/^([5-9]\d) % · /);
});

test('passport: dragging the round corner out makes every photo bigger, keeping its shape', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await button(page, 'Passport photos').click();
  await button(page, 'Next').click();
  await button(page, 'Adjust passport photo').click();
  await expect(page.locator('.adjust-size')).toContainText('3.5 × 4.5 cm');
  await dragCorner(page, 30, 30);
  await expect.poll(() => sizeText(page)).not.toContain('3.5 × 4.5 cm');
  const [w, h] = ((await sizeText(page)).match(/([\d.]+) × ([\d.]+) cm/)?.slice(1) ?? ['0', '1']).map(Number);
  expect(w).toBeGreaterThan(3.5);
  expect(w / h).toBeCloseTo(35 / 45, 1);
});
