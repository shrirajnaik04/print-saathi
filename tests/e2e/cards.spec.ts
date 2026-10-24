import { expect, type Page, test } from '@playwright/test';

// Phase 14: Aadhaar & ID card copy, on the mock engine (every photo shows one card; the first has a face).
type Placement = { itemIndex: number; quad?: number[]; box: { x: number; y: number; w: number; h: number } };
type PlanLike = { contentType: string; pages: { placements: Placement[]; guides?: unknown[] }[] };
const lastPlan = (page: Page) => page.evaluate(() => (globalThis as { __lastPlan?: PlanLike }).__lastPlan);
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const title = (page: Page) => page.locator('main h1');

test('two card photos → ID card copy → Card copy → Real card size → Ready, both cards at exactly 85.6 × 54 mm', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2');
  await button(page, 'ID card copy').click();
  await expect(title(page)).toHaveText('ID card copy');
  await expect(page.getByRole('heading', { name: '2 ID cards found' })).toBeVisible();
  await expect(page.locator('.card-found .badge-label')).toHaveText(['Front', 'Back']);
  await expect(page.getByText('✓ Straightened')).toHaveCount(2);
  await expect(page.getByRole('img', { name: 'Front of the card, straightened' })).toBeVisible();
  await button(page, 'Card copy').click();
  await expect(title(page)).toHaveText('How big?');
  // Photos: three sizes (the whole e-Aadhaar page is for a PDF only).
  await expect(page.locator('.stack .tile')).toHaveCount(3);
  await button(page, /^Real card size/).click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(page.getByText('ID card · real size · A4 · Colour · 1 copy')).toBeVisible();
  await expect.poll(async () => (await lastPlan(page))?.contentType).toBe('document');
  const plan = await lastPlan(page);
  const ps = plan?.pages[0]?.placements ?? [];
  expect(ps.map((p) => p.itemIndex)).toEqual([1, 2]);
  for (const p of ps) {
    expect(p.box.w).toBeCloseTo((85.6 * 72) / 25.4, 3);
    expect(p.box.h).toBeCloseTo((54 * 72) / 25.4, 3);
    expect(p.quad).toHaveLength(8);
  }
  expect(plan?.pages[0]?.guides).toHaveLength(8);
});

test('the card with a face is the front; Swap front and back swaps them in the print', async ({ page }) => {
  // The mock puts the face on the first photo's card; with both cards in one photo, the face is on the second card.
  await page.goto('/?mockIntake=1&mockCards=both');
  await button(page, 'ID card copy').click();
  await expect(page.getByRole('heading', { name: '2 ID cards found' })).toBeVisible();
  await button(page, 'Card copy').click();
  await button(page, /^Real card size/).click();
  await expect(title(page)).toHaveText('Ready to print');
  // The second card found (with the face) prints first.
  await expect.poll(async () => (await lastPlan(page))?.pages[0]?.placements[0]?.quad?.[1]).toBeCloseTo(0.52, 5);
  await button(page, 'Change').click();
  await button(page, /^ID card copy/).click();
  await button(page, 'Swap front and back').click();
  await button(page, 'Card copy').click();
  await button(page, /^Real card size/).click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await lastPlan(page))?.pages[0]?.placements[0]?.quad?.[1]).toBeCloseTo(0.1, 5);
});

test('Fix corners: Next corner and the arrows move the chosen corner by 1 %; Done keeps it for the print', async ({
  page,
}) => {
  await page.goto('/?mockIntake=2');
  await button(page, 'ID card copy').click();
  await button(page, 'Fix corners (Front)').click();
  await expect(title(page)).toHaveText('Fix corners');
  await expect(page.getByText('Corner 1 of 4: top left')).toBeVisible();
  await button(page, 'Next corner').click();
  await expect(page.getByText('Corner 2 of 4: top right')).toBeVisible();
  await button(page, 'Right').click();
  await button(page, 'Right').click();
  await button(page, 'Down').click();
  // The straightened result updates (a new preview for the new corners).
  await expect(page.getByRole('img', { name: 'The card, straightened' })).toBeVisible();
  await button(page, 'Done').click();
  await expect(title(page)).toHaveText('ID card copy');
  await button(page, 'Card copy').click();
  await button(page, /^Real card size/).click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await lastPlan(page))?.pages[0]?.placements[0]?.quad?.[2]).toBeCloseTo(0.62, 5);
  expect((await lastPlan(page))?.pages[0]?.placements[0]?.quad?.[3]).toBeCloseTo(0.13, 5);
  // Back on the cards screen (Change), the fixed corners are kept: it never looks for the cards again.
  await button(page, 'Change').click();
  await button(page, /^ID card copy/).click();
  await expect(page.getByText('Check the corners')).toHaveCount(0);
  await button(page, 'Card copy').click();
  await button(page, /^Real card size/).click();
  await expect.poll(async () => (await lastPlan(page))?.pages[0]?.placements[0]?.quad?.[2]).toBeCloseTo(0.62, 5);
});

