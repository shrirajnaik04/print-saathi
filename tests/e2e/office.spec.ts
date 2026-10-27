import { expect, type Page, test } from '@playwright/test';

// Round 9 (owner: "When doc file is shared through WhatsApp … we get this error, also what about .pptx"): Office files
// are named by kind with Print with WPS Office (Phase 44); those made into pages open on Ready as "Word file · N pages"
// with an honest note (Phases 45–47). Mock: `?mockOfficeAt=<i>&mockOfficeKind=word|powerpoint|excel|office`,
// `mockOfficeMade=1` (made into pages), `mockOfficeMissed=1`, `mockNoOfficeApp=1`, `mockOfficeSlow=<ms>`.
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
const summary = (page: Page) => page.locator('.summary');
const opened = (page: Page) => page.evaluate(() => (globalThis as { __officeOpened?: number }).__officeOpened ?? 0);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('a shared Word file shows its card and Print with WPS Office (no dead end)', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockOfficeAt=1&mockOfficeKind=word');
  await expect(title(page)).toHaveText('Files received');
  await expect(page.getByText('This Word file prints from WPS Office.')).toBeVisible();
  await expect(button(page, 'Print with WPS Office')).toBeVisible();
  await expect(page.getByText('Nothing here can be printed yet.')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'The files' })).toBeVisible();
  await expect(page.locator('.thumb-note')).toHaveText('Word file');
});

test('Print with WPS Office hands the file over, once even on a double tap', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockOfficeAt=1&mockOfficeKind=powerpoint&mockOfficeSlow=400');
  await expect(page.getByText('This PowerPoint file prints from WPS Office.')).toBeVisible();
  await button(page, 'Print with WPS Office').dblclick();
  await expect.poll(() => opened(page)).toBe(1);
  await page.waitForTimeout(600);
  expect(await opened(page)).toBe(1);
});

test('no office app on the phone says to install WPS Office', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockOfficeAt=1&mockOfficeKind=excel&mockNoOfficeApp=1');
  await button(page, 'Print with WPS Office').click();
  await expect(page.getByRole('alert')).toContainText('Install WPS Office from the Play Store to print this file.');
});

test('a Word file made into pages opens on Ready with the honest note and WPS beside it', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockOfficeAt=1&mockOfficeKind=word&mockOfficeMade=1');
  await expect(title(page)).toHaveText('Ready to print');
  await expect(summary(page)).toHaveText(/^Word file · 3 pages · A4 · Colour · 1 copy/);
  await expect(
    page.getByText('Made from a Word file. Check the preview — it may look a little different from Word.'),
  ).toBeVisible();
  await expect(button(page, 'Print with WPS Office')).toBeVisible();
  await expect(page.getByText('Some parts (charts, diagrams) print only from WPS Office.')).toHaveCount(0);
});

test('parts that could not be drawn are said', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockOfficeAt=1&mockOfficeKind=powerpoint&mockOfficeMade=1&mockOfficeMissed=1');
  await expect(summary(page)).toHaveText(/^PowerPoint file · 3 pages/);
  await expect(page.getByText('Some parts (charts, diagrams) print only from WPS Office.')).toBeVisible();
});

test('a mixed share: the photos are chosen as usual and the PowerPoint card stays on Ready', async ({ page }) => {
  await page.goto('/?mockIntake=3&mockOfficeAt=2&mockOfficeKind=powerpoint');
  await expect(page.getByText('This PowerPoint file prints from WPS Office.')).toBeVisible();
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(page.getByText('This PowerPoint file prints from WPS Office.')).toBeVisible();
  await expect(page.getByText(/can't be printed yet/)).toHaveCount(0);
});

test('a list of photos only keeps its heading "The photos"', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await expect(page.getByRole('heading', { name: 'The photos' })).toBeVisible();
});

test('a shared text file is a text message', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockTextFileAt=1');
  await expect(title(page)).toHaveText('Ready to print');
  await expect(summary(page)).toHaveText(/^Text message · /);
  await expect(button(page, 'Edit text')).toBeVisible();
});

test('Receiving says which file is being made into pages', async ({ page }) => {
  await page.goto('/');
  await expect(title(page)).toHaveText('PrintSaathi');
  await page.evaluate(() => (globalThis as { __mockMaking?: (k: string) => void }).__mockMaking?.('word'));
  await expect(page.getByText('Getting the Word file ready…')).toBeVisible({ timeout: 5000 });
});

test('the Office card fits 320 px with a big button', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/?mockIntake=1&mockOfficeAt=1&mockOfficeKind=word');
  const b = await button(page, 'Print with WPS Office').boundingBox();
  expect(b?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
