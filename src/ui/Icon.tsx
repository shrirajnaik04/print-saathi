import { ICONS, type IconName } from './icons';

/**
 * A decorative icon: it always sits next to visible text, so it is hidden from screen readers (the text is the
 * name). Sizes are CSS classes in rem (no inline styles under the CSP), so icons grow with the app's text size.
 */
export function Icon({ name, size = 'md' }: { name: IconName; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      class={`icon icon-${size}`}
      aria-hidden="true"
      // Safe: the markup is one of our own SVG files, bundled at build time from @phosphor-icons/core (never user data).
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
