import { expect, test } from '@playwright/test';

// Screenshots for a human design review (Phase 13+). Off by default: SHOTS=<out dir> npx playwright test shots.
const out = process.env.SHOTS;
test.skip(!out, 'set SHOTS=<dir> to take review screenshots');

const SCREENS: { name: string; url: string; taps?: (string | RegExp)[] }[] = [
  { name: 'home', url: '/?screen=home' },
  { name: 'received', url: '/?mockIntake=6' },
  { name: 'ready', url: '/?mockIntake=4', taps: ['All on one page'] },
  { name: 'change', url: '/?mockIntake=4', taps: ['All on one page', 'Change'] },
  { name: 'layout', url: '/?mockIntake=4', taps: ['All on one page', 'Change', /^Layout/] },
  { name: 'passport', url: '/?mockIntake=1&mockPhotoPaper=1', taps: ['Passport photos'] },
  { name: 'ready-passport', url: '/?mockIntake=1&mockPhotoPaper=1', taps: ['Passport photos', 'Next'] },
  { name: 'result', url: '/?mockIntake=2', taps: ['One on each page', 'PRINT'] },
  { name: 'pages', url: '/?mockIntake=6', taps: ['Use more pages', 'Change', /^Pages/] },
  { name: 'welcome', url: '/?mockFirstRun=1' },
  { name: 'settings', url: '/?screen=settings' },
  { name: 'recent', url: '/?mockIntake=2', taps: ['Home', 'Recent jobs'] },
];

for (const size of [
  { w: 412, h: 915, text: 100 },
  { w: 320, h: 640, text: 200 },
])
  for (const s of SCREENS)
    test(`shot ${s.name} ${size.w} ${size.text}`, async ({ page }) => {
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.emulateMedia({ reducedMotion: 'reduce' }); // the final state, not a frame of an animation
      await page.goto(s.url);
      for (const name of s.taps ?? [])
        await page.getByRole('button', { name, exact: typeof name === 'string' }).click();
      await expect(page.locator('main h1')).toBeVisible();
      await page.evaluate((t) => {
        document.documentElement.style.fontSize = `${t}%`;
      }, size.text);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${out}/${s.name}-${size.w}-${size.text}.png`, fullPage: true });
    });
