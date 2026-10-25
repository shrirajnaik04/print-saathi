import { expect, type Page, test } from '@playwright/test';

// Owner, round 5: "add a feature in recent jobs: clear / delete all recent jobs, so that the app is not loaded with
// unnecessary storage". Delete one job, or all jobs, each asked once.
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');
const sheet = (page: Page, name: string) => page.getByRole('dialog', { name });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Two jobs kept (each shared, chosen, then left), and Recent jobs open. */
const twoJobs = async (page: Page) => {
  await page.goto('/?mockIntake=2');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Home').click();
  await button(page, 'Leave').click();
  await expect(button(page, 'Recent jobs')).toBeVisible();
  await button(page, 'Recent jobs').click();
  await expect(title(page)).toHaveText('Recent jobs');
};
const rows = (page: Page) => page.getByRole('button', { name: /^Delete \(/ });

test('Delete on a row asks; Keep keeps it; Delete removes it from the list and from Home', async ({ page }) => {
  await twoJobs(page);
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().click();
  await expect(sheet(page, 'Delete this job?')).toBeVisible();
  await expect(sheet(page, 'Delete this job?')).toContainText('Its files are removed from the phone.');
  await button(page, 'Keep').click();
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().click();
  await sheet(page, 'Delete this job?').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('No jobs yet.', { exact: false })).toBeVisible();
  await button(page, 'Home').click();
  await expect(page.getByText('Continue the last job')).toHaveCount(0);
});

test('Delete all jobs asks once, then the list is empty and Home has no Continue card', async ({ page }) => {
  await twoJobs(page);
  await button(page, 'Delete all jobs').click();
  await expect(sheet(page, 'Delete all jobs?')).toContainText('All customer files are removed from the phone.');
  await button(page, 'Delete all').click();
  await expect(page.getByText('No jobs yet.', { exact: false })).toBeVisible();
  await expect(button(page, 'Delete all jobs')).toHaveCount(0);
  // Review Focus 5: a job open on another screen is kept, as Settings' Delete all does.
  expect(await page.evaluate(() => (globalThis as { __deleteKeepOpen?: boolean }).__deleteKeepOpen)).toBe(true);
  await button(page, 'Home').click();
  await expect(page.getByText('Continue the last job')).toHaveCount(0);
});

// Review M6: a delete that fails says so, and a job kept (printing) is explained, as Settings' Delete all does.
test('a delete that fails says so; Delete all says when a job is kept', async ({ page }) => {
  await twoJobs(page);
  await page.evaluate(() => {
    (globalThis as { __mockDeleteFails?: boolean }).__mockDeleteFails = true;
  });
  await rows(page).first().click();
  await sheet(page, 'Delete this job?').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText("Couldn't delete the job. Try again.");
  await expect(rows(page)).toHaveCount(1);
  await page.evaluate(() => {
    (globalThis as { __mockDeleteFails?: boolean }).__mockDeleteFails = false;
  });
  await page.goto('/?mockIntake=2&mockKeptOnDelete=1');
  await button(page, 'One on each page').click();
  await button(page, 'Home').click();
  await button(page, 'Leave').click();
  await button(page, 'Recent jobs').click();
  await button(page, 'Delete all jobs').click();
  await button(page, 'Delete all').click();
  await expect(page.getByText('A job that is printing or still arriving is kept until it finishes.')).toBeVisible();
});

test('no Delete all jobs on an empty list; the buttons are 56 px or more', async ({ page }) => {
  await page.goto('/');
  await button(page, 'Recent jobs').click();
  await expect(page.getByText('No jobs yet.', { exact: false })).toBeVisible();
  await expect(button(page, 'Delete all jobs')).toHaveCount(0);
  await twoJobs(page);
  for (const b of [rows(page).first(), button(page, 'Delete all jobs')]) {
    const r = await b.boundingBox();
    expect(r?.height ?? 0).toBeGreaterThanOrEqual(56 - 0.5);
  }
});
