import { expect, type Page, test } from '@playwright/test';

// Owner, round 8: "Some people come like this [a long WhatsApp text message] … rare case. But option should be there."
// Shared from WhatsApp, or pasted on Home's Text message; printed as an A4 document; Text size and Edit text.
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
const box = (page: Page) => page.getByRole('textbox', { name: "The customer's message" });
const summary = (page: Page) => page.locator('.summary');
const SPEECH = 'A Call to Action & END\n\nYou do not need to read a massive Encyclopedia on day one.\n\n*THANK YOU!*';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Home → Text message: Paste fills the box, Done prints it as a document (Text message · pages)', async ({
  page,
}) => {
  await page.goto(`/?mockClipboard=${encodeURIComponent(SPEECH)}`);
  await button(page, /^Text message/).click();
  await expect(title(page)).toHaveText('Text message');
  await expect(box(page)).toHaveValue('');
  await button(page, 'Paste').click();
  await expect(box(page)).toHaveValue(SPEECH);
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(summary(page)).toContainText(/^Text message · 1 page · A4 · Colour · 1 copy/);
  await expect(button(page, 'Edit text')).toBeVisible();
});

test('Text message: nothing typed says so and stays; too long says what to do', async ({ page }) => {
  await page.goto('/');
  await button(page, /^Text message/).click();
  await button(page, 'Done').click();
  await expect(page.getByRole('alert')).toContainText('There is no text to print.');
  await expect(title(page)).toHaveText('Text message');
  await box(page).fill('a'.repeat(100_001));
  await button(page, 'Done').click();
  await expect(page.getByRole('alert')).toContainText(
    'This message is too long to print here. Ask the customer to send it as a PDF.',
  );
  await expect(title(page)).toHaveText('Text message');
});

test('Paste with nothing copied says so', async ({ page }) => {
  await page.goto('/');
  await button(page, /^Text message/).click();
  await button(page, 'Paste').click();
  await expect(page.getByRole('status').filter({ hasText: 'Nothing is copied yet.' })).toBeVisible();
});

test('a text shared from WhatsApp goes straight to Ready', async ({ page }) => {
  await page.goto(`/?mockText=${encodeURIComponent(SPEECH)}`);
  await expect(title(page)).toHaveText('Ready to print');
  await expect(summary(page)).toContainText(/^Text message · /);
});

test('Change → Text size → Extra large: more pages; the summary follows', async ({ page }) => {
  await page.goto(`/?mockText=${encodeURIComponent('word '.repeat(700))}`);
  await expect(summary(page)).toContainText('Text message · 2 pages');
  await button(page, 'Change').click();
  await page.getByRole('button', { name: /^Text size/ }).click();
  await expect(title(page)).toHaveText('Text size');
  await expect(page.getByRole('button', { name: /^Normal/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Extra large/ }).click();
  await expect(title(page)).toHaveText(/Change|Ready to print/);
  if ((await title(page).innerText()) !== 'Ready to print') await button(page, 'Done').click();
  await expect(summary(page)).toContainText('Text message · 5 pages');
});

test('Ready → Edit text: the box holds the text; changed and Done, the print follows', async ({ page }) => {
  await page.goto(`/?mockText=${encodeURIComponent('Short note.')}`);
  await expect(summary(page)).toContainText('Text message · 1 page');
  await button(page, 'Edit text').click();
  await expect(title(page)).toHaveText('Text message');
  await expect(box(page)).toHaveValue('Short note.');
  await box(page).fill('word '.repeat(700));
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(summary(page)).toContainText('Text message · 2 pages');
});

test('the Text message screen: the box and its buttons are big enough, labelled, no sideways scroll at 320 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await button(page, /^Text message/).click();
  for (const b of [button(page, 'Paste'), button(page, 'Done')])
    expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
  expect((await box(page).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(160);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
