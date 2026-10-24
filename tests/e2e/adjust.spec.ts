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
  test('Show next page and sliding sideways over the photo each bring page 2 to the middle, its photo chosen', async ({
    page,
  }) => {
    await twoPages(page);
    await button(page, 'Show next page').click();
    await expect(label(page)).toHaveText(/^Page 2 of 2/);
    // Said aloud (TalkBack) when ‹ › or a swipe moves the pages.
    await expect(label(page)).toHaveAttribute('aria-live', 'polite');
    // The tools never change a photo out of sight: at rest on page 2, its photo is the chosen one.
    await expect(title(page)).toHaveText('Photo 2 of 2');
    await button(page, 'Show previous page').click();
    await expect(label(page)).toHaveText(/^Page 1 of 2/);
    await expect(title(page)).toHaveText('Photo 1 of 2');
    // Sideways over the photo itself (a finger's swipe is proven on the phone: headless Chromium does not scroll for a
    // synthesized touch, device smoke round 4).
    const photo = await page.locator('.adjust-sheet[data-page="0"] .adjust-pick').boundingBox();
    if (!photo) throw new Error('no photo on page 1');
    await page.mouse.move(photo.x + photo.width / 2, photo.y + photo.height / 2);
    await page.mouse.wheel(300, 0);
    await expect(label(page)).toHaveText(/^Page 2 of 2/);
    await expect(title(page)).toHaveText('Photo 2 of 2');
    await expect.poll(() => centred(page, 1)).toBeLessThan(3);
  });
  // Device finding (round-4 smoke, API 35): one quick flick slid from page 1 to page 4. A page at a time.
  test('a big fling moves one page, never past it', async ({ page }) => {
    await page.goto('/?mockIntake=6');
    await button(page, 'One on each page').click();
    await button(page, 'Adjust photos').click();
    await expect(title(page)).toHaveText('Photo 1 of 6');
    // A slide aimed four pages on (as a fling is; headless Chromium's wheel does not keep to snap stops, the phone's
    // finger does: round-4 smoke).
    await page.locator('.adjust-strip').evaluate((e) => e.scrollBy({ left: 4 * e.clientWidth }));
    await expect(label(page)).toHaveText(/^Page 2 of 6/);
    await expect(title(page)).toHaveText('Photo 2 of 6');
    await page.waitForTimeout(600);
    await expect(label(page)).toHaveText(/^Page 2 of 6/);
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
  test('Zoom out / Zoom in are the first two tools on every kind, 56 px or more; 100 % to start', async ({ page }) => {
    for (const open of [
      () => openAdjust(page, 'One on each page', 2),
      async () => {
        await page.goto('/?mockIntake=1&mockPdfAt=1');
        await button(page, 'Adjust pages').click();
        await expect(title(page)).toHaveText('Page 1 of 3');
      },
    ]) {
      await open();
      const tools = page.locator('.actionbar .tool-row .btn');
      await expect(tools.nth(0)).toHaveAccessibleName('Zoom out');
      await expect(tools.nth(1)).toHaveAccessibleName('Zoom in');
      for (const i of [0, 1]) {
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
