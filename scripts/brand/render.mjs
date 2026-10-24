// Renders the launcher PNGs from the brand masters in assets/brand/ (v3, the PS printer) with Chromium, at the exact
// pixel size of every Android density. Run after changing a master: node scripts/brand/render.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const RES = 'android/app/src/main/res';
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const svg = (name) => `data:image/svg+xml;base64,${readFileSync(path.join('assets/brand', name)).toString('base64')}`;

/** [name] drawn [size] px square on a transparent page; [round] clips it to a circle (Android 7 round icons). */
async function render(page, name, size, round = false) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><div id="i" style="width:${size}px;height:${size}px;${
      round ? 'border-radius:50%;overflow:hidden' : ''
    }"><img src="${svg(name)}" width="${size}" height="${size}" style="display:block"></div></body></html>`,
  );
  await page.waitForFunction(() => document.querySelector('img')?.complete);
  return page.locator('#i').screenshot({ omitBackground: true });
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [d, k] of Object.entries(DENSITIES)) {
  const dir = path.join(RES, `mipmap-${d}`);
  writeFileSync(path.join(dir, 'ic_launcher.png'), await render(page, 'app-icon.svg', 48 * k));
  writeFileSync(path.join(dir, 'ic_launcher_round.png'), await render(page, 'app-icon.svg', 48 * k, true));
  // Android 13 themed icon: only the shape counts (the phone colours it), with the PS and the paper cut out.
  writeFileSync(path.join(dir, 'ic_launcher_monochrome.png'), await render(page, 'android-monochrome.svg', 108 * k));
}
await browser.close();
console.log('brand PNGs written');
