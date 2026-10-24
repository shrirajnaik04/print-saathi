import type { JobItem } from './job';

/** What PrintSaathi can print: PDFs and photos (PLAN §K1). iPhone photos (HEIC) wait for ADR-003. */
const PRINTABLE = new Set(['pdf', 'jpeg', 'png', 'webp', 'gif', 'bmp']);

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/**
 * One plain-English line per kind of file that cannot be printed, with what to do (PLAN §J8: never a silent loss).
 * Shown on Ready for document and mixed jobs, which skip Received.
 */
export function unprintableNotes(items: readonly JobItem[]): string[] {
  const count = (type: string) => items.filter((i) => i.type === type).length;
  const office = count('office');
  const video = count('video');
  const heif = count('heif');
  const other = items.filter((i) => !PRINTABLE.has(i.type) && !['office', 'video', 'heif'].includes(i.type)).length;
  const out: string[] = [];
  if (office)
    out.push(
      `${n(office, 'Office file', 'Office files')} (Word, Excel or PowerPoint) can't be printed yet. Ask the customer to send ${office === 1 ? 'it' : 'them'} as a PDF.`,
    );
  if (video) out.push(`${n(video, 'video', 'videos')} can't be printed.`);
  if (heif)
    out.push(
      `${n(heif, 'iPhone photo', 'iPhone photos')} can't be printed yet. Ask the customer to send ${heif === 1 ? 'it' : 'them'} from WhatsApp as a photo, not as a document.`,
    );
  if (other)
    out.push(
      `${n(other, 'file', 'files')} can't be printed. Ask the customer to send ${other === 1 ? 'it' : 'them'} as a PDF or a photo.`,
    );
  return out;
}

/** The short note under one such file on Received. */
export function unprintableText(type: string): string {
  if (type === 'office') return "Office file: can't be printed yet. Ask for a PDF.";
  if (type === 'video') return "A video: can't be printed.";
  return "This file can't be printed. Ask for a PDF or a photo.";
}