test('no card found: says so and opens Fix corners on a starting frame', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockCards=none');
  await button(page, 'ID card copy').click();
  await expect(title(page)).toHaveText('Fix corners');
  await button(page, 'Done').click();
  await expect(page.getByRole('heading', { name: "Couldn't find the card's edges" })).toBeVisible();
  await expect(page.getByText('Check the corners')).toBeVisible();
});

test('a card found but not surely: shown with "Check the corners"', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockCards=low');
  await button(page, 'ID card copy').click();
  await expect(page.getByText('Check the corners')).toHaveCount(2);
});

test('a shared e-Aadhaar PDF offers ID card copy; How big? has the whole page too; the last size comes first', async ({
  page,
}) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockAadhaar=1');
  await expect(button(page, 'ID card copy')).toBeVisible();
  await expect(button(page, 'Print the whole document')).toBeVisible();
  await button(page, 'ID card copy').click();
  await expect(page.getByRole('heading', { name: '2 ID cards found' })).toBeVisible();
  await button(page, 'Card copy').click();
  await expect(page.locator('.stack .tile')).toHaveCount(4);
  await button(page, /^Big size/).click();
  await expect(page.getByText('ID card · big size · A4 · Colour · 1 copy')).toBeVisible();
  // Next time Big size is offered first.
  await button(page, 'Change').click();
  await button(page, /^Size/).click();
  await expect(page.locator('.stack .tile').first()).toContainText('Big size');
});

test('the Aadhaar tile asks where the card is: the gallery for photos, the file manager for a PDF (owner)', async ({
  page,
}) => {
  const from = () => page.evaluate(() => (globalThis as { __pickFrom?: string }).__pickFrom);
  await page.goto('/');
  await button(page, /^Aadhaar & ID cards/).click();
  await expect(title(page)).toHaveText('Where is the card?');
  await button(page, /^Photos of the card/).click();
  await expect.poll(from).toBe('gallery');
  await expect(title(page)).toHaveText('ID card copy');
});

test('the file manager choice brings an e-Aadhaar PDF to its cards (owner)', async ({ page }) => {
  const from = () => page.evaluate(() => (globalThis as { __pickFrom?: string }).__pickFrom);
  await page.goto('/?mockPdfAt=1&mockAadhaar=1');
  await button(page, /^Aadhaar & ID cards/).click();
  await button(page, /^e-Aadhaar PDF or file/).click();
  await expect.poll(from).toBe('files');
  await expect(page.getByRole('heading', { name: '2 ID cards found' })).toBeVisible();
});

test('a locked e-Aadhaar from Home asks to unlock first, then finds its two cards', async ({ page }) => {
  await page.goto('/?mockPdfAt=1&mockPdfLocked=1&mockAadhaar=1');
  await button(page, /^Aadhaar & ID cards/).click();
  await button(page, /^e-Aadhaar PDF or file/).click();
  await expect(page.getByText('This PDF is locked. Unlock it first.')).toBeVisible();
  await button(page, 'Unlock PDF').click();
  await expect(title(page)).toHaveText('Unlock PDF');
  await page.getByLabel('First 4 letters of the name').fill('RAMA');
  await page.getByLabel('Year of birth').fill('1965');
  await button(page, 'Unlock').click();
  await expect(title(page)).toHaveText('ID card copy');
  await expect(page.getByRole('heading', { name: '2 ID cards found' })).toBeVisible();
});

test('Many copies fills the sheet with front and back sets and cut lines', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await button(page, 'ID card copy').click();
  await button(page, 'Card copy').click();
  await button(page, /^Many copies/).click();
  await expect(page.getByText('ID card · many copies · A4 · Colour · 1 copy')).toBeVisible();
  await expect
    .poll(async () => ((await lastPlan(page))?.pages[0]?.placements ?? []).map((p) => p.itemIndex))
    .toEqual([1, 2, 1, 2, 1, 2, 1, 2]);
});

