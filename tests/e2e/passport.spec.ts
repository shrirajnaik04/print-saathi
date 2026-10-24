import { expect, type Page, test } from '@playwright/test';

// Owner, round 3: "Add custom number for passport size photos, auto adjust on next page if space isn't enough when the
// custom number entered is big." Besides 4 / 5 / 6 / 8 and − / +, a number box (1–100); extra sheets as needed.
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
type Plan = {
  paper: { wPt: number; hPt: number };
  pages: { orientation: string; placements: { box: { x: number; y: number; w: number; h: number } }[] }[];
};
const lastPlan = (page: Page) => page.evaluate(() => (globalThis as { __lastPlan?: Plan }).__lastPlan);
const box = (page: Page) => page.getByRole('textbox', { name: 'Or type a number' });

const openCount = async (page: Page, more = '') => {
  await page.goto(`/?mockIntake=1${more}`);
  await button(page, 'Passport photos').click();
  await button(page, 'Next').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Change').click();
  await button(page, /^How many photos/).click();
  await expect(title(page)).toHaveText('How many photos?');
};

for (const [paper, more] of [
  ['A4', ''],
  ['4×6 photo paper', '&mockPhotoPaper=1'],
] as const)
  test(`typing 37 gives 37 passport photos on as many sheets as needed (${paper})`, async ({ page }) => {
    await openCount(page, more);
    await box(page).fill('37');
    await box(page).press('Enter');
    await expect(page.getByRole('group', { name: 'How many passport photos?' })).toContainText('37');
    await button(page, 'Done').click();
    await expect(title(page)).toHaveText('Ready to print');
    await expect.poll(async () => (await lastPlan(page))?.pages.flatMap((p) => p.placements).length).toBe(37);
    const plan = await lastPlan(page);
    if (!plan) throw new Error('no plan');
    for (const p of plan.pages) {
      const [w, h] =
        p.orientation === 'landscape' ? [plan.paper.hPt, plan.paper.wPt] : [plan.paper.wPt, plan.paper.hPt];
      for (const { box: b } of p.placements) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(w + 0.01);
        expect(b.y + b.h).toBeLessThanOrEqual(h + 0.01);
      }
    }
    expect(plan.pages.length).toBeGreaterThan(1);
    await expect(page.getByText(new RegExp(`${plan.pages.length} sheets`)).first()).toBeVisible();
  });

test('the number box refuses 0, 101 and anything that is not a number, and keeps the count', async ({ page }) => {
  await openCount(page);
  for (const bad of ['0', '101', 'abc', '1e3', '-4', '']) {
    await box(page).fill(bad);
    await box(page).press('Enter');
    await expect(page.getByText('Type a number from 1 to 100.')).toBeVisible();
    await expect(page.getByRole('group', { name: 'How many passport photos?' })).toContainText('5');
  }
  // The message is tied to the box for screen readers.
  const id = await box(page).getAttribute('aria-describedby');
  expect(id).toBeTruthy();
});

test('spaces and leading zeros are fine: " 12 " is 12 and "007" is 7', async ({ page }) => {
  await openCount(page);
  await box(page).fill(' 12 ');
  await box(page).press('Enter');
  await expect(page.getByRole('group', { name: 'How many passport photos?' })).toContainText('12');
  await box(page).fill('007');
  await box(page).press('Enter');
  await expect(page.getByRole('group', { name: 'How many passport photos?' })).toContainText('7');
  await expect(page.getByText('Type a number from 1 to 100.')).toHaveCount(0);
});

test('the number box opens the number keypad and is 56 px tall', async ({ page }) => {
  await openCount(page);
  await expect(box(page)).toHaveAttribute('inputmode', 'numeric');
  expect((await box(page).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
});

// Review M2 (round 3): a number typed earlier is not saved again when the box is left after + / − changed the count.
test('typed 37, then + makes 38: leaving the box keeps 38 (and the box empties when + / − are used)', async ({
  page,
}) => {
  await openCount(page);
  await box(page).fill('37');
  await box(page).press('Enter');
  const group = page.getByRole('group', { name: 'How many passport photos?' });
  await expect(group).toContainText('37');
  await button(page, 'More photos').click();
  await expect(group).toContainText('38');
  await expect(box(page)).toHaveValue('');
  await box(page).focus();
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await lastPlan(page))?.pages.flatMap((p) => p.placements).length).toBe(38);
});
