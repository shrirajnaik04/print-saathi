import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { en } from '../i18n/en';
import type { ScreenProps } from '../screens/types';
import { Panel } from './Panel';

type Screen = (p: ScreenProps) => preact.JSX.Element;

/**
 * A screen off the start path (startup JS budget, PLAN §C): its code loads the first time it opens, or earlier with
 * preload(). Until then an empty screen, marked busy; a failed load says so with Try again. The same hooks run on
 * every render, before and after the code arrives. Code that arrives after the screen opened still puts the screen
 * reader on the title (focus-on-route-change), unless the shopkeeper already moved on.
 */
export function lazyScreen(load: () => Promise<Screen>): Screen & { preload: () => Promise<void> } {
  let screen: Screen | undefined;
  let loading: Promise<void> | undefined;
  const start = () => {
    loading ??= load().then(
      (s) => {
        screen = s;
      },
      (e) => {
        loading = undefined; // the next try loads again
        throw e;
      },
    );
    return loading;
  };
  function Lazy(props: ScreenProps) {
    const [, setLoaded] = useState(0);
    const [failed, setFailed] = useState(false);
    const late = useRef(!screen);
    useLayoutEffect(() => {
      if (!screen || !late.current) return;
      late.current = false;
      if (document.activeElement && document.activeElement !== document.body) return;
      const h1 = document.querySelector<HTMLElement>('main h1');
      if (h1) {
        h1.tabIndex = -1;
        h1.focus({ preventScroll: true });
      }
    });
    useEffect(() => {
      if (screen || failed) return;
      let live = true;
      start().then(
        () => live && setLoaded((n) => n + 1),
        () => live && setFailed(true),
      );
      return () => {
        live = false;
      };
    }, [failed]);
    if (screen) {
      const S = screen;
      return <S {...props} />;
    }
    if (failed)
      return (
        <main class="screen">
          <Panel
            kind="error"
            title={en.ui.openFailed}
            action={{ label: en.ui.tryAgain, onClick: () => setFailed(false) }}
          />
        </main>
      );
    return <main class="screen" aria-busy="true" />;
  }
  return Object.assign(Lazy, { preload: start });
}
