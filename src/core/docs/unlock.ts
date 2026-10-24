/**
 * ADR-002 option (i), the one bounded bridge exception (PLAN §G5): on phones whose built-in engine cannot open locked
 * PDFs, the WebView unlocks the file with @cantoo/pdf-lib (loaded only here) and sends the unlocked copy to the app in
 * chunks. The password stays in memory; the copy is at most 20 MB and is deleted after printing.
 */
export const MAX_UNLOCKED = 20 * 1024 * 1024;
export const CHUNK = 256 * 1024;

export type UnlockResult =
  | { state: 'ok'; bytes: Uint8Array }
  | { state: 'wrong' | 'unsupported' | 'damaged' | 'tooBig' };

export async function unlockPdf(file: Uint8Array, password: string, max = MAX_UNLOCKED): Promise<UnlockResult> {
  const { PDFDocument } = await import('@cantoo/pdf-lib');
  let doc: Awaited<ReturnType<typeof PDFDocument.load>>;
  try {
    doc = await PDFDocument.load(file, { password, ignoreEncryption: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : '';
    // A lock pdf-lib does not know is no password problem: asking again would never work (review M6).
    if (msg.includes('unsupported encryption') || msg.includes('unknown encryption')) return { state: 'unsupported' };
    return { state: msg.includes('password') || msg.includes('encrypt') ? 'wrong' : 'damaged' };
  }
  let bytes: Uint8Array;
  try {
    bytes = await doc.save();
  } catch {
    return { state: 'damaged' };
  }
  return bytes.length > max ? { state: 'tooBig' } : { state: 'ok', bytes };
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Sends [bytes] in order, ≤ 256 KB a chunk; false at the first refused chunk (the app keeps nothing). */
export async function sendUnlocked(
  write: (o: { offset: number; data: string; last: boolean }) => Promise<{ ok: boolean }>,
  bytes: Uint8Array,
): Promise<boolean> {
  for (let offset = 0; offset < bytes.length || offset === 0; offset += CHUNK) {
    const end = Math.min(bytes.length, offset + CHUNK);
    const r = await write({ offset, data: base64(bytes.subarray(offset, end)), last: end >= bytes.length });
    if (!r.ok) return false;
    if (end >= bytes.length) break;
  }
  return true;
}
