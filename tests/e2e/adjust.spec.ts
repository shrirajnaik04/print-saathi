import { expect, type Page, test } from '@playwright/test';

// Adjust on every preview (owner, 2026-10-23): tap a photo → Smaller / Bigger / drag its corner, Turn, Crop, Move,
// Remove; photos flow like Word's "Square" wrap and spill onto new pages by themselves.
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
type Plan = {
  rev?: number;
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
  await button(page, 'Done').click(); // the front's crop screen (owner, round 4)
  await button(page, 'Done').click(); // the back's crop screen (owner, round 4)
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
    .toEqual([0, 1]); // Turn is a quarter turn now (owner, round 4: cards turn any way round)
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
  await button(page, 'Done').click(); // the front's crop screen (owner, round 4)
  await button(page, 'Done').click(); // the back's crop screen (owner, round 4)
  await button(page, 'Card copy').click();
  await button(page, /^Real card size/).click();
  await button(page, 'Adjust cards').click();
  await expect(title(page)).toHaveText('Card 1 of 2');
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

// Owner, round 3 ("Increase the size of preview so that we have enough space to do the changes in preview for all
// categories, just like this app", Doc Scanner): the page across the screen, the tools in one sliding row above Done.
const kinds: Record<string, (page: Page) => Promise<void>> = {
  photos: async (page) => {
    await page.goto('/?mockIntake=4');
    await button(page, 'All on one page').click();
    await button(page, 'Adjust photos').click();
  },
  pages: async (page) => {
    await page.goto('/?mockIntake=1&mockPdfAt=1');
    await button(page, 'Adjust pages').click();
  },
  passport: async (page) => {
    await page.goto('/?mockIntake=1');
    await button(page, 'Passport photos').click();
    await button(page, 'Next').click();
    await button(page, 'Adjust passport photo').click();
  },
  cards: async (page) => {
    await page.goto('/?mockIntake=2');
    await button(page, 'ID card copy').click();
    await button(page, 'Done').click(); // the front's crop screen (owner, round 4)
    await button(page, 'Done').click(); // the back's crop screen (owner, round 4)
    await button(page, 'Card copy').click();
    await button(page, /^Real card size/).click();
    await button(page, 'Adjust cards').click();
  },
};

test.describe('a big preview on a phone (owner, round 3)', () => {
  test.use({ viewport: { width: 360, height: 800 } });
  // Owner, round 4: "make the bottom buttons in edit preview small, they are too big consuming a lot of space".
  for (const [kind, open] of Object.entries(kinds))
    test(`Adjust ${kind}: the tools are compact (56-64 px), the row at most 80 px tall`, async ({ page }) => {
      await open(page);
      const row = page.locator('.actionbar .tool-row');
      await expect(row).toBeVisible();
      const heights = await row.locator('.btn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      for (const h of heights) {
        expect(h).toBeGreaterThanOrEqual(56 - 0.5);
        expect(h).toBeLessThanOrEqual(64.5); // two lines of words at most
      }
      expect((await row.boundingBox())?.height ?? 999).toBeLessThanOrEqual(80);
    });
  for (const [kind, open] of Object.entries(kinds))
    test(`Adjust ${kind}: the page is at least 90 % of the screen's width; the tools are one sliding row above Done`, async ({
      page,
    }) => {
      await open(page);
      await expect(page.locator('.adjust-paper figure')).toBeVisible();
      const paper = await page.locator('.adjust-paper figure').boundingBox();
      expect(paper?.width ?? 0).toBeGreaterThanOrEqual(360 * 0.9);
      // One row: every tool on the same line, the row wider than the screen (it slides), its last visible tool cut.
      const row = page.locator('.actionbar .tool-row');
      await expect(row).toBeVisible();
      const tops = await row
        .locator('.btn')
        .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(1);
      const fits = await row.evaluate((e) => e.scrollWidth <= e.clientWidth);
      if (!fits) {
        const cut = await row.locator('.btn').evaluateAll((els) =>
          els.some((e) => {
            const r = e.getBoundingClientRect();
            return r.left < innerWidth && r.right > innerWidth;
          }),
        );
        expect(cut).toBe(true);
      }
      // Done still below the tools.
      const done = await button(page, 'Done').boundingBox();
      const rowBox = await row.boundingBox();
      expect((done?.y ?? 0) >= (rowBox?.y ?? 0) + (rowBox?.height ?? 0) - 1).toBe(true);
    });

  test('every tool in the row can be reached: Tab brings it into view', async ({ page }) => {
    await kinds.photos?.(page);
    const row = page.locator('.actionbar .tool-row');
    const last = row.locator('.btn').last();
    await last.focus();
    const b = await last.boundingBox();
    expect((b?.x ?? -1) >= 0 && (b?.x ?? 999) + (b?.width ?? 0) <= 360 + 0.5).toBe(true);
  });
});

test.describe('held sideways (800 × 360)', () => {
  test.use({ viewport: { width: 800, height: 360 } });
  test('the tools sit beside the page, not in a row under it', async ({ page }) => {
    await kinds.photos?.(page);
    await expect(page.locator('.actionbar .tool-row')).toHaveCount(0);
    const grid = await page.locator('.adjust-body .tool-grid').boundingBox();
    const paper = await page.locator('.adjust-paper figure').boundingBox();
    expect((grid?.x ?? 0) >= (paper?.x ?? 0) + (paper?.width ?? 0) - 1).toBe(true);
  });
});

// Owner, round 4: "when it's page 2 of 2 … allow to scroll through all the pages … see all pages content in preview
// edit": the pages side by side, the next and previous showing at the sides, ‹ › beside "Page n of N".
test.describe('pages side by side (owner, round 4)', () => {
  test.use({ viewport: { width: 412, height: 915 } });
  const twoPages = async (page: Page) => {
    await page.goto('/?mockIntake=2');
    await button(page, 'One on each page').click();
    await expect(title(page)).toHaveText('Ready to print');
    await button(page, 'Adjust photos').click();
    await expect(title(page)).toHaveText('Photo 1 of 2');
  };
  const label = (page: Page) => page.locator('.adjust-page');
  test("a two-page job shows page 2's edge beside page 1", async ({ page }) => {
    await twoPages(page);
    await expect(label(page)).toHaveText(/^Page 1 of 2/);
    const strip = await page.locator('.adjust-strip').boundingBox();
    const next = await page.locator('.adjust-sheet[data-page="1"]').boundingBox();
    if (!strip || !next) throw new Error('no strip or page 2');
    const showing = strip.x + strip.width - next.x;
    expect(showing).toBeGreaterThanOrEqual(4);
    expect(showing).toBeLessThanOrEqual(40);
  });
  const centred = async (page: Page, n: number) => {
    const strip = await page.locator('.adjust-strip').boundingBox();
    const sheet = await page.locator(`.adjust-sheet[data-page="${n}"]`).boundingBox();
    return Math.abs((sheet?.x ?? 0) + (sheet?.width ?? 0) / 2 - ((strip?.x ?? 0) + (strip?.width ?? 0) / 2));
  };
  test('Show next page brings page 2 to the middle and chooses its photo; Show previous page goes back', async ({
    page,
  }) => {
    await twoPages(page);
    await button(page, 'Show next page').click();
    await expect(label(page)).toHaveText(/^Page 2 of 2/);
    // Said aloud (TalkBack) when ‹ › move the pages.
    await expect(label(page)).toHaveAttribute('aria-live', 'polite');
    // The tools never change a photo out of sight: on page 2, its photo is the chosen one.
    await expect(title(page)).toHaveText('Photo 2 of 2');
    await button(page, 'Show previous page').click();
    await expect(label(page)).toHaveText(/^Page 1 of 2/);
    await expect(title(page)).toHaveText('Photo 1 of 2');
  });
  test('page 2 stays in the middle when the screen changes size (turned, review M1)', async ({ page }) => {
    await twoPages(page);
    await button(page, 'Show next page').click();
    await expect(label(page)).toHaveText(/^Page 2 of 2/);
    const v = page.viewportSize() ?? { width: 412, height: 915 };
    await page.setViewportSize({ width: v.width + 120, height: v.height });
    await expect.poll(() => centred(page, 1)).toBeLessThan(2);
  });
  // Owner, round 5: "disable finger swipe between pages, keep only previous and next, as fast as possible".
  test('sliding sideways over the page never changes the page (‹ › only)', async ({ page }) => {
    await twoPages(page);
    const photo = await page.locator('.adjust-sheet[data-page="0"] .adjust-pick').boundingBox();
    if (!photo) throw new Error('no photo on page 1');
    const left = () => page.locator('.adjust-strip').evaluate((e) => e.scrollLeft);
    const before = await left();
    await page.mouse.move(photo.x + photo.width / 2, photo.y + photo.height / 2);
    await page.mouse.wheel(600, 0);
    await page.waitForTimeout(400);
    expect(await left()).toBe(before);
    await expect(label(page)).toHaveText(/^Page 1 of 2/);
    await expect(title(page)).toHaveText('Photo 1 of 2');
  });
  test('‹ › move the page at once, never sliding (motion allowed)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await twoPages(page);
    const at = await page.evaluate(async () => {
      const b = document.querySelector<HTMLButtonElement>('button[aria-label="Show next page"]');
      b?.click();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const strip = document.querySelector('.adjust-strip')?.getBoundingClientRect();
      const sheet = document.querySelector('.adjust-sheet[data-page="1"]')?.getBoundingClientRect();
      return strip && sheet ? Math.abs(sheet.x + sheet.width / 2 - (strip.x + strip.width / 2)) : 999;
    });
    expect(at).toBeLessThan(3);
  });
  test('a tap on another photo on page 2 chooses it; Next photo brings its page to the middle', async ({ page }) => {
    await page.goto('/?mockIntake=4');
    await button(page, 'Use more pages').click();
    await button(page, 'Change').click();
    await page.getByRole('button', { name: /^Pages/ }).click();
    await page.getByRole('button', { name: /^2 pages/ }).click();
    await expect(title(page)).toHaveText('Ready to print');
    await button(page, 'Adjust photos').click();
    await expect(title(page)).toHaveText('Photo 1 of 4');
    await button(page, 'Next photo').click();
    await expect(label(page)).toHaveText(/^Page 1 of 2/);
    await button(page, 'Next photo').click();
    await expect(title(page)).toHaveText('Photo 3 of 4');
    await expect(label(page)).toHaveText(/^Page 2 of 2/);
    await expect.poll(() => centred(page, 1)).toBeLessThan(3);
    await page.locator('.adjust-sheet[data-page="1"] .adjust-pick[data-item="4"]').click();
    await expect(title(page)).toHaveText('Photo 4 of 4');
    await expect(label(page)).toHaveText(/^Page 2 of 2/);
  });
  test("the turn handle of a photo at a page's top is whole (the strip does not cut it)", async ({ page }) => {
    await twoPages(page);
    const box = await page.locator('.adjust-rotate').boundingBox();
    if (!box) throw new Error('no turn handle');
    // The round dot's top half, where a finger presses it: the handle is there, not cut off by the strip.
    const hit = await page.evaluate(
      ([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.className ?? '',
      [box.x + box.width / 2, box.y + 16],
    );
    expect(hit).toContain('adjust-rotate');
  });
  // Owner: "see all pages content in preview edit": a document's pages show their pictures; a long job draws only the
  // page in the middle and its neighbours (never every page's pictures at once, PLAN §P).
  const pictured = (page: Page) =>
    page
      .locator('.adjust-sheet')
      .evaluateAll((els) => els.map((e) => e.querySelectorAll('img[src]:not([src=""])').length > 0));
  test("a document's pages show their pictures, the next one when it comes to the middle", async ({ page }) => {
    await page.goto('/?mockIntake=1&mockPdfAt=1');
    await button(page, 'Adjust pages').click();
    await expect(title(page)).toHaveText('Page 1 of 3');
    await expect.poll(() => pictured(page)).toEqual([true, true, false]);
    await button(page, 'Show next page').click();
    await expect(title(page)).toHaveText('Page 2 of 3');
    await expect.poll(() => pictured(page)).toEqual([true, true, true]);
  });
  test('a long job draws only the page in the middle and its neighbours', async ({ page }) => {
    await page.goto('/?mockIntake=5');
    await button(page, 'One on each page').click();
    await button(page, 'Adjust photos').click();
    await expect(title(page)).toHaveText('Photo 1 of 5');
    await expect.poll(() => pictured(page)).toEqual([true, true, false, false, false]);
    await button(page, 'Show next page').click();
    await button(page, 'Show next page').click();
    await expect(label(page)).toHaveText(/^Page 3 of 5/);
    await expect.poll(() => pictured(page)).toEqual([false, true, true, true, false]);
  });
  test('one page: no ‹ ›', async ({ page }) => {
    await page.goto('/?mockIntake=4');
    await button(page, 'All on one page').click();
    await button(page, 'Adjust photos').click();
    await expect(title(page)).toHaveText('Photo 1 of 4');
    await expect(button(page, 'Show next page')).toHaveCount(0);
    await expect(label(page)).toHaveText(/^Page 1 of 1/);
  });
});

// Owner, round 4: "allow making the page to zoom in and zoom out so that we can even work on smaller images precisely".
test.describe('zoom (owner, round 4)', () => {
  test.use({ viewport: { width: 412, height: 915 } });
  const label = (page: Page) => page.locator('.adjust-page');
  const paperW = async (page: Page) => (await page.locator('.adjust-paper figure').boundingBox())?.width ?? 0;
  // Owner, round 7: on photos Cut, Copy, Crop, Turn, Undo, Redo and Paste come first; zoom follows them.
  test('Zoom out / Zoom in: first on pages, after Paste on photos, 56 px or more; 100 % to start', async ({ page }) => {
    for (const [open, at] of [
      [() => openAdjust(page, 'One on each page', 2), 7],
      [
        async () => {
          await page.goto('/?mockIntake=1&mockPdfAt=1');
          await button(page, 'Adjust pages').click();
          await expect(title(page)).toHaveText('Page 1 of 3');
        },
        0,
      ],
    ] as const) {
      await open();
      const tools = page.locator('.actionbar .tool-row .btn');
      await expect(tools.nth(at)).toHaveAccessibleName('Zoom out');
      await expect(tools.nth(at + 1)).toHaveAccessibleName('Zoom in');
      for (const i of [at, at + 1]) {
        const b = await tools.nth(i).boundingBox();
        expect(Math.min(b?.width ?? 0, b?.height ?? 0)).toBeGreaterThanOrEqual(56 - 0.5);
      }
      await expect(button(page, 'Zoom out')).toBeDisabled();
    }
  });
  test('Zoom in twice: the page is twice as wide, the label says 200 %, it slides both ways; Zoom out twice: 100 %', async ({
    page,
  }) => {
    await openAdjust(page, 'One on each page', 2);
    const w = await paperW(page);
    const stripH = (await page.locator('.adjust-strip').boundingBox())?.height ?? 0;
    await button(page, 'Zoom in').click();
    await expect(label(page)).toHaveText('Page 1 of 2 · 150 %');
    await button(page, 'Zoom in').click();
    await expect(label(page)).toHaveText('Page 1 of 2 · 200 %');
    await expect.poll(async () => Math.abs((await paperW(page)) - 2 * w)).toBeLessThan(2);
    // The strip keeps its height; the page slides inside it both ways.
    expect(Math.abs(((await page.locator('.adjust-strip').boundingBox())?.height ?? 0) - stripH)).toBeLessThan(1);
    expect(
      await page
        .locator('.adjust-strip')
        .evaluate((e) => [e.scrollWidth > e.clientWidth + 10, e.scrollHeight > e.clientHeight + 10]),
    ).toEqual([true, true]);
    // Only the page in the middle shows while zoomed.
    await expect(page.locator('.adjust-sheet[data-page="1"]')).toBeHidden();
    await button(page, 'Zoom out').click();
    await button(page, 'Zoom out').click();
    await expect(label(page)).toHaveText('Page 1 of 2');
    await expect.poll(async () => Math.abs((await paperW(page)) - w)).toBeLessThan(2);
    await expect(button(page, 'Zoom out')).toBeDisabled();
    await expect(page.locator('.adjust-sheet[data-page="1"]')).toBeVisible();
  });
  test('zoomed, a page keeps its shape, standing or lying sideways', async ({ page }) => {
    const A4 = 841.89 / 595.28;
    const shape = async () => {
      const b = await page.locator('.adjust-paper figure').boundingBox();
      return (b?.width ?? 0) / (b?.height ?? 1);
    };
    for (const sideways of [false, true]) {
      await page.goto('/?mockIntake=2');
      await button(page, 'One on each page').click();
      if (sideways) {
        await button(page, 'Change').click();
        await page.getByRole('button', { name: /^Paper direction/ }).click();
        await page.getByRole('button', { name: /^Landscape/ }).click();
        await expect(title(page)).toHaveText('Ready to print');
      }
      await button(page, 'Adjust photos').click();
      await expect(title(page)).toHaveText('Photo 1 of 2');
      const want = sideways ? A4 : 1 / A4;
      expect(Math.abs((await shape()) - want)).toBeLessThan(0.01);
      for (const z of ['150', '200', '300']) {
        await button(page, 'Zoom in').click();
        await expect(label(page)).toHaveText(`Page 1 of 2 · ${z} %`);
        await expect.poll(async () => Math.abs((await shape()) - want)).toBeLessThan(0.01);
      }
    }
  });
  test('Zoom in stops at 400 %', async ({ page }) => {
    await openAdjust(page, 'One on each page', 2);
    for (let i = 0; i < 4; i++) await button(page, 'Zoom in').click();
    await expect(label(page)).toHaveText('Page 1 of 2 · 400 %');
    await expect(button(page, 'Zoom in')).toBeDisabled();
  });
  test('on a one-page job the zoom is said aloud too', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Zoom in').click();
    await expect(label(page)).toHaveText('Page 1 of 1 · 150 %');
    await expect(label(page)).toHaveAttribute('aria-live', 'polite');
  });
  // Review Focus 4: drags while zoomed work in page points.
  test('at 200 % a corner drag of 40 px shrinks the photo half as much as at 100 %', async ({ page }) => {
    const MM = 72 / 25.4;
    const longCm = (t: string) =>
      Math.max(
        ...(t
          .match(/([\d.]+) × ([\d.]+) cm/)
          ?.slice(1)
          .map(Number) ?? [0]),
      );
    const shrink = async (zoomed: boolean) => {
      await openAdjust(page);
      const perPt = (await paperW(page)) / 595.2756;
      if (zoomed) {
        await button(page, 'Zoom in').click();
        await button(page, 'Zoom in').click();
        await expect(label(page)).toHaveText(/· 200 %$/);
      }
      const before = longCm(await sizeText(page));
      const handle = page.locator('.adjust-handle');
      await handle.scrollIntoViewIfNeeded();
      const b = await handle.boundingBox();
      if (!b) throw new Error('no handle');
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 - 40, b.y + b.height / 2 - 40, { steps: 8 });
      await page.mouse.up();
      await expect.poll(async () => longCm(await sizeText(page))).not.toBe(before);
      return { mm: (before - longCm(await sizeText(page))) * 10, perPt };
    };
    const at100 = await shrink(false);
    const at200 = await shrink(true);
    // 40 px at 100 % is 40 ÷ (px per pt) points; at 200 % half that (± 1 mm: the size line rounds to a millimetre).
    expect(Math.abs(at100.mm - 40 / at100.perPt / MM)).toBeLessThanOrEqual(1);
    expect(Math.abs(at200.mm - 40 / (2 * at100.perPt) / MM)).toBeLessThanOrEqual(1);
  });
  // Review Focus 4 (whole-branch review M4: only the corner was tested): press and hold, then drag, at 200 %.
  test('at 200 % press and hold, then a 40 px drag, moves the photo half as far on the page as at 100 %', async ({
    page,
  }) => {
    await openAdjust(page);
    for (let i = 0; i < 3; i++) await button(page, 'Smaller').click();
    const perPt = (await paperW(page)) / 595.2756;
    const xOf = async () =>
      (
        (await lastPlan(page)) as { pages: { placements: { itemIndex: number; box: { x: number } }[] }[] } | undefined
      )?.pages
        .flatMap((pg) => pg.placements)
        .find((x) => x.itemIndex === 1)?.box.x ?? Number.NaN;
    await button(page, 'Done').click();
    await expect(title(page)).toHaveText('Ready to print');
    await expect.poll(xOf).not.toBeNaN();
    const before = await xOf();
    await button(page, 'Adjust photos').click();
    await expect(title(page)).toHaveText('Photo 1 of 4');
    await button(page, 'Zoom in').click();
    await button(page, 'Zoom in').click();
    await expect(label(page)).toHaveText(/· 200 %$/);
    const pick = page.locator('.adjust-pick[data-item="1"]');
    await pick.scrollIntoViewIfNeeded();
    const b = await pick.boundingBox();
    if (!b) throw new Error('no photo');
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2, { steps: 10 });
    await page.mouse.up();
    const rev = (await lastPlan(page))?.rev ?? -1;
    await button(page, 'Done').click();
    await expect(title(page)).toHaveText('Ready to print');
    await expect.poll(async () => (await lastPlan(page))?.rev ?? -1).toBeGreaterThan(rev);
    // 40 px at 200 % is 40 ÷ (2 × px per pt at 100 %) points, give or take the 2 mm snap to a guide.
    expect(Math.abs((await xOf()) - before - 40 / (2 * perPt))).toBeLessThanOrEqual(2 * (72 / 25.4) + 0.5);
  });
  test('zoomed, ‹ › still move the pages and choose the photo on the page shown', async ({ page }) => {
    await openAdjust(page, 'One on each page', 2);
    await button(page, 'Zoom in').click();
    await button(page, 'Show next page').click();
    await expect(label(page)).toHaveText('Page 2 of 2 · 150 %');
    await expect(title(page)).toHaveText('Photo 2 of 2');
    await expect(page.locator('.adjust-sheet[data-page="1"]')).toBeVisible();
    await expect(page.locator('.adjust-sheet[data-page="0"]')).toBeHidden();
  });
  test('a fresh Adjust starts at 100 %', async ({ page }) => {
    await openAdjust(page, 'One on each page', 2);
    await button(page, 'Zoom in').click();
    await expect(label(page)).toHaveText(/· 150 %$/);
    await button(page, 'Done').click();
    await expect(title(page)).toHaveText('Ready to print');
    await button(page, 'Adjust photos').click();
    await expect(label(page)).toHaveText('Page 1 of 2');
  });
  test.describe('two fingers', () => {
    test.use({ hasTouch: true });
    test('pinching the page zooms it in; no photo is lifted or moved', async ({ page }) => {
      await openAdjust(page, 'One on each page', 2);
      const w = await paperW(page);
      const p = await page.locator('.adjust-paper figure').boundingBox();
      if (!p) throw new Error('no page');
      const cdp = await page.context().newCDPSession(page);
      const cx = p.x + p.width / 2;
      const cy = p.y + p.height / 2;
      const touch = (type: string, d: number) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints:
            type === 'touchEnd'
              ? []
              : [
                  { x: cx - d, y: cy, id: 1 },
                  { x: cx + d, y: cy, id: 2 },
                ],
        });
      await touch('touchStart', 30);
      for (const d of [40, 50, 60]) await touch('touchMove', d);
      await page.waitForTimeout(700); // longer than a press and hold: still no photo lifted
      await touch('touchEnd', 0);
      await expect(label(page)).toHaveText('Page 1 of 2 · 200 %');
      await expect.poll(async () => (await paperW(page)) / w).toBeGreaterThan(1.9);
      await expect(page.locator('.adjust-lifted')).toHaveCount(0);
    });
  });
});