// Review (2026-10-24): Bigger on Adjust silently turned "many copies" into one bigger set (fewer copies printed).
// Many copies are real-size cards, so there is nothing to size: no Adjust (as for the whole page).
test('Many copies: no Adjust, and tapping the sheet never opens it (the copies are kept)', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await button(page, 'ID card copy').click();
  await button(page, 'Card copy').click();
  await button(page, /^Many copies/).click();
  await expect(page.getByText('ID card · many copies · A4 · Colour · 1 copy')).toBeVisible();
  await expect(button(page, 'Adjust cards')).toHaveCount(0);
  await page.locator('.sheets > li').first().click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => ((await lastPlan(page))?.pages[0]?.placements ?? []).length).toBe(8);
});

// ---- Phase 14 gate review fixes ----

test('a locked e-Aadhaar shared from WhatsApp: unlock on Ready as usual, then Ready offers ID card copy (review I1)', async ({
  page,
}) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockPdfLocked=1&mockAadhaar=1');
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Unlock').click();
  await page.getByLabel('First 4 letters of the name').fill('RAMA');
  await page.getByLabel('Year of birth').fill('1965');
  await button(page, 'Unlock').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(page.getByText('This PDF has ID cards on it', { exact: false })).toBeVisible();
  await button(page, 'ID card copy').click();
  await expect(page.getByRole('heading', { name: '2 ID cards found' })).toBeVisible();
});

test('a locked PDF that is not an e-Aadhaar: no card offer after unlocking', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1&mockPdfLocked=1');
  await button(page, 'Unlock').click();
  await page.getByLabel('First 4 letters of the name').fill('RAMA');
  await page.getByLabel('Year of birth').fill('1965');
  await button(page, 'Unlock').click();
  await expect(title(page)).toHaveText('Ready to print');
  await page.waitForTimeout(800);
  await expect(page.getByText('This PDF has ID cards on it', { exact: false })).toHaveCount(0);
});

test('a normal PDF still goes straight to Ready (no card question)', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPdfAt=1');
  await expect(title(page)).toHaveText('Ready to print');
});

test('a PDF with no card panels opens Fix corners on a starting frame, never a dead end (review I3)', async ({
  page,
}) => {
  await page.goto('/?mockPdfAt=1');
  await button(page, /^Aadhaar & ID cards/).click();
  await button(page, /^e-Aadhaar PDF or file/).click();
  await expect(title(page)).toHaveText('Fix corners');
});

test('Try again looks for the cards again (review I3)', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockCardsFail=1');
  await button(page, 'ID card copy').click();
  await button(page, 'Try again').click();
  await expect(page.getByRole('heading', { name: '2 ID cards found' })).toBeVisible();
});

test('Back while the cards are looked for: nothing is saved behind the shopkeeper (review I7)', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockSlowCards=1500');
  await button(page, 'ID card copy').click();
  await expect(page.getByText('Looking for the cards…')).toBeVisible();
  await button(page, 'Back').click();
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await page.waitForTimeout(2000);
  await expect(page.getByText(/^2 photos · /)).toBeVisible();
  await expect(page.getByText(/^ID card/)).toHaveCount(0);
});

test('"Check the corners" stays with its card through Swap (review I6)', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockCards=mixed');
  await button(page, 'ID card copy').click();
  await expect(page.locator('.card-found .card-state')).toHaveText(['✓ Straightened', 'Check the corners']);
  await button(page, 'Swap front and back').click();
  await expect(page.locator('.card-found .card-state')).toHaveText(['Check the corners', '✓ Straightened']);
});

test('Fix corners: the straightened preview changes when a corner moves (review m17)', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await button(page, 'ID card copy').click();
  await button(page, 'Fix corners (Front)').click();
  const img = page.getByRole('img', { name: 'The card, straightened' });
  await expect(img).toBeVisible();
  const before = await img.getAttribute('src');
  for (let i = 0; i < 3; i++) await button(page, 'Right').click();
  await expect.poll(() => img.getAttribute('src')).not.toBe(before);
});

// ---- Phase 15: auto-rotation (spec Part 3) ----
type TurnPlan = { pages: { placements: { itemIndex: number; turns: number }[] }[] };
const turnsInPlan = async (page: Page) =>
  ((await page.evaluate(() => (globalThis as { __lastPlan?: TurnPlan }).__lastPlan))?.pages ?? []).flatMap((p) =>
    p.placements.map((x) => [x.itemIndex, x.turns]),
  );

