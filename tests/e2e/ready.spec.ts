import { expect, type Page, test } from '@playwright/test';

// Owner, round 3: "add toggle in Ready to print, Colour or B&W, for easy switching … extremely user friendly". A
// Colour | Black & white switch under the preview: one tap changes this job and redraws the print.
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
const colourOf = (page: Page) =>
  page.evaluate(() => (globalThis as { __lastPlan?: { colour: string } }).__lastPlan?.colour);
const sw = (page: Page) => page.getByRole('group', { name: 'Print in' });
// Round 10: pages with two or more pages also have a Colour | Black & white switch under each page: these tests are about the
// one at the top.
const top = (page: Page, name: RegExp) => sw(page).getByRole('button', { name });

const reach: Record<string, (page: Page) => Promise<void>> = {
  photos: async (page) => {
    await page.goto('/?mockIntake=2');
    await button(page, 'One on each page').click();
  },
  'a PDF': async (page) => {
    await page.goto('/?mockIntake=1&mockPdfAt=1');
  },
  'passport photos': async (page) => {
    await page.goto('/?mockIntake=1');
    await button(page, 'Passport photos').click();
    await button(page, 'Next').click();
  },
  'ID cards': async (page) => {
    await page.goto('/?mockIntake=2');
    await button(page, 'ID card copy').click();
    await button(page, 'Done').click(); // the front's crop screen (owner, round 4)
    await button(page, 'Done').click(); // the back's crop screen (owner, round 4)
    await button(page, 'Card copy').click();
    await button(page, /^Real card size/).click();
  },
};

for (const [kind, open] of Object.entries(reach))
  test(`Ready's Colour | Black & white switch: one tap prints ${kind} in grey, another in colour again`, async ({
    page,
  }) => {
    await open(page);
    await expect(title(page)).toHaveText('Ready to print');
    await expect(sw(page)).toBeVisible();
    await expect(top(page, /Colour/)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => colourOf(page)).toBe('colour');
    await top(page, /Black & white/).click();
    await expect(top(page, /Black & white/)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => colourOf(page)).toBe('bw');
    await expect(page.locator('.summary')).toContainText('Black & white');
    await top(page, /Colour/).click();
    await expect.poll(() => colourOf(page)).toBe('colour');
    await expect(page.locator('.summary')).toContainText('Colour');
  });

test('the switch is a named group of two pressed buttons, each 56 px, and fits 320 px at 200 % text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await reach.photos?.(page);
  await expect(sw(page).getByRole('button')).toHaveCount(2);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  for (const b of await sw(page).getByRole('button').all()) {
    const box = await b.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

// Review M1 (round 3): a switch that could not be saved says so (PLAN §H2.6), and stays on what will print.
test('when the change cannot be saved, the switch says so and stays on Colour', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockSaveFail=1');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await sw(page).getByRole('button', { name: 'Black & white' }).click();
  await expect(page.getByText("Couldn't save this change. Try again.", { exact: false })).toBeVisible();
  await expect(sw(page).getByRole('button', { name: 'Colour' })).toHaveAttribute('aria-pressed', 'true');
});

// Owner, round 4: "put this Colour and Black & white at the top, and it should be a toggle … next to Ready to print".
for (const [w, h] of [
  [360, 800],
  [412, 915],
] as const)
  test(`the toggle sits in the title line, right of Ready to print (${w}×${h})`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await reach.photos?.(page);
    await expect(title(page)).toHaveText('Ready to print');
    const t = await title(page).boundingBox();
    const g = await sw(page).boundingBox();
    if (!t || !g) throw new Error('no title or toggle');
    expect(g.y).toBeLessThan(t.y + t.height);
    expect(g.y + g.height).toBeGreaterThan(t.y);
    expect(g.x).toBeGreaterThanOrEqual(t.x + t.width - 1);
    await expect(sw(page).getByRole('button', { name: 'Black & white' })).toHaveText('B&W');
    await expect(sw(page).getByRole('button', { name: 'Colour' })).toHaveText('Colour');
  });

