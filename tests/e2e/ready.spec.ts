import { expect, type Page, test } from '@playwright/test';

// Owner, round 3: "add toggle in Ready to print, Colour or B&W, for easy switching … extremely user friendly". A
// Colour | Black & white switch under the preview: one tap changes this job and redraws the print.
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
const colourOf = (page: Page) =>
  page.evaluate(() => (globalThis as { __lastPlan?: { colour: string } }).__lastPlan?.colour);
const sw = (page: Page) => page.getByRole('group', { name: 'Print in' });

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
    await expect(button(page, /Colour/)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => colourOf(page)).toBe('colour');
    await button(page, /Black & white/).click();
    await expect(button(page, /Black & white/)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => colourOf(page)).toBe('bw');
    await expect(page.locator('.summary')).toContainText('Black & white');
    await button(page, /Colour/).click();
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
