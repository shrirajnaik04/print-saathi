import { render } from 'preact';
import { App, preloadScreensSoon } from './app';
import { applyTextScale } from './core/textScale';
import { PrintEngine } from './native/printEngine';
// Bundled (OFL-1.1), Latin subset, regular + bold: no network font loading (PLAN §C, §H1).
import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import './styles/tokens.css';
import './styles/ui.css';

const root = document.getElementById('app');
// The splash (index.html) plays while this code loads and goes the moment the first screen is up: it never holds Home
// back (release cold starts, 2026-10-24: waiting for its animation made Home 1.4 s later). None with "Remove animations"
// on; test builds show it only when asked (?splash=1). Once it is gone the page has drawn, so the phone stops drawing
// its splash picture under the page (MainActivity, device check 2026-10-24), and the other screens start loading.
const splash = document.getElementById('splash');
if (
  splash &&
  (matchMedia('(prefers-reduced-motion: reduce)').matches ||
    (import.meta.env.MODE === 'e2e' && !new URLSearchParams(location.search).has('splash')))
)
  splash.remove();
const firstScreenUp = () =>
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const done = () => {
        void PrintEngine.splashGone().catch(() => {});
        preloadScreensSoon();
      };
      if (!splash?.isConnected) return done();
      splash.classList.add('splash-out');
      setTimeout(() => {
        splash.remove();
        done();
      }, 200);
    }),
  );
// Text size follows the phone's setting (100–200 %) before the first screen draws (PLAN §D6).
PrintEngine.getFontScale()
  .then(({ fontScale }) => applyTextScale(fontScale))
  .catch(() => applyTextScale(1))
  .finally(() => {
    if (root) render(<App />, root);
    firstScreenUp();
  });
// Changing the phone's text size while the app is open applies at once, keeping the current screen.
void PrintEngine.addListener('fontScaleChanged', ({ fontScale }) => applyTextScale(fontScale));