test('a photo sent sideways is turned upright with a note; the turn reaches the print', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockFaceTurn=1:1');
  await expect(page.getByText('Turned 1 photo upright.')).toBeVisible();
  await expect(page.locator('.thumb img').first()).toHaveClass(/turn-1/);
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(page.getByText('Turned 1 photo upright.')).toBeVisible();
  await expect
    .poll(() => turnsInPlan(page))
    .toEqual([
      [1, 1],
      [2, 0],
    ]);
});

test('photos chosen from the phone are shown as they are: never turned by the app (owner)', async ({ page }) => {
  await page.goto('/?mockFaceTurn=1:1');
  await button(page, /^Photos/).click();
  await expect(button(page, 'One on each page')).toBeVisible();
  // The faces are found at once in the mock: a share would show the note by now (test above).
  await page.waitForTimeout(1500);
  await expect(page.getByText(/Turned \d+ photos? upright/)).toHaveCount(0);
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect
    .poll(() => turnsInPlan(page))
    .toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
});

test('Undo puts the photos back as they came, and the print follows', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockFaceTurn=1:3');
  await expect(page.getByText('Turned 1 photo upright.')).toBeVisible();
  await button(page, 'Undo').click();
  await expect(page.getByText('Turned 1 photo upright.')).toHaveCount(0);
  await expect(page.locator('.thumb img').first()).toHaveClass(/turn-0/);
  await button(page, 'One on each page').click();
  await expect
    .poll(() => turnsInPlan(page))
    .toEqual([
      [1, 0],
      [2, 0],
    ]);
});

test('photos with nothing to go on are left as they are (no note)', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await expect(page.getByRole('button', { name: 'One on each page' })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText(/upright\./)).toHaveCount(0);
});

test('a choice tapped before the check finishes still gets the turn before Ready (review I1)', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockFaceTurn=1:1&mockSlowFaces=1500');
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect(page.getByText('Turned 1 photo upright.')).toBeVisible();
  await expect
    .poll(() => turnsInPlan(page))
    .toEqual([
      [1, 1],
      [2, 0],
    ]);
});

test('Undo on Ready puts the photo back and the print follows', async ({ page }) => {
  await page.goto('/?mockIntake=2&mockFaceTurn=2:3');
  await expect(page.getByText('Turned 1 photo upright.')).toBeVisible();
  await button(page, 'One on each page').click();
  await expect(title(page)).toHaveText('Ready to print');
  await button(page, 'Undo').click();
  await expect(page.getByText('Turned 1 photo upright.')).toHaveCount(0);
  await expect
    .poll(() => turnsInPlan(page))
    .toEqual([
      [1, 0],
      [2, 0],
    ]);
});

// Owner, 2026-10-24: "where is the option to print the back side? … optional: the customer might need the front only
// or both sides printed on one page vertically".
test('one side found: Add the back side from the gallery gives front then back on one page', async ({ page }) => {
  await page.goto('/?mockIntake=1&mockPickN=1');
  await button(page, 'ID card copy').click();
  await expect(page.getByText('Only the front will print.')).toBeVisible();
  await button(page, 'Add the back side').click();
  await expect(title(page)).toHaveText('Where is the back side?');
  await button(page, /From the gallery/).click();
  await expect(title(page)).toHaveText('ID card copy');
  await expect(page.locator('.card-found')).toHaveCount(2);
  await expect(page.locator('.card-found .badge-label')).toHaveText(['Front', 'Back']);
  expect(await page.evaluate(() => (globalThis as { __pickMax?: number }).__pickMax)).toBe(1);
  await button(page, 'Card copy').click();
  await button(page, /^Real card size/).click();
  await expect(title(page)).toHaveText('Ready to print');
  await expect.poll(async () => (await lastPlan(page))?.pages.length).toBe(1);
  expect((await lastPlan(page))?.pages[0]?.placements).toHaveLength(2);
});

test('two sides: Print front only leaves the front alone; Undo brings the back again', async ({ page }) => {
  await page.goto('/?mockIntake=2');
  await button(page, 'ID card copy').click();
  await expect(page.locator('.card-found')).toHaveCount(2);
  await button(page, 'Print front only').click();
  await expect(page.locator('.card-found')).toHaveCount(1);
  await button(page, 'Undo').click();
  await expect(page.locator('.card-found')).toHaveCount(2);
  await button(page, 'Print front only').click();
  await button(page, 'Card copy').click();
  await button(page, /^Real card size/).click();
  await expect.poll(async () => (await lastPlan(page))?.pages[0]?.placements.length).toBe(1);
});
