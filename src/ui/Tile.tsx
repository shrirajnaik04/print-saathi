import { Icon } from './Icon';
import type { IconName } from './icons';

/** The four jobs on Home have their own badge colour (Office look); other tiles use the neutral one. */
export type TileTone = 'photos' | 'passport' | 'cards' | 'documents';

/** A big choice: icon in a badge + title + optional helper line; the whole tile is one button (≥ 88 dp). */
export function Tile({
  icon,
  title,
  helper,
  onClick,
  image,
  tone,
}: {
  icon: IconName;
  title: string;
  helper?: string;
  onClick: () => void;
  /** A picture instead of the icon (Recent jobs: the job's first photo). Decorative: the title says what it is. */
  image?: string;
  tone?: TileTone;
}) {
  return (
    <button type="button" class="tile" onClick={onClick}>
      {image ? (
        <img class="tile-image" src={image} alt="" />
      ) : (
        <span class={`badge badge-${tone ?? 'neutral'}`}>
          <Icon name={icon} size="lg" />
        </span>
      )}
      <span class="tile-text">
        <span class="tile-title">{title}</span>
        {helper && <span class="tile-helper">{helper}</span>}
      </span>
    </button>
  );
}