// Owner, round 5: "remove the highlighted section under Photo 4 of 5" (the hint line on Adjust).
test.describe('no hint line (owner, round 5)', () => {
  for (const [kind, open] of Object.entries(kinds))
    test(`${kind}: no hint line under the title`, async ({ page }) => {
      await open(page);
      await expect(page.locator('.adjust-paper figure')).toBeVisible();
      await expect(page.getByText(/^(Tap a photo to choose it|Drag the round corner)/)).toHaveCount(0);
    });
});

// Owner, round 5: "Copy paste, cut paste, options needed", and a "+" mark (Word's cursor) for where Paste goes.
test.describe('copy, cut and paste (owner, round 5)', () => {
  test.use({ viewport: { width: 412, height: 915 } });
  type P = { pages: { placements: { itemIndex: number; turns: number; crop?: unknown; box: Box4 }[] }[] };
  type Box4 = { x: number; y: number; w: number; h: number };
  const plan = (page: Page) => page.evaluate(() => (globalThis as { __lastPlan?: P }).__lastPlan);
  const all = async (page: Page) => (await plan(page))?.pages.flatMap((p) => p.placements) ?? [];
  const status = (page: Page) => page.getByRole('status');
  const done = async (page: Page) => {
    await button(page, 'Done').click();
    await expect(title(page)).toHaveText('Ready to print');
  };
  test('Copy then Paste adds a copy of the chosen photo, chosen and placed by hand; Paste waits for a Copy', async ({
    page,
  }) => {
    await openAdjust(page);
    await expect(button(page, 'Paste')).toBeDisabled();
    await button(page, 'Copy').click();
    await expect(status(page).filter({ hasText: 'Photo 1 copied.' })).toBeVisible();
    await button(page, 'Paste').click();
    await expect(title(page)).toHaveText(/ of 5$/);
    await done(page);
    await expect.poll(async () => (await all(page)).length).toBe(5);
    const ps = await all(page);
    const original = ps.find((p) => p.itemIndex === 1);
    const copy = ps.find((p) => p.itemIndex > 4);
    expect(copy?.turns).toBe(original?.turns);
    expect(copy?.crop).toEqual(original?.crop);
    expect(Math.round(copy?.box.w ?? 0)).toBe(Math.round(original?.box.w ?? -1));
    await expect(page.getByText('These photos are the same:')).toHaveCount(0);
  });
  test('the page stays where it is when Copy says so (the note is under the page)', async ({ page }) => {
    await openAdjust(page);
    // Where the page is in the screen's content (clicking a tool may scroll the window; that is not the page moving).
    const top = () =>
      page.locator('.adjust-paper figure').evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
    const before = await top();
    await button(page, 'Copy').click();
    await expect(page.getByText('Photo 1 copied.')).toBeVisible();
    expect(Math.abs((await top()) - before)).toBeLessThan(1);
  });
  test('the note never covers ‹ ›', async ({ page }) => {
    await openAdjust(page, 'One on each page', 2);
    await button(page, 'Copy').click();
    await expect(page.getByText('Photo 1 copied.')).toBeVisible();
    const b = await button(page, 'Show next page').boundingBox();
    if (!b) throw new Error('no ‹ ›');
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') ?? '',
      [b.x + b.width / 2, b.y + 4],
    );
    expect(hit).toBe('Show next page');
  });
  test('Cut takes the photo off; Paste puts it back once', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Cut').click();
    await expect(title(page)).toHaveText(/ of 3$/);
    await expect(status(page).filter({ hasText: 'Photo 1 cut. Paste puts it back.' })).toBeVisible();
    await button(page, 'Paste').click();
    await expect(title(page)).toHaveText(/ of 4$/);
    await expect(button(page, 'Paste')).toBeDisabled();
  });
  test('Cut on page 1, ‹ › to page 2, Paste: the photo is on page 2', async ({ page }) => {
    await openAdjust(page, 'One on each page', 3);
    await button(page, 'Cut').click();
    await expect(page.locator('.adjust-page')).toHaveText(/^Page 1 of 2/);
    await button(page, 'Show next page').click();
    await expect(page.locator('.adjust-page')).toHaveText(/^Page 2 of 2/);
    await button(page, 'Paste').click();
    await done(page);
    await expect
      .poll(async () => (await plan(page))?.pages[1]?.placements.some((p) => p.itemIndex === 1) ?? false)
      .toBe(true);
  });
  test('Paste twice after one Copy makes two copies', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Copy').click();
    await button(page, 'Paste').click();
    await expect(title(page)).toHaveText(/ of 5$/);
    await button(page, 'Paste').click();
    await expect(title(page)).toHaveText(/ of 6$/);
  });
  test('Copy, Remove the original, Paste still makes the copy (Review Focus 2)', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Copy').click();
    await button(page, 'Remove').click();
    await expect(title(page)).toHaveText(/ of 3$/);
    await button(page, 'Paste').click();
    await expect(title(page)).toHaveText(/ of 4$/);
  });
  test('what was copied is forgotten when the job is left (Review Focus 1)', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Copy').click();
    await button(page, 'Home').click();
    await button(page, 'Leave').click();
    await page.getByRole('button', { name: /^Continue the last job/ }).click();
    await expect(title(page)).toHaveText('Files received');
    await button(page, 'All on one page').click();
    await expect(title(page)).toHaveText('Ready to print');
    await button(page, 'Adjust photos').click();
    await expect(title(page)).toHaveText('Photo 1 of 4');
    await expect(button(page, 'Paste')).toBeDisabled();
  });
  // Review I1: Adjust opened again lists the job's pictures without the one copied or cut; the pasted photo must
  // still be drawn (and one Paste makes one photo, never hidden extras).
  const drawn = (page: Page) => page.locator('.adjust-sheet .adjust-pick');
  test('Copy, Remove, leave Adjust and come back, Paste: the copy is drawn on the page (review I1)', async ({
    page,
  }) => {
    await openAdjust(page);
    await button(page, 'Copy').click();
    await button(page, 'Remove').click();
    await expect(title(page)).toHaveText(/ of 3$/);
    await done(page);
    await button(page, 'Adjust photos').click();
    await expect(title(page)).toHaveText('Photo 1 of 3');
    await button(page, 'Paste').click();
    await expect(title(page)).toHaveText(/ of 4$/);
    await expect(drawn(page)).toHaveCount(4);
  });
  test('Cut, leave Adjust and come back, Paste: the photo is drawn again (review I1)', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Cut').click();
    await expect(title(page)).toHaveText(/ of 3$/);
    await done(page);
    await button(page, 'Adjust photos').click();
    await button(page, 'Paste').click();
    await expect(title(page)).toHaveText(/ of 4$/);
    await expect(drawn(page)).toHaveCount(4);
  });
  test('Cut the only photo of a middle page, Paste on the last page: no new page (review I2)', async ({ page }) => {
    await openAdjust(page, 'One on each page', 3);
    await button(page, 'Move right').click(); // placed by hand: every photo keeps its page from now on
    await button(page, 'Show next page').click();
    await expect(page.locator('.adjust-page')).toHaveText(/^Page 2 of 3/);
    await button(page, 'Cut').click();
    await expect(page.locator('.adjust-page')).toHaveText(/ of 2/);
    if (!/^Page 2/.test(await page.locator('.adjust-page').innerText())) await button(page, 'Show next page').click();
    await expect(page.locator('.adjust-page')).toHaveText(/^Page 2 of 2/);
    await button(page, 'Paste').click();
    await expect(page.locator('.adjust-page')).toHaveText(/ of 2/);
    await done(page);
    await expect.poll(async () => (await plan(page))?.pages.length).toBe(2);
    expect((await plan(page))?.pages[1]?.placements.map((p) => p.itemIndex).sort()).toEqual([2, 3]);
  });
  test('a cut photo pasted back is drawn above the others (review I3)', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Cut').click();
    await expect(title(page)).toHaveText(/ of 3$/);
    await button(page, 'Paste').click();
    await expect(title(page)).toHaveText(/ of 4$/);
    await done(page);
    // Drawn in order: the last one is on top.
    await expect.poll(async () => (await plan(page))?.pages[0]?.placements.at(-1)?.itemIndex).toBe(1);
  });
  test('Cut, then Undo: Paste has nothing to put back (review M2)', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Cut').click();
    await expect(title(page)).toHaveText(/ of 3$/);
    await button(page, 'Undo').click();
    await expect(title(page)).toHaveText(/ of 4$/);
    await expect(button(page, 'Paste')).toBeDisabled();
  });
  test("Cut one photo, Remove another, Paste: the other's Undo stays (review M3)", async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Cut').click();
    await expect(title(page)).toHaveText(/ of 3$/);
    await button(page, 'Remove').click();
    await expect(title(page)).toHaveText(/ of 2$/);
    await button(page, 'Paste').click();
    await expect(title(page)).toHaveText(/ of 3$/);
    await button(page, 'Undo').click();
    await expect(title(page)).toHaveText(/ of 4$/);
  });
  test('documents, passport sheets and ID cards have no Copy, Cut or Paste', async ({ page }) => {
    for (const kind of ['pages', 'passport', 'cards']) {
      await kinds[kind]?.(page);
      await expect(page.locator('.adjust-paper figure')).toBeVisible();
      for (const name of ['Copy', 'Cut', 'Paste']) await expect(button(page, name)).toHaveCount(0);
    }
  });
});

