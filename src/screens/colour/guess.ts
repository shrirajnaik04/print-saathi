import { colourShare, hasColour } from '../../core/colour/chroma';

/** One printed picture: its page key ("item:page", a photo is "item:0") and where its colour picture can be read from. */
export type Source = { key: string; src?: string };

const SIDE = 128;

/** The colour share of the picture at [src] (a small copy is read in this page); null when it cannot be read. */
async function shareOf(src: string): Promise<number | null> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const k = Math.min(1, SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#fff'; // a see-through page is white paper
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return colourShare(ctx.getImageData(0, 0, w, h).data);
  } catch {
    return null;
  }
}

/**
 * The first guess of "Some in colour" (round 10): pages with colour in them stay Colour, the rest start as Black &
 * white. A picture that cannot be read keeps its page in colour: nothing is ever greyed without evidence.
 */
export async function guessMarks(sources: Source[]): Promise<Record<string, 'colour' | 'bw'>> {
  const marks: Record<string, 'colour' | 'bw'> = {};
  for (const s of sources) {
    const share = s.src ? await shareOf(s.src) : null;
    marks[s.key] = share === null || hasColour(share) ? 'colour' : 'bw';
  }
  return marks;
}
