import type { ComponentChildren } from 'preact';
import { ownBox } from '../core/layout/tilt';
import type { Placement } from '../core/plan/plan';

type Props = {
  /** Page size in points as it is seen (a sideways page is passed wide). */
  wPt: number;
  hPt: number;
  placements: Placement[];
  /** Where to show each photo or PDF page from (displayable URL); a missing one leaves its box grey. */
  srcOf: (itemIndex: number, pdfPage?: number) => string | undefined;
  /** Screen-reader name of the whole sheet, e.g. "Page 2 of 3, sideways page". */
  label: string;
  /** Small sheet for choice cards. */
  mini?: boolean;
  /** Black & white: the photos are drawn grey, as they will print. */
  grey?: boolean;
  /** Drawn over the sheet (Adjust: the chosen photo's outline and corner). */
  children?: ComponentChildren;
  /** A picture per placement instead of per item (ID cards: two straightened cards may come from one photo). */
  srcOfPlacement?: (p: Placement) => string | undefined;
};

/** A photo turned by [turns] quarter turns clockwise fills its box: the image is rotated about the box centre. */
export function turnedStyle(turns: number, w: number, h: number) {
  const odd = turns % 2 === 1;
  return {
    width: odd ? `${(100 * h) / w}%` : '100%',
    height: odd ? `${(100 * w) / h}%` : '100%',
    transform: `translate(-50%, -50%) rotate(${turns * 90}deg)`,
  };
}

/**
 * One sheet of paper drawn from the plan's own geometry (PLAN §G7: the same numbers the print file uses), shown
 * upright: a sideways page is displayed wide, never as a turned portrait (the caller labels it; a badge drawn on
 * the sheet hid the photo at 200 % text).
 */
export function PaperPreview({ wPt, hPt, placements, srcOf, label, mini, grey, children, srcOfPlacement }: Props) {
  const pct = (v: number, of: number) => `${(100 * v) / of}%`;
  // Round 10: a photo whose own style is black & white is drawn grey, beside photos in colour (review I4).
  const greyOwn = (p: { style: string }) =>
    p.style === 'bw' || p.style === 'sharp' || p.style === 'ocv' ? ' paper-photo-grey' : '';
  return (
    <figure
      class={`paper${wPt > hPt ? ' paper-wide' : ''}${mini ? ' paper-mini' : ''}${grey ? ' paper-grey' : ''}`}
      style={{ aspectRatio: `${wPt} / ${hPt}` }}
      aria-label={label}
    >
      {placements.map((p, i) => {
        const src = srcOfPlacement ? srcOfPlacement(p) : srcOf(p.itemIndex, p.pdfPage);
        // Turned to any angle (owner, round 3): drawn at its own size, turned about its outline's centre, as it prints.
        const box = ownBox(p);
        const style = {
          left: pct(box.x, wPt),
          top: pct(box.y, hPt),
          width: pct(box.w, wPt),
          height: pct(box.h, hPt),
          ...(p.tilt ? { transform: `rotate(${p.tilt.deg}deg)` } : {}),
        };
        const full = p.crop.x === 0 && p.crop.y === 0 && p.crop.w === 1 && p.crop.h === 1;
        if (src && !full) {
          // The whole photo as shown, scaled and shifted so only the cropped part fills the box (passport frame).
          const sw = box.w / p.crop.w;
          const sh = box.h / p.crop.h;
          return (
            <span key={`${i}-${p.itemIndex}`} class={`paper-photo paper-crop${greyOwn(p)}`} style={style}>
              <span
                class="paper-photo paper-turned"
                style={{
                  left: `${(-100 * p.crop.x) / p.crop.w}%`,
                  top: `${(-100 * p.crop.y) / p.crop.h}%`,
                  width: `${100 / p.crop.w}%`,
                  height: `${100 / p.crop.h}%`,
                }}
              >
                <img src={src} alt="" style={turnedStyle(p.turns, sw, sh)} />
              </span>
            </span>
          );
        }
        if (src && p.turns)
          return (
            <span key={`${i}-${p.itemIndex}`} class={`paper-photo paper-turned${greyOwn(p)}`} style={style}>
              <img src={src} alt="" style={turnedStyle(p.turns, box.w, box.h)} />
            </span>
          );
        return src ? (
          <img key={`${i}-${p.itemIndex}`} class={`paper-photo${greyOwn(p)}`} src={src} alt="" style={style} />
        ) : (
          <span key={`${i}-${p.itemIndex}`} class="paper-photo paper-empty" style={style} />
        );
      })}
      {placements.some((p) => p.border) && (
        <svg class="paper-lines" viewBox={`0 0 ${wPt} ${hPt}`} preserveAspectRatio="none" aria-hidden="true">
          {placements.map((p, i) =>
            p.border ? (
              <rect
                key={`b${i}`}
                class="paper-border"
                x={p.box.x + p.border / 2}
                y={p.box.y + p.border / 2}
                width={p.box.w - p.border}
                height={p.box.h - p.border}
                stroke-width={p.border}
              />
            ) : null,
          )}
        </svg>
      )}
      {children}
    </figure>
  );
}

/**
 * One page of the real print file (PLAN §G7.3), as the engine rendered it. The file's pages are always portrait; a
 * sideways page's image is turned a quarter clockwise for display only, so it reads upright (PLAN §G7.6).
 */
export function FilePage({
  src,
  wide,
  label,
  paper = { wPt: 595.2755905511812, hPt: 841.8897637795275 },
}: {
  src: string;
  wide: boolean;
  label: string;
  /** The print file's paper (A4, or 4×6 photo paper): the page image has its shape (gate M2). */
  paper?: { wPt: number; hPt: number };
}) {
  const [w, h] = wide ? [paper.hPt, paper.wPt] : [paper.wPt, paper.hPt];
  return (
    <figure class={`paper${wide ? ' paper-wide' : ''}`} style={{ aspectRatio: `${w} / ${h}` }} aria-label={label}>
      <span class="paper-photo paper-turned file-page" style={{ left: 0, top: 0, width: '100%', height: '100%' }}>
        <img src={src} alt="" loading="lazy" style={wide ? turnedStyle(1, w, h) : turnedStyle(0, w, h)} />
      </span>
    </figure>
  );
}