// Owner, round 5: "for ID cards allow drag so that we can place the image anywhere we want", and "what if the user
// wants horizontal front and back on the page? But default must be vertical".
test.describe('ID cards placed by hand (owner, round 5)', () => {
  test.use({ viewport: { width: 412, height: 915 } });
  type Bx = { x: number; y: number; w: number; h: number };
  type P = { pages: { placements: { itemIndex: number; box: Bx }[] }[] };
  const boxes = async (page: Page) => {
    const p = await page.evaluate(() => (globalThis as { __lastPlan?: P }).__lastPlan);
    return Object.fromEntries((p?.pages[0]?.placements ?? []).map((x) => [x.itemIndex, x.box])) as Record<number, Bx>;
  };
  const MM = 72 / 25.4;
  const toReady = async (page: Page) => {
    await button(page, 'Done').click();
    await expect(title(page)).toHaveText('Ready to print');
    await page.waitForTimeout(300);
  };
  const openCards = async (page: Page) => {
    await kinds.cards?.(page);
    await expect(title(page)).toHaveText('Card 1 of 2');
  };
  test('press and hold a card, drag it: it prints where it was dropped', async ({ page }) => {
    await openCards(page);
    const paper = await page.locator('.adjust-paper figure').boundingBox();
    if (!paper) throw new Error('no page');
    const perPt = paper.width / 595.2756;
    await toReady(page);
    const before = (await boxes(page))[2];
    await button(page, 'Adjust cards').click();
    const back = page.locator('.adjust-sheet[data-page="0"] .adjust-pick').nth(1);
    const b = await back.boundingBox();
    if (!b || !before) throw new Error('no back card');
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 + 30, { steps: 10 });
    // Said as a card, not a photo (review M4).
    await expect(page.locator('.adjust-moving')).toHaveText(/^Moving card 2\./);
    await page.mouse.up();
    await toReady(page);
    const after = (await boxes(page))[2];
    if (!after) throw new Error('no back card printed');
    // 40 px right, 30 px down, give or take the 2 mm snap.
    expect(Math.abs(after.x - before.x - 40 / perPt)).toBeLessThanOrEqual(2 * MM + 0.5);
    expect(Math.abs(after.y - before.y - 30 / perPt)).toBeLessThanOrEqual(2 * MM + 0.5);
  });
  test('Move right moves the chosen card 2 mm; Automatic puts both back', async ({ page }) => {
    await openCards(page);
    await toReady(page);
    const before = (await boxes(page))[1];
    await button(page, 'Adjust cards').click();
    await expect(button(page, 'Automatic')).toBeDisabled();
    await button(page, 'Move right').click();
    await toReady(page);
    expect(((await boxes(page))[1]?.x ?? 0) - (before?.x ?? 0)).toBeCloseTo(2 * MM, 1);
    await button(page, 'Adjust cards').click();
    await button(page, 'Automatic').click();
    await toReady(page);
    expect((await boxes(page))[1]?.x).toBeCloseTo(before?.x ?? -1, 1);
  });
  test('Side by side puts front and back in one row; Top and bottom puts them back', async ({ page }) => {
    await openCards(page);
    await expect(button(page, 'Top and bottom')).toHaveAttribute('aria-pressed', 'true');
    await button(page, 'Side by side').click();
    await expect(button(page, 'Side by side')).toHaveAttribute('aria-pressed', 'true');
    await toReady(page);
    let b = await boxes(page);
    const mid = (x?: Bx) => ({ x: (x?.x ?? 0) + (x?.w ?? 0) / 2, y: (x?.y ?? 0) + (x?.h ?? 0) / 2 });
    expect(Math.abs(mid(b[1]).y - mid(b[2]).y)).toBeLessThan(0.5);
    await button(page, 'Adjust cards').click();
    await button(page, 'Top and bottom').click();
    await toReady(page);
    b = await boxes(page);
    expect(Math.abs(mid(b[1]).x - mid(b[2]).x)).toBeLessThan(0.5);
  });
  // Review I4: cards keep the printer's edge (about 6 mm), not the photo pages' margin; Move left moves left.
  test('Big size side by side: Move right moves the left card 2 mm, Move left puts it back (review I4)', async ({
    page,
  }) => {
    await page.goto('/?mockIntake=2');
    await button(page, 'ID card copy').click();
    await button(page, 'Done').click();
    await button(page, 'Done').click();
    await button(page, 'Card copy').click();
    await button(page, /^Big size/).click();
    await button(page, 'Adjust cards').click();
    await button(page, 'Side by side').click();
    await toReady(page);
    const before = await boxes(page);
    const left = Number(Object.entries(before).sort((a, b) => a[1].x - b[1].x)[0]?.[0]);
    await button(page, 'Adjust cards').click();
    if (left === 2) await button(page, 'Next card').click();
    await button(page, 'Move right').click();
    await toReady(page);
    expect(((await boxes(page))[left]?.x ?? 0) - (before[left]?.x ?? 0)).toBeCloseTo(2 * MM, 1);
    await button(page, 'Adjust cards').click();
    if (left === 2) await button(page, 'Next card').click();
    await button(page, 'Move left').click();
    await toReady(page);
    expect((await boxes(page))[left]?.x).toBeCloseTo(before[left]?.x ?? -1, 1);
  });
  test('Many copies has no Move, no Automatic, no arrangement', async ({ page }) => {
    await page.goto('/?mockIntake=2');
    await button(page, 'ID card copy').click();
    await button(page, 'Done').click();
    await button(page, 'Done').click();
    await button(page, 'Card copy').click();
    await button(page, /^Many copies/).click();
    await expect(title(page)).toHaveText('Ready to print');
    await expect(button(page, 'Adjust cards')).toHaveCount(0);
  });
});

