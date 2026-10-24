import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { CHUNK, MAX_UNLOCKED, sendUnlocked, unlockPdf } from './unlock';

// ADR-002 option (i) on phones with no built-in unlock: the WebView unlocks the PDF and sends it in chunks.
const read = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/pdf/${n}`));

describe('unlocking a PDF in the app (phones with no built-in unlock)', () => {
  it.each(['user-aes256.pdf', 'user-aes128.pdf', 'user-rc4.pdf'])(
    '%s: the right password gives a copy that opens with no password',
    async (n) => {
      const r = await unlockPdf(read(n), 'RAMA1965');
      expect(r.state).toBe('ok');
      const task = getDocument({ data: (r as { bytes: Uint8Array }).bytes.slice(), verbosity: 0 });
      expect((await task.promise).numPages).toBe(1);
      await task.destroy();
    },
  );

  it('a wrong or empty password is "wrong", never a copy', async () => {
    expect((await unlockPdf(read('user-aes256.pdf'), 'RAMA1966')).state).toBe('wrong');
    expect((await unlockPdf(read('user-aes256.pdf'), '')).state).toBe('wrong');
  });

  it('a lock this app cannot open is "unsupported", never "wrong password" (review M6)', async () => {
    const rc4 = Buffer.from(read('user-rc4.pdf')).toString('latin1');
    for (const [from, to] of [
      ['/V 2', '/V 9'],
      ['/Filter /Standard', '/Filter /Foo_____'],
    ] as const) {
      const odd = new Uint8Array(Buffer.from(rc4.replace(from, to), 'latin1'));
      expect((await unlockPdf(odd, 'RAMA1965')).state, to).toBe('unsupported');
    }
  });

  it('a damaged file is "damaged"', async () => {
    expect((await unlockPdf(new TextEncoder().encode('%PDF-1.7 not really'), 'RAMA1965')).state).toBe('damaged');
  });

  it('an unlocked copy over 20 MB is refused (PLAN §G5)', async () => {
    expect(MAX_UNLOCKED).toBe(20 * 1024 * 1024);
    expect((await unlockPdf(read('user-aes256.pdf'), 'RAMA1965', 100)).state).toBe('tooBig');
  });
});

describe('sending the unlocked copy (≤ 256 KB chunks, in order)', () => {
  it('splits into chunks with offsets and marks the last; stops at the first refusal', async () => {
    const sent: { offset: number; size: number; last: boolean }[] = [];
    const write = async (o: { offset: number; data: string; last: boolean }) => {
      sent.push({ offset: o.offset, size: atob(o.data).length, last: o.last });
      return { ok: true };
    };
    const bytes = new Uint8Array(CHUNK * 2 + 10).map((_, i) => i % 251);
    expect(await sendUnlocked(write, bytes)).toBe(true);
    expect(sent).toEqual([
      { offset: 0, size: CHUNK, last: false },
      { offset: CHUNK, size: CHUNK, last: false },
      { offset: CHUNK * 2, size: 10, last: true },
    ]);
    let calls = 0;
    expect(await sendUnlocked(async () => ({ ok: ++calls < 2 }), bytes)).toBe(false);
    expect(calls).toBe(2);
  });
});
