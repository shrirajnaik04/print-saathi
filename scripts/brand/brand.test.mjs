// The PS printer logo everywhere (owner, 2026-10-23; brand pack v3, masters in assets/brand/): launcher icons at every
// density, the adaptive and themed icon layers, the system splash, and no Capacitor sample artwork left behind.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const RES = 'android/app/src/main/res';
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** Width and height from a PNG's header. */
function pngSize(file) {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${file} is not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('launcher, round and themed (monochrome) icons at every density, the right size', () => {
  for (const [d, k] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${d}`);
    assert.deepEqual(pngSize(path.join(dir, 'ic_launcher.png')), [48 * k, 48 * k], `${d} ic_launcher`);
    assert.deepEqual(pngSize(path.join(dir, 'ic_launcher_round.png')), [48 * k, 48 * k], `${d} ic_launcher_round`);
    assert.deepEqual(pngSize(path.join(dir, 'ic_launcher_monochrome.png')), [108 * k, 108 * k], `${d} monochrome`);
    // The sample foreground PNG is replaced by the vector (crisp at every size).
    assert.equal(existsSync(path.join(dir, 'ic_launcher_foreground.png')), false, `${d} old foreground PNG`);
  }
});

test('the adaptive icons use the white background, the vector printer and the themed-icon layer', () => {
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    const xml = readFileSync(path.join(RES, 'mipmap-anydpi-v26', `${name}.xml`), 'utf8');
    assert.match(xml, /<foreground android:drawable="@drawable\/ic_launcher_foreground"\/>/);
    assert.match(xml, /<monochrome android:drawable="@mipmap\/ic_launcher_monochrome"\/>/);
  }
  assert.match(readFileSync(path.join(RES, 'values/ic_launcher_background.xml'), 'utf8'), /#FFFFFF/);
  // The PS printer in brand cobalt and tangerine, not the Capacitor sample.
  const fg = readFileSync(path.join(RES, 'drawable/ic_launcher_foreground.xml'), 'utf8');
  assert.match(fg, /#FF304BEE/);
  assert.match(fg, /#FFFF854A/);
});

test('the launch theme shows the printer on the app background (system splash on Android 12+, window before)', () => {
  const styles = readFileSync(path.join(RES, 'values/styles.xml'), 'utf8');
  const launch = styles.slice(styles.indexOf('name="AppTheme.NoActionBarLaunch"'));
  assert.match(launch, /<item name="windowSplashScreenBackground">@color\/splash_background<\/item>/);
  assert.match(launch, /<item name="windowSplashScreenAnimatedIcon">@drawable\/splash_mark<\/item>/);
  assert.match(launch, /<item name="android:background">@drawable\/splash<\/item>/);
  assert.ok(existsSync(path.join(RES, 'drawable/splash.xml')));
  assert.ok(existsSync(path.join(RES, 'drawable/splash_mark.xml')));
});

// Owner, 2026-10-24 ("app logo isn't proper on splash screen"): the phone's splash drew the printer without its paper
// and tray, and the page's splash fed them in while the app loaded, so a fast phone only ever showed half a logo.
test('the splash mark is the whole v3 mark: paper, printer, P and S, tray, inside the 192 dp circle', () => {
  const xml = readFileSync(path.join(RES, 'drawable/splash_mark.xml'), 'utf8');
  const mark = readFileSync('assets/brand/mark.svg', 'utf8');
  // Every drawn path of the master mark, in the master's order (the body is the rounded <rect>, drawn as a path).
  const paths = [...mark.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(paths.length, 8, 'mark.svg paths');
  let at = -1;
  for (const d of paths) {
    const k = xml.indexOf(`android:pathData="${d}"`);
    assert.ok(k > at, `splash_mark.xml draws ${d.slice(0, 24)}… in the mark's order`);
    at = k;
  }
  assert.match(xml, /android:pathData="M104 176H408A40 40 0 0 1 448 216V332/, 'the printer body');
  // Inside Android 12's icon circle (diameter 192 dp on the 288 dp canvas), strokes included.
  const g = xml.match(/translateX="([\d.]+)" android:translateY="([\d.]+)" android:scaleX="([\d.]+)"/);
  assert.ok(g, 'the mark group transform');
  const [tx, ty, s] = g.slice(1, 4).map(Number);
  for (const p of xml.matchAll(/<path([^>]*)\/>/g)) {
    const attrs = p[1];
    const d = attrs.match(/android:pathData="([^"]+)"/)?.[1] ?? '';
    const half = Number(attrs.match(/android:strokeWidth="([\d.]+)"/)?.[1] ?? 0) / 2;
    // Every point of the absolute commands the marks use (an arc: its end point; its corner stays inside its box).
    let cur = [0, 0];
    for (const [, cmd, args] of d.matchAll(/([MLHVQCAZ])([^MLHVQCAZ]*)/g)) {
      const n = args.trim()
        ? args
            .trim()
            .split(/[\s,]+/)
            .map(Number)
        : [];
      const pts = [];
      if (cmd === 'H') pts.push([n[0], cur[1]]);
      else if (cmd === 'V') pts.push([cur[0], n[0]]);
      else if (cmd === 'A') pts.push([n[5], n[6]]);
      else for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
      if (pts.length) cur = pts[pts.length - 1];
      for (const [x, y] of pts) {
        const r = Math.hypot(tx + x * s - 144, ty + y * s - 144) + half * s;
        assert.ok(r <= 96, `point ${x},${y} is ${r.toFixed(1)} dp from the centre`);
      }
    }
  }
});

// Device finding (API 35, 2026-10-24): after the phone's splash the window and the WebView showed white, then the page
// took about a second to draw, so the printer went away and came back. Now the page starts see-through over the splash
// picture (the app background with the printer at the splash's place), so the printer stays put with no waiting; once
// the page's own splash is gone (it has drawn) the page is solid again and nothing is drawn under it.
test('from the splash to Home the printer stays in place (no white or empty screen in between)', () => {
  const bg = readFileSync('src/styles/tokens.css', 'utf8')
    .match(/--bg: (#[0-9a-f]{6})/i)?.[1]
    ?.toUpperCase();
  assert.ok(bg, 'tokens.css --bg');
  assert.match(readFileSync(path.join(RES, 'values/colors.xml'), 'utf8'), new RegExp(`"splash_background">${bg}<`));
  const picture = readFileSync(path.join(RES, 'drawable/splash.xml'), 'utf8');
  assert.match(picture, /<item android:drawable="@color\/splash_background" \/>/);
  assert.match(picture, /android:drawable="@drawable\/splash_mark" android:gravity="center" android:width="288dp"/);
  // A colour, never a picture: Capacitor's SystemBars paints the window with this attribute read as a colour (a picture
  // there came out black on the device, 2026-10-24).
  const styles = readFileSync(path.join(RES, 'values/styles.xml'), 'utf8');
  const app = styles.slice(
    styles.indexOf('name="AppTheme.NoActionBar"'),
    styles.indexOf('name="AppTheme.NoActionBarLaunch"'),
  );
  assert.match(app, /<item name="android:windowBackground">@color\/splash_background<\/item>/);
  // #RRGGBBAA with alpha 00: see-through until the page paints its own opaque background (tokens.css body).
  const cap = readFileSync('capacitor.config.ts', 'utf8').match(/backgroundColor: '(#[0-9a-f]{8})'/i)?.[1];
  assert.equal(cap?.toUpperCase(), `${bg}00`, 'capacitor.config.ts backgroundColor: see-through');
  assert.match(readFileSync('src/styles/tokens.css', 'utf8'), /body \{\s*margin: 0;\s*background: var\(--bg\);/);
  const main = readFileSync('android/app/src/main/java/in/printsaathi/app/MainActivity.kt', 'utf8');
  assert.match(
    main,
    /findViewById<View>\(android\.R\.id\.content\)\?\.background = ContextCompat\.getDrawable\(this, R\.drawable\.splash\)/,
  );
  const gone = main.slice(main.indexOf('fun splashGone()'));
  assert.match(gone, /setBackgroundColor\(ContextCompat\.getColor\(this, R\.color\.splash_background\)\)/);
  assert.match(gone, /findViewById<View>\(android\.R\.id\.content\)\?\.background = null/);
  assert.match(
    readFileSync('android/app/src/main/java/in/printsaathi/app/engine/PrintEnginePlugin.kt', 'utf8'),
    /fun splashGone\(call: PluginCall\)/,
  );
  // No splash hold: the page is never kept waiting behind Android's splash (it slowed the start, device 2026-10-24).
  assert.doesNotMatch(main, /setKeepOnScreenCondition/);
});

test('no Capacitor sample splash pictures are left (they would win over the new splash)', () => {
  const left = readdirSync(RES)
    .filter((d) => d.startsWith('drawable'))
    .flatMap((d) => readdirSync(path.join(RES, d)).map((f) => `${d}/${f}`))
    .filter((f) => /splash\.png$|ic_launcher_background\.xml$/.test(f));
  assert.deepEqual(left, []);
});

test('the web app has the favicon and the brand masters are kept', () => {
  assert.ok(existsSync('public/favicon.ico'));
  assert.match(readFileSync('index.html', 'utf8'), /<link rel="icon" href="\/favicon\.ico"/);
  for (const f of ['mark.svg', 'mark-monochrome.svg', 'logo-horizontal.svg', 'app-icon.svg', 'android-foreground.svg'])
    assert.ok(existsSync(path.join('assets/brand', f)), f);
});