// Owner, round 6: "do whatever is best and recommended" — Word's Undo / Redo for every change on Adjust, and Bring to
// front / Send to back. The tools show "Undo" / "Redo"; their full names differ from the Remove panel's Undo.
test.describe('Undo and Redo (round 6)', () => {
  test.use({ viewport: { width: 412, height: 915 } });
  type Bx = { x: number; y: number; w: number; h: number };
  type P = { pages: { placements: { itemIndex: number; turns: number; box: Bx }[] }[] };
  const plan = (page: Page) => page.evaluate(() => (globalThis as { __lastPlan?: P }).__lastPlan);
  const boxOf = async (page: Page, item: number) =>
    (await plan(page))?.pages.flatMap((p) => p.placements).find((p) => p.itemIndex === item)?.box;
  const undo = (page: Page) => button(page, 'Undo the last change');
  const redo = (page: Page) => button(page, 'Redo what was undone');
  const MM = 72 / 25.4;
  const toReady = async (page: Page) => {
    await button(page, 'Done').click();
    await expect(title(page)).toHaveText('Ready to print');
    await page.waitForTimeout(300);
  };
  // Owner, round 7: on photos Undo and Redo follow Cut, Copy, Crop and Turn (5th and 6th).
  test('Undo and Redo: 3rd and 4th on pages, cards and passport, 5th and 6th on photos; nothing to undo at first', async ({
    page,
  }) => {
    for (const [open, at] of [
      [() => openAdjust(page, 'One on each page', 2), 4],
      [
        async () => {
          await page.goto('/?mockIntake=1&mockPdfAt=1');
          await button(page, 'Adjust pages').click();
          await expect(title(page)).toHaveText('Page 1 of 3');
        },
        2,
      ],
      [() => kinds.cards?.(page) ?? Promise.resolve(), 2],
      [() => kinds.passport?.(page) ?? Promise.resolve(), 2],
    ] as const) {
      await open();
      const tools = page.locator('.actionbar .tool-row .btn');
      await expect(tools.nth(at)).toHaveAccessibleName('Undo the last change');
      await expect(tools.nth(at + 1)).toHaveAccessibleName('Redo what was undone');
      await expect(tools.nth(at)).toHaveText('Undo');
      await expect(tools.nth(at + 1)).toHaveText('Redo');
      for (const i of [at, at + 1]) {
        await expect(tools.nth(i)).toBeDisabled();
        expect((await tools.nth(i).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
      }
    }
  });
  test('Undo takes back a move; Redo puts it back, also after leaving Adjust and coming back', async ({ page }) => {
    await openAdjust(page);
    await toReady(page);
    const before = await boxOf(page, 1);
    await button(page, 'Adjust photos').click();
    await button(page, 'Move right').click();
    await expect(undo(page)).toBeEnabled();
    await undo(page).click();
    await expect(redo(page)).toBeEnabled();
    await expect(undo(page)).toBeDisabled();
    await toReady(page);
    expect((await boxOf(page, 1))?.x).toBeCloseTo(before?.x ?? -1, 1);
    await button(page, 'Adjust photos').click();
    await redo(page).click();
    await toReady(page);
    expect(((await boxOf(page, 1))?.x ?? 0) - (before?.x ?? 0)).toBeCloseTo(2 * MM, 1);
  });
  test('Undo of Remove brings the photo back and closes the Remove panel', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Remove').click();
    await expect(title(page)).toHaveText(/ of 3$/);
    await expect(page.getByText('Photo removed.')).toBeVisible();
    await undo(page).click();
    await expect(title(page)).toHaveText(/ of 4$/);
    await expect(page.getByText('Photo removed.')).toHaveCount(0);
    await expect(page.locator('.adjust-sheet .adjust-pick')).toHaveCount(4);
  });
  test('Undo of Paste takes the copy away; Undo of Cut puts the photo back and leaves nothing to paste', async ({
    page,
  }) => {
    await openAdjust(page);
    await button(page, 'Copy').click();
    await button(page, 'Paste').click();
    await expect(title(page)).toHaveText(/ of 5$/);
    await undo(page).click();
    await expect(title(page)).toHaveText(/ of 4$/);
    await button(page, 'Cut').click();
    await expect(title(page)).toHaveText(/ of 3$/);
    await undo(page).click();
    await expect(title(page)).toHaveText(/ of 4$/);
    await expect(button(page, 'Paste')).toBeDisabled();
  });
  test('a new change after Undo clears Redo', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Move right').click();
    await undo(page).click();
    await expect(redo(page)).toBeEnabled();
    await button(page, 'Move left').click();
    await expect(redo(page)).toBeDisabled();
    await expect(undo(page)).toBeEnabled();
  });
  test('a change made outside Adjust (Colour on Ready) forgets the steps', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Move right').click();
    await toReady(page);
    await button(page, /Black & white/).click();
    await page.waitForTimeout(300);
    await button(page, 'Adjust photos').click();
    await expect(title(page)).toHaveText('Photo 1 of 4');
    await expect(undo(page)).toBeDisabled();
  });
  test('Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Move right').click();
    await expect(undo(page)).toBeEnabled();
    await page.keyboard.press('Control+z');
    await expect(redo(page)).toBeEnabled();
    await page.keyboard.press('Control+y');
    await expect(undo(page)).toBeEnabled();
    await expect(redo(page)).toBeDisabled();
    await page.keyboard.press('Control+z');
    await expect(redo(page)).toBeEnabled();
    await page.keyboard.press('Control+Shift+z');
    await expect(redo(page)).toBeDisabled();
  });
  test('a page turn on a document is undone', async ({ page }) => {
    await page.goto('/?mockIntake=1&mockPdfAt=1');
    await button(page, 'Adjust pages').click();
    await button(page, 'Turn').click();
    await expect(undo(page)).toBeEnabled();
    await undo(page).click();
    await toReady(page);
    await expect.poll(async () => (await plan(page))?.pages[0]?.placements[0]?.turns).toBe(0);
  });
  test('a card dragged is put back by Undo', async ({ page }) => {
    await kinds.cards?.(page);
    await expect(title(page)).toHaveText('Card 1 of 2');
    await toReady(page);
    const before = await boxOf(page, 2);
    await button(page, 'Adjust cards').click();
    const b = await page.locator('.adjust-sheet[data-page="0"] .adjust-pick').nth(1).boundingBox();
    if (!b) throw new Error('no back card');
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 + 30, { steps: 10 });
    await page.mouse.up();
    await expect(undo(page)).toBeEnabled();
    await undo(page).click();
    await toReady(page);
    expect((await boxOf(page, 2))?.x).toBeCloseTo(before?.x ?? -1, 1);
    expect((await boxOf(page, 2))?.y).toBeCloseTo(before?.y ?? -1, 1);
  });
});

