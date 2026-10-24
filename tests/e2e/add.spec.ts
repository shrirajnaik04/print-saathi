import { expect, type Page, test } from '@playwright/test';

// Add photos / Add files (owner, 2026-10-24: "Add more images option needed"): Gallery or File manager, the files join
// the job at its end, without the "New files arrived" question, and the shopkeeper is back where Add was pressed.
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
type Plan = { pages: { placements: { itemIndex: number }[] }[] };
const placed = async (page: Page) =>
  ((await page.evaluate(() => (globalThis as { __lastPlan?: Plan }).__lastPlan))?.pages ?? []).flatMap((p) =>
    p.placements.map((x) => x.itemIndex),
  );

const openPhotos = async (page: Page, url = '/?mockIntake=2&mockPickN=3') => {
  await page.goto(url);
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Change').click();
  await button(page, /^Photos/).click();
  await expect(title(page)).toHaveText('Photos');
};

test('Add photos from the photo list: gallery, the new photos at the end, no question, back on the list', async ({
  page,
}) => {
  await openPhotos(page);
  await expect(page.locator('.thumb-grid li')).toHaveCount(2);
  await button(page, 'Add photos').click();
  await expect(title(page)).toHaveText('Where are the photos?');
  await button(page, /From the gallery/).click();
  await expect(title(page)).toHaveText('Photos');
  await expect(page.locator('.thumb-grid li')).toHaveCount(5);
  await expect(page.getByText('New files arrived')).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as { __pickFrom?: string }).__pickFrom)).toBe('gallery');
  await button(page, 'Done').click();
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await placed(page)).length).toBe(5);
});

test('Add photos from the file manager asks the file manager, for photos only', async ({ page }) => {
  await openPhotos(page);
  await button(page, 'Add photos').click();
  await button(page, /From the file manager/).click();
  await expect(title(page)).toHaveText('Photos');
  await expect(page.locator('.thumb-grid li')).toHaveCount(5);
  expect(await page.evaluate(() => (globalThis as { __pickFrom?: string }).__pickFrom)).toBe('files');
});

test('Add photos on Adjust: back on Adjust with the first new photo chosen', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockPickN=2');
  await button(page, 'All on one page').click();
  await button(page, 'Adjust photos').click();
  await expect(title(page)).toHaveText('Photo 1 of 2');
  await button(page, 'Add photos').click();
  await button(page, /From the gallery/).click();
  await expect(title(page)).toHaveText('Photo 3 of 4');
});

test('Add files on a document job takes a PDF', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPickN=1');
  await button(page, 'Print as document').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Change').click();
  await button(page, /^Page order/).click();
  await button(page, 'Add files').click();
  await expect(title(page)).toHaveText('Where are the files?');
  await button(page, /From the file manager/).click();
  await expect(page.getByRole('button', { name: /^File 2/ }).first()).toBeVisible();
});

test('closing the picker changes nothing, and a later share is never added by itself', async ({ page }) => {
  await openPhotos(page, '/?mockIntake=2&mockPick=0');
  await button(page, 'Add photos').click();
  await button(page, /From the gallery/).click();
  await expect(title(page)).toHaveText('Where are the photos?');
  await button(page, 'Back').click();
  await expect(page.locator('.thumb-grid li')).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem('ps.addInto'))).toBeNull();
});

test('a job near 100 files takes what fits and says so', async ({ page }) => {
  await openPhotos(page, '/?mockIntake=98&mockPickN=4');
  await button(page, 'Add photos').click();
  await button(page, /From the gallery/).click();
  await expect(title(page)).toHaveText('Photos');
  expect(await page.evaluate(() => (globalThis as { __pickMax?: number }).__pickMax)).toBe(2);
  await expect(page.locator('.thumb-grid li')).toHaveCount(100);
});

test('no Add on passport or ID card jobs', async ({ page }) => {
  await page.goto('/?mockIntake=1');
  await button(page, 'Passport photos').click();
  await button(page, 'Next').click();
  await button(page, 'Adjust passport photo').click();
  await expect(button(page, 'Add photos')).toHaveCount(0);
});

test('from the file manager (which cannot be told a most) only what fits joins, and the list says so', async ({
  page,
}) => {
  await openPhotos(page, '/?mockIntake=98&mockPickN=4');
  await button(page, 'Add photos').click();
  await button(page, /From the file manager/).click();
  await expect(title(page)).toHaveText('Photos');
  await expect(page.getByText('Only 2 of the 4 files were added: one job holds up to 100 files.')).toBeVisible();
  await expect(page.locator('.thumb-grid li')).toHaveCount(100);
});

test('files chosen for a job that was deleted meanwhile open as their own job (nothing lost)', async ({ page }) => {
  await page.goto('/?mockPickN=2');
  await page.evaluate(() => localStorage.setItem('ps.addInto', JSON.stringify({ jobId: 'gone', at: Date.now() })));
  await button(page, /^Photos/).click();
  await expect(title(page)).toHaveText('Files received');
  await expect(page.getByRole('img', { name: /of 2$/ })).toHaveCount(2);
});

// Whole-branch review I1: a pick for "Add photos" that came to nothing must not leave the wish behind for a later pick.
test('after an Add whose files never arrived, the wish is gone (a later pick opens its own job)', async ({ page }) => {
  await openPhotos(page);
  await button(page, 'Add photos').click();
  await page.evaluate(() => history.replaceState(null, '', '/?mockStorageFull=1'));
  await button(page, /From the gallery/).click();
  await expect(page.getByText('storage is full', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ps.addInto'))).toBeNull();
});

test('Add on the photo list never decides which photo a later Adjust opens on', async ({ page }) => {
  await openPhotos(page);
  await button(page, 'Add photos').click();
  await button(page, /From the gallery/).click();
  await expect(page.locator('.thumb-grid li')).toHaveCount(5);
  await button(page, 'Done').click();
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Adjust photos').click();
  await expect(title(page)).toHaveText('Photo 1 of 5');
});
