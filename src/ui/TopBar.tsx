import { en } from '../i18n/en';
import { Icon } from './Icon';

/** The same bar on every screen except Home: ‹ Back · Home, then the title (PLAN §H2.2). */
export function TopBar({ title, onBack, onHome }: { title: string; onBack: () => void; onHome: () => void }) {
  return (
    <header class="topbar">
      <button type="button" class="topbar-btn" onClick={onBack}>
        <Icon name="back" size="sm" />
        <span>{en.nav.back}</span>
      </button>
      <h1 class="topbar-title">{title}</h1>
      <button type="button" class="topbar-btn" onClick={onHome}>
        <Icon name="home" size="sm" />
        <span>{en.nav.home}</span>
      </button>
    </header>
  );
}