test.describe('Bring to front / Send to back (round 6)', () => {
  test.use({ viewport: { width: 412, height: 915 } });
  type P = { pages: { placements: { itemIndex: number }[] }[] };
  const order = async (page: Page) =>
    (await page.evaluate(() => (globalThis as { __lastPlan?: P }).__lastPlan))?.pages[0]?.placements.map(
      (p) => p.itemIndex,
    );
  const front = (page: Page) => button(page, 'Bring to front');
  const back = (page: Page) => button(page, 'Send to back');
  const toReady = async (page: Page) => {
    await button(page, 'Done').click();
    await expect(title(page)).toHaveText('Ready to print');
    await page.waitForTimeout(300);
  };
  /** Press and hold the [from]th one on page 1, and drop it over the middle of the [onto]th. */
  const dragOnto = async (page: Page, from: number, onto: number) => {
    const picks = page.locator('.adjust-sheet[data-page="0"] .adjust-pick');
    const a = await picks.nth(from).boundingBox();
    const b = await picks.nth(onto).boundingBox();
    if (!a || !b) throw new Error('nothing to drag');
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.move(b.x + b.width / 2 + 6, b.y + b.height / 2 + 6, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  test('nothing overlaps: both are disabled, 56 px or more', async ({ page }) => {
    await openAdjust(page, 'All on one page', 2);
    for (const b of [front(page), back(page)]) {
      await expect(b).toBeDisabled();
      expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
    }
  });
  test('a photo dropped over another is on top: Send to back puts it under, Bring to front over; one Undo each', async ({
    page,
  }) => {
    await openAdjust(page, 'All on one page', 2);
    await dragOnto(page, 1, 0);
    await expect(title(page)).toHaveText('Photo 2 of 2');
    await expect(front(page)).toBeDisabled();
    await expect(back(page)).toBeEnabled();
    await back(page).click();
    await expect(front(page)).toBeEnabled();
    await expect(back(page)).toBeDisabled();
    await toReady(page);
    expect(await order(page)).toEqual([2, 1]);
    await button(page, 'Adjust photos').click();
    await button(page, 'Next photo').click();
    await expect(title(page)).toHaveText('Photo 2 of 2');
    await front(page).click();
    await toReady(page);
    expect(await order(page)).toEqual([1, 2]);
    await button(page, 'Adjust photos').click();
    await button(page, 'Undo the last change').click();
    await toReady(page);
    expect(await order(page)).toEqual([2, 1]);
  });
  test('ID cards dropped over each other: Send to back and Bring to front', async ({ page }) => {
    await kinds.cards?.(page);
    await expect(title(page)).toHaveText('Card 1 of 2');
    await expect(front(page)).toBeDisabled();
    await dragOnto(page, 1, 0);
    await expect(back(page)).toBeEnabled();
    await back(page).click();
    await toReady(page);
    // The dragged back card was drawn last; Send to back draws it first.
    expect(await order(page)).toEqual([2, 1]);
    await button(page, 'Adjust cards').click();
    await button(page, 'Next card').click();
    await front(page).click();
    await toReady(page);
    expect(await order(page)).toEqual([1, 2]);
  });
});

// Round 6 review: I1 (a change made elsewhere is never taken back), I2 (what Adjust's other screens change is undoable),
// I3 (Redo's arrow turns the other way), M1/M2 (no Undo mid-gesture, nor behind a question).
test.describe('Undo and Redo review fixes (round 6)', () => {
  test.use({ viewport: { width: 412, height: 915 } });
  type Bx = { x: number; y: number; w: number; h: number };
  type P = { pages: { placements: { itemIndex: number; crop?: { y: number }; box: Bx }[] }[] };
  const plan = (page: Page) => page.evaluate(() => (globalThis as { __lastPlan?: P }).__lastPlan);
  const undo = (page: Page) => button(page, 'Undo the last change');
  const redo = (page: Page) => button(page, 'Redo what was undone');
  const toReady = async (page: Page) => {
    await button(page, 'Done').click();
    await expect(title(page)).toHaveText('Ready to print');
    await page.waitForTimeout(300);
  };
  test('I3: the Redo arrow turns the other way from the Undo arrow, under the app’s own page rules', async ({
    page,
  }) => {
    await openAdjust(page);
    const flips = await page.evaluate(() => {
      const t = (name: string) => {
        const b = [...document.querySelectorAll('.actionbar .tool-row .btn')].find(
          (x) => x.textContent?.trim() === name,
        );
        const svg = b?.querySelector('.icon svg');
        return svg ? getComputedStyle(svg).transform : 'none';
      };
      return { undo: t('Undo'), redo: t('Redo') };
    });
    expect(flips.undo).toBe('none');
    expect(flips.redo).toBe('matrix(-1, 0, 0, 1, 0, 0)');
  });
  test('I2: a crop made on the Crop screen is one step; the steps before it are still there', async ({ page }) => {
    await openAdjust(page, 'One on each page', 2);
    await button(page, 'Move down').click();
    await button(page, 'Crop').click();
    await expect(title(page)).toHaveText('Crop photo 1');
    for (let i = 0; i < 3; i++) await button(page, 'Down').click();
    await button(page, 'Done').click();
    await expect(title(page)).toHaveText('Photo 1 of 2');
    await expect(undo(page)).toBeEnabled();
    await undo(page).click();
    await expect(redo(page)).toBeEnabled();
    await toReady(page);
    expect((await plan(page))?.pages[0]?.placements[0]?.crop?.y ?? 0).toBe(0);
    await button(page, 'Adjust photos').click();
    await expect(undo(page)).toBeEnabled(); // the move before the crop is still a step
    await redo(page).click();
    await toReady(page);
    expect((await plan(page))?.pages[0]?.placements[0]?.crop?.y ?? 0).toBeGreaterThan(0.02);
  });
  test('I2: a crop screen left without a change adds no step', async ({ page }) => {
    await openAdjust(page, 'One on each page', 2);
    await button(page, 'Crop').click();
    await expect(title(page)).toHaveText('Crop photo 1');
    await button(page, 'Cancel').click();
    await expect(title(page)).toHaveText('Photo 1 of 2');
    await expect(undo(page)).toBeDisabled();
  });
  test('I2: the passport count changed from Adjust is undone', async ({ page }) => {
    await kinds.passport?.(page);
    await button(page, /^How many/).click();
    await expect(title(page)).toHaveText('How many photos?');
    const typed = page.getByRole('textbox', { name: 'Or type a number' });
    await typed.fill('12');
    await typed.press('Enter');
    await button(page, 'Done').click();
    await expect(title(page)).toHaveText('Ready to print');
    await button(page, 'Adjust passport photo').click();
    await expect(undo(page)).toBeEnabled();
    await undo(page).click();
    await toReady(page);
    await expect.poll(async () => (await plan(page))?.pages.flatMap((p) => p.placements).length).toBe(5);
  });
  test('M1: Ctrl+Z while a photo is held does nothing; after it is dropped Undo still works', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Move right').click();
    await expect(undo(page)).toBeEnabled();
    const b = await page.locator('.adjust-sheet[data-page="0"] .adjust-pick').nth(1).boundingBox();
    if (!b) throw new Error('no photo');
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.keyboard.press('Control+z');
    await page.mouse.up();
    await page.waitForTimeout(400);
    // The held photo's own drop is one more step; the Ctrl+Z took nothing back (Redo was never offered).
    await expect(redo(page)).toBeDisabled();
    await expect(undo(page)).toBeEnabled();
  });
  test('M2: Ctrl+Z behind the “Leave this job?” question does nothing', async ({ page }) => {
    await openAdjust(page);
    await button(page, 'Move right').click();
    await expect(undo(page)).toBeEnabled();
    await button(page, 'Home').click();
    await expect(page.getByRole('dialog', { name: 'Leave this job?' })).toBeVisible();
    await page.keyboard.press('Control+z');
    await button(page, 'Keep working').click();
    await expect(undo(page)).toBeEnabled();
    await expect(redo(page)).toBeDisabled();
  });
});

// Owner, round 7: "replace undo with crop, zoom out with cut, zoom in with copy, smaller with turn" (Undo kept by
// Redo); "cursor must be pipe and blinking"; "must be on edges" (the side bars).
test.describe('round 7: tool order, the blinking line, side bars on the edges', () => {
  test.use({ viewport: { width: 412, height: 915 } });
  type Bx = { x: number; y: number; w: number; h: number };
  type P = { pages: { placements: { itemIndex: number; box: Bx }[] }[] };
  const plan = (page: Page) => page.evaluate(() => (globalThis as { __lastPlan?: P }).__lastPlan);
  test('photos: Cut, Copy, Crop, Turn, Undo, Redo, Paste, Zoom out, Zoom in, Smaller, Bigger come first', async ({
    page,
  }) => {
    await openAdjust(page);
    const names = await page
      .locator('.actionbar .tool-row .btn')
      .evaluateAll((els) => els.slice(0, 11).map((e) => e.getAttribute('aria-label') ?? e.textContent?.trim()));
    expect(names).toEqual([
      'Cut',
      'Copy',
      'Crop',
      'Turn',
      'Undo the last change',
      'Redo what was undone',
      'Paste',
      'Zoom out',
      'Zoom in',
      'Smaller',
      'Bigger',
    ]);
    // Each tool once.
    const all = await page
      .locator('.actionbar .tool-row .btn')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent?.trim()));
    expect(new Set(all).size).toBe(all.length);
  });
  /** Copy the chosen photo, then tap an empty spot under the photos; where the tap was, in page points. */
  const markBelow = async (page: Page) => {
    // The chosen photo made small, so that a copy of it fits under the photos (review M4).
    for (let i = 0; i < 12 && (await button(page, 'Smaller').isEnabled()); i++) await button(page, 'Smaller').click();
    await button(page, 'Copy').click();
    const paper = await page.locator('.adjust-paper figure').boundingBox();
    if (!paper) throw new Error('no page');
    // The first empty spot (top to bottom, left to right) where a copy of the chosen photo fits inside the margins.
    const spot = await page.evaluate(() => {
      const paperBox = document.querySelector('.adjust-paper figure')?.getBoundingClientRect();
      const picks = [...document.querySelectorAll('.adjust-sheet[data-page="0"] .adjust-pick')].map((e) =>
        e.getBoundingClientRect(),
      );
      const chosen = document.querySelector('.adjust-sheet[data-page="0"] .adjust-selected')?.getBoundingClientRect();
      const bar = document.querySelector('.actionbar')?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      if (!paperBox || !chosen) return null;
      const m = (paperBox.width * 12.7) / 210;
      const free = (x: number, y: number) =>
        !picks.some(
          (r) => x < r.right + 6 && x + chosen.width > r.left - 6 && y < r.bottom + 6 && y + chosen.height > r.top - 6,
        );
      for (let y = paperBox.top + m; y + chosen.height <= Math.min(paperBox.bottom - m, bar - 4); y += 4)
        for (let x = paperBox.left + m; x + chosen.width <= paperBox.right - m; x += 4) if (free(x, y)) return { x, y };
      return null;
    });
    if (!spot) throw new Error('no empty spot where a copy fits');
    const { x, y } = spot;
    await page.mouse.click(x, y);
    const s = paper.width / 595.2756;
    return { x: (x - paper.x) / s, y: (y - paper.y) / s, s, paper };
  };
  test('the cursor is a thin vertical line that blinks, with its top where the tap was', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openAdjust(page);
    const at = await markBelow(page);
    const line = page.locator('.adjust-mark');
    await expect(line).toBeVisible();
    await expect(page.getByText('Paste goes to the line.')).toBeVisible();
    const b = await line.boundingBox();
    if (!b) throw new Error('no line');
    expect(b.width).toBeLessThanOrEqual(4);
    expect(b.height).toBeGreaterThanOrEqual(20);
    expect(Math.abs((b.y - at.paper.y) / at.s - at.y)).toBeLessThanOrEqual(2 / at.s);
    expect(await line.evaluate((e) => getComputedStyle(e).animationName)).not.toBe('none');
  });
  test('the line does not blink when the phone asks for less motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openAdjust(page);
    await markBelow(page);
    await expect(page.locator('.adjust-mark')).toBeVisible();
    expect(await page.locator('.adjust-mark').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  });
  test("Paste puts the photo's top-left corner at the line", async ({ page }) => {
    await openAdjust(page);
    const at = await markBelow(page);
    await button(page, 'Paste').click();
    await expect(page.locator('.adjust-mark')).toHaveCount(0);
    await button(page, 'Done').click();
    await expect(title(page)).toHaveText('Ready to print');
    await expect.poll(async () => (await plan(page))?.pages.flatMap((p) => p.placements).length).toBe(5);
    const copy = (await plan(page))?.pages.flatMap((p) => p.placements).find((p) => p.itemIndex > 4)?.box;
    if (!copy) throw new Error('no copy');
    expect(Math.abs(copy.x - at.x)).toBeLessThanOrEqual(2);
    // At the line's top, or as near as the bottom margin lets a photo of its size be.
    const margin = 12.7 * (72 / 25.4);
    expect(at.y + copy.h).toBeLessThanOrEqual(841.8898 - margin); // the spot was chosen so that it fits (review M4)
    expect(Math.abs(copy.y - at.y)).toBeLessThanOrEqual(2);
  });
  test('every side bar of a photo at the top-left of the page is drawn on its edge', async ({ page }) => {
    await openAdjust(page, 'One on each page', 2);
    const sides = await page.evaluate(() => {
      const out: Record<string, { at: number; edge: number }> = {};
      for (const s of ['l', 'r', 't', 'b']) {
        const el = document.querySelector(`.adjust-side-${s}`);
        const pick = el?.closest('.adjust-pick') ?? el?.parentElement;
        if (!el || !pick) continue;
        const r = el.getBoundingClientRect();
        const p = pick.getBoundingClientRect();
        const a = getComputedStyle(el, '::after');
        const cx = r.left + Number.parseFloat(a.left);
        const cy = r.top + Number.parseFloat(a.top);
        out[s] =
          s === 'l'
            ? { at: cx, edge: p.left }
            : s === 'r'
              ? { at: cx, edge: p.right }
              : s === 't'
                ? { at: cy, edge: p.top }
                : { at: cy, edge: p.bottom };
      }
      return out;
    });
    expect(Object.keys(sides).sort()).toEqual(['b', 'l', 'r', 't']);
    for (const [s, v] of Object.entries(sides)) expect(Math.abs(v.at - v.edge), s).toBeLessThanOrEqual(2);
  });
  // Review I1: the top bar of a photo at the page's top is under the turn handle; a finger on the bar, or just outside
  // it, must take the bar (crop), never the turn handle.
  test('a finger on a side bar, or just outside it, takes the bar, not the turn handle (review I1)', async ({
    page,
  }) => {
    await openAdjust(page, 'One on each page', 2);
    const hits = await page.evaluate(() => {
      const out: Record<string, string[]> = {};
      for (const s of ['l', 'r', 't', 'b']) {
        const el = document.querySelector(`.adjust-side-${s}`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const a = getComputedStyle(el, '::after');
        const cx = r.left + Number.parseFloat(a.left);
        const cy = r.top + Number.parseFloat(a.top);
        const out3 = { l: [-3, 0], r: [3, 0], t: [0, -3], b: [0, 3] }[s] as number[];
        out[s] = [
          [cx, cy],
          [cx + (out3[0] ?? 0), cy + (out3[1] ?? 0)],
        ].map(([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.closest('.adjust-side')?.className ?? 'none');
      }
      return out;
    });
    for (const [s, at] of Object.entries(hits)) for (const c of at) expect(c, s).toContain(`adjust-side-${s}`);
  });
  test('no line without something copied; the line stays on the page (review M1, M3)', async ({ page }) => {
    await openAdjust(page);
    const paper = await page.locator('.adjust-paper figure').boundingBox();
    if (!paper) throw new Error('no page');
    const rows = await page
      .locator('.adjust-sheet[data-page="0"] .adjust-pick')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
    await page.mouse.click(paper.x + 4, Math.max(...rows) + 4);
    await expect(page.locator('.adjust-mark')).toHaveCount(0);
    await button(page, 'Copy').click();
    // At the very bottom of the page (in its empty left margin, scrolled clear of the tools): the line ends on the page.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const bottom = await page.locator('.adjust-paper figure').boundingBox();
    const barTop = (await page.locator('.actionbar').boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    if (!bottom) throw new Error('no page');
    expect(bottom.y + bottom.height).toBeLessThan(barTop);
    await page.mouse.click(bottom.x + 4, bottom.y + bottom.height - 2);
    await expect(page.locator('.adjust-mark')).toBeVisible();
    const line = await page.locator('.adjust-mark').boundingBox();
    if (!line) throw new Error('no line');
    expect(line.y + line.height).toBeLessThanOrEqual(bottom.y + bottom.height + 0.5);
  });
});