test('the toggle is in the top bar, no longer above PRINT', async ({ page }) => {
  await reach.photos?.(page);
  await expect(page.locator('.topbar').getByRole('group', { name: 'Print in' })).toHaveCount(1);
  await expect(page.locator('.actionbar').getByRole('group', { name: 'Print in' })).toHaveCount(0);
});

test('at 200 % text on 320 px it wraps under the title, never over it', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await reach.photos?.(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const t = await title(page).boundingBox();
  const g = await sw(page).boundingBox();
  if (!t || !g) throw new Error('no title or toggle');
  const apart = g.y >= t.y + t.height - 1 || g.x >= t.x + t.width - 1;
  expect(apart).toBe(true);
});

// Owner, round 4: "where is the paper type selection? normal paper / glossy paper" — a reminder only.
test('Paper type: Glossy reminds to load it and says so on PRINT and in the line; Plain takes it away; the print is the same', async ({
  page,
}) => {
  await reach.photos?.(page);
  const planNow = () =>
    page.evaluate(() => {
      const p = (globalThis as { __lastPlan?: { rev: number; pages: unknown; contentType: string; colour: string } })
        .__lastPlan;
      return p ? JSON.stringify({ pages: p.pages, contentType: p.contentType, colour: p.colour }) : '';
    });
  await expect.poll(planNow).not.toBe('');
  const plain = await planNow();
  await button(page, 'Change').click();
  await button(page, /^Paper type/).click();
  await expect(title(page)).toHaveText('Paper type');
  await button(page, /^Glossy photo paper/).click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(page.getByText('Put glossy photo paper in the printer.')).toBeVisible();
  await expect(button(page, 'PAPER LOADED — PRINT')).toBeVisible();
  await expect(page.locator('.summary')).toContainText('A4 · Glossy · Colour');
  expect(await planNow()).toBe(plain);
  await button(page, 'Change').click();
  await button(page, /^Paper type/).click();
  await button(page, /^Plain paper/).click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(page.getByText('Put glossy photo paper in the printer.')).toHaveCount(0);
  await expect(button(page, 'PRINT')).toBeVisible();
  await expect(page.locator('.summary')).not.toContainText('Glossy');
});

// Owner, round 5: "when we click back from the print screen it still shows Opening the print screen… with a disabled
// button; it must show PRINT instantly so that we can click print again".
test.describe('back from the print screen (owner, round 5)', () => {
  test('PRINT works again at once, still on Ready, nothing else said', async ({ page }) => {
    await page.goto('/?mockIntake=2&mockPrint=notSent');
    await button(page, 'One on each page').click();
    await expect(button(page, 'PRINT')).toBeEnabled();
    await button(page, 'PRINT').click();
    await expect(button(page, 'PRINT')).toBeEnabled({ timeout: 1500 });
    await expect(title(page)).toHaveText('Ready to print');
    await expect(page.getByText('Opening the print screen…')).toHaveCount(0);
    // And it prints again.
    await button(page, 'PRINT').click();
    await expect(button(page, 'PRINT')).toBeEnabled({ timeout: 1500 });
  });
  test('the same for passport photos on 4×6 paper: PAPER LOADED — PRINT comes back as it was', async ({ page }) => {
    await page.goto('/?mockIntake=1&mockPrint=notSent&mockPhotoPaper=1');
    await button(page, 'Passport photos').click();
    await button(page, 'Next').click();
    await expect(title(page)).toHaveText('Ready to print');
    const print = page.getByRole('button', { name: /PRINT$/ });
    await expect(print).toBeEnabled();
    const words = await print.innerText();
    await print.click();
    await expect(print).toBeEnabled({ timeout: 1500 });
    await expect(print).toHaveText(words);
  });
  test('a test page backed out: back to its choices', async ({ page }) => {
    await page.goto('/?mockPrint=notSent');
    await page.getByRole('button', { name: /Settings/ }).click();
    await page.getByRole('button', { name: /^Print a test page/ }).click();
    await page.getByRole('button', { name: /^A4 paper/ }).click();
    await expect(page.getByRole('button', { name: /^A4 paper/ })).toBeEnabled({ timeout: 1500 });
    await expect(page.getByText('Sent to the printer ✓')).toHaveCount(0);
  });
});
