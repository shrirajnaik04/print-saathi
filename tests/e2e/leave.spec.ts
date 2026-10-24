import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// Owner, round 4: "When exiting/back navigating any ongoing job ask confirmation whether really want to leave the job
// and discard or continue working" (Keep working / Leave / Delete this job), and "when back navigating from home page
// ask user stay on app or exit app".
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
const leaveQuestion = (page: Page) => page.getByRole('dialog', { name: 'Leave this job?' });
const exitQuestion = (page: Page) => page.getByRole('dialog', { name: 'Close PrintSaathi?' });
const phoneBack = (page: Page) => page.evaluate(() => (globalThis as { __androidBack?: () => void }).__androidBack?.());
const onHome = (page: Page) => expect(button(page, 'Recent jobs')).toBeVisible();

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const readyJob = async (page: Page) => {
  await page.goto('/?mockIntake=3');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
};

test('Back from Ready of a new job asks; Keep working stays; Leave goes Home and the job waits in Recent jobs', async ({
  page,
}) => {
  await readyJob(page);
  await button(page, 'Back').click();
  await button(page, 'Back').click(); // Received is under Ready: Back twice reaches the job's first screen
  await expect(leaveQuestion(page)).toBeVisible();
  await expect(leaveQuestion(page)).toContainText('It stays in Recent jobs, so you can finish it later.');
  await button(page, 'Keep working').click();
  await expect(leaveQuestion(page)).toHaveCount(0);
  await expect(title(page)).toHaveText('Files received');
  await button(page, 'Back').click();
  await button(page, 'Leave').click();
  await onHome(page);
  await button(page, 'Recent jobs').click();
  await expect(page.getByText('No jobs yet.', { exact: false })).toHaveCount(0);
});

test('Delete this job removes it: no Continue card and nothing in Recent jobs', async ({ page }) => {
  await readyJob(page);
  await button(page, 'Home').click();
  await expect(leaveQuestion(page)).toBeVisible();
  await button(page, 'Delete this job').click();
  await onHome(page);
  await expect(page.getByText('Continue the last job')).toHaveCount(0);
  await button(page, 'Recent jobs').click();
  await expect(page.getByText('No jobs yet.', { exact: false })).toBeVisible();
});

test('Home from Change asks; Back from Change (inside the job) does not', async ({ page }) => {
  await readyJob(page);
  await button(page, 'Change').click();
  await expect(title(page)).toHaveText('Change');
  await button(page, 'Back').click();
  await expect(leaveQuestion(page)).toHaveCount(0);
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Change').click();
  await button(page, 'Home').click();
  await expect(leaveQuestion(page)).toBeVisible();
});

test('after printing, Home does not ask', async ({ page }) => {
  await readyJob(page);
  await button(page, 'PRINT').click();
  await expect(title(page)).not.toHaveText('Ready to print');
  await button(page, 'Home').click();
  await expect(leaveQuestion(page)).toHaveCount(0);
  await onHome(page);
});

test('phone Back closes the question (Keep working)', async ({ page }) => {
  await readyJob(page);
  await button(page, 'Home').click();
  await expect(leaveQuestion(page)).toBeVisible();
  await phoneBack(page);
  await expect(leaveQuestion(page)).toHaveCount(0);
  await expect(title(page)).toHaveText('Ready to print');
});

test('phone Back on Home asks "Close PrintSaathi?"; Stay keeps Home; Close the app asks the phone once', async ({
  page,
}) => {
  await page.goto('/');
  await onHome(page);
  await phoneBack(page);
  await expect(exitQuestion(page)).toBeVisible();
  await button(page, 'Stay').click();
  await expect(exitQuestion(page)).toHaveCount(0);
  await onHome(page);
  await phoneBack(page);
  await phoneBack(page); // Back while it is open: Stay
  await expect(exitQuestion(page)).toHaveCount(0);
  await phoneBack(page);
  await button(page, 'Close the app').click();
  await expect.poll(() => page.evaluate(() => (globalThis as { __closedApp?: number }).__closedApp ?? 0)).toBe(1);
});

test('a share arriving while the question is open closes it and shows what arrived', async ({ page }) => {
  await readyJob(page);
  await button(page, 'Home').click();
  await expect(leaveQuestion(page)).toBeVisible();
  await page.evaluate(() => (globalThis as { __mockShare?: (n: number) => void }).__mockShare?.(2));
  await expect(leaveQuestion(page)).toHaveCount(0);
  await expect(title(page)).toHaveText(/New files arrived|Files received/);
});

