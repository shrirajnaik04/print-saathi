import { type IntakeFile, PHOTO_TYPES } from '../../native/printEngine';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function summariseIntake(files: IntakeFile[], rejected: number): string {
  const photos = files.filter((f) => PHOTO_TYPES.has(f.sniffedType)).length;
  const pdfs = files.filter((f) => f.sniffedType === 'pdf').length;
  const unusable = files.length - photos - pdfs + rejected;
  const total = files.length + rejected;
  const parts = [photos && plural(photos, 'photo', 'photos'), pdfs && plural(pdfs, 'PDF', 'PDFs')].filter(Boolean);
  let s = `${plural(total, 'file', 'files')} received: ${parts.join(' and ') || 'nothing printable'}`;
  if (unusable > 0) {
    s += `. ${plural(unusable, 'file', 'files')} can’t be printed yet — ask the customer to send ${unusable === 1 ? 'it' : 'them'} as a PDF or photo.`;
  }
  return s;
}
