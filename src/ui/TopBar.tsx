import type { ComponentChildren } from 'preact';
import { en } from '../i18n/en';
import { Icon } from './Icon';

/**
 * The same bar on every screen except Home: ‹ Back · Home, then the title (PLAN §H2.2). [aside]: a control beside the
 * title on its line (Ready's Colour | B&W, owner round 4), wrapping under it when there is no room (null while it is not ready yet).
 */
export function TopBar({
  title,
  onBack,
  onHome,
  aside,
}: {
  title: string;
  onBack: () => void;
  onHome: () => void;
  aside?: ComponentChildren;
}) {
  return (
    <header class="topbar">
      <button type="button" class="topbar-btn" onClick={onBack}>
        <Icon name="back" size="sm" />
        <span>{en.nav.back}</span>
      </button>
      {aside === undefined && <h1 class="topbar-title">{title}</h1>}
      <button type="button" class="topbar-btn" onClick={onHome}>
        <Icon name="home" size="sm" />
        <span>{en.nav.home}</span>
      </button>
      {/* After Home in the page, as it is on screen (under Back · Home): read and tabbed in that order. Present from the
          first frame (an empty aside while loading), so the title the screen reader starts on is never rebuilt. */}
      {aside !== undefined && (
        <div class="topbar-titleline">
          <h1 class="topbar-title">{title}</h1>
          {aside}
        </div>
      )}
    </header>
  );
}