test('the question: 56 px buttons, a named dialog, no accessibility problems', async ({ page }) => {
  await readyJob(page);
  await button(page, 'Home').click();
  await expect(leaveQuestion(page)).toBeVisible();
  for (const name of ['Keep working', 'Leave', 'Delete this job']) {
    const b = await button(page, name).boundingBox();
    expect(b?.height ?? 0).toBeGreaterThanOrEqual(56);
  }
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

// Whole-branch review, round 4. On a phone the engine does one thing at a time (`mockOneQueue`): reading a job waits
// for a print file being made. Back, Home and Cancel must answer at once all the same.
test.describe('with the engine busy (review C2, I1, M1)', () => {
  const busyReady = async (page: Page) => {
    await page.goto('/?mockIntake=1&mockPdfAt=1&mockOneQueue=1&mockSlowRender=6000');
    await expect(title(page)).toHaveText('Ready to print');
    await expect(button(page, 'Cancel')).toBeVisible(); // the print file is being made
  };
  test('Back asks at once while the print file is being made (C2)', async ({ page }) => {
    await busyReady(page);
    await button(page, 'Back').click();
    await expect(leaveQuestion(page)).toBeVisible({ timeout: 1500 });
  });
  test("Cancel while the print file is being made leaves at once, without asking (C2: Received's Cancel rule)", async ({
    page,
  }) => {
    await busyReady(page);
    await button(page, 'Cancel').click();
    await expect(button(page, 'Recent jobs')).toBeVisible({ timeout: 1500 });
    await expect(leaveQuestion(page)).toHaveCount(0);
  });
  test('Delete this job goes Home at once; the job is gone once the engine is free (M1)', async ({ page }) => {
    await busyReady(page);
    await button(page, 'Back').click();
    await expect(leaveQuestion(page)).toBeVisible({ timeout: 1500 });
    await button(page, 'Delete this job').click();
    await expect(button(page, 'Recent jobs')).toBeVisible({ timeout: 1500 });
    await expect(page.getByText('Continue the last job')).toHaveCount(0);
    await button(page, 'Recent jobs').click();
    await expect(page.getByText('No jobs yet.', { exact: false })).toBeVisible({ timeout: 10_000 });
  });
});

test('PRINT, then Back before the print screen closes: the result still comes and the job counts as printed (I1)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockDialogMs=2500');
  await expect(button(page, 'PRINT')).toBeEnabled();
  await button(page, 'PRINT').click();
  await phoneBack(page);
  await expect(leaveQuestion(page)).toBeVisible();
  // The print finished: the screen's own move to the result goes on, and the question gives way to it.
  await expect(title(page)).toHaveText('Printing', { timeout: 6000 });
  await expect(leaveQuestion(page)).toHaveCount(0);
  await button(page, 'Yes, done').click();
  await onHome(page);
  await expect(page.getByText('Continue the last job')).toHaveCount(0);
});

// Whole-branch review, declined item 5: the question on a small phone and a phone on its side, at the largest text.
// Found by it: the sheet was 48 px wider than a phone at any text size (its padding outside its width).
for (const [viewport, text] of [
  [{ width: 320, height: 640 }, 100],
  [{ width: 320, height: 640 }, 200],
  [{ width: 800, height: 360 }, 200],
] as const) {
  test.describe(`at ${text} % text, ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });
    test('the question fits the screen, and every answer can be reached and is 56 px or more', async ({ page }) => {
      await readyJob(page);
      await page.evaluate((t) => {
        document.documentElement.style.fontSize = `${t}%`;
      }, text);
      await button(page, 'Home').click();
      await expect(leaveQuestion(page)).toBeVisible();
      const box = await leaveQuestion(page).boundingBox();
      expect(box && box.y >= -1 && box.y + box.height <= viewport.height + 1).toBe(true);
      expect(box && box.x >= -1 && box.x + box.width <= viewport.width + 1).toBe(true);
      for (const name of ['Keep working', 'Leave', 'Delete this job']) {
        const b = button(page, name);
        await b.scrollIntoViewIfNeeded();
        await expect(b).toBeInViewport();
        const r = await b.boundingBox();
        expect(r?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
      }
      await button(page, 'Keep working').click();
      await expect(leaveQuestion(page)).toHaveCount(0);
    });
  });
}
