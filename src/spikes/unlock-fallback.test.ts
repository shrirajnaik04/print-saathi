import { readFileSync } from 'node:fs';
import { PDFDocument } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';

// Spike (d), ADR-002 option (i): can @cantoo/pdf-lib decrypt every e-Aadhaar-like encryption and hand back an
// unencrypted file? pdf.js (independent parser) checks both the fixtures and the decrypted copies.
const DIR = 'tests/fixtures/pdf';
const USER = ['user-aes256.pdf', 'user-aes128.pdf', 'user-rc4.pdf'];
const read = (n: string) => new Uint8Array(readFileSync(`${DIR}/${n}`));

async function pdfjsPages(data: Uint8Array, password?: string) {
  const task = getDocument({ data: data.slice(), password, verbosity: 0 });
  try {
    return (await task.promise).numPages;
  } finally {
    await task.destroy();
  }
}

describe('locked-PDF fixtures (independently checked with pdf.js)', () => {
  it('owner-only PDF opens without a password', async () => {
    expect(await pdfjsPages(read('owner-only.pdf'))).toBe(1);
  });

  it.each(USER)('%s needs the user password', async (n) => {
    await expect(pdfjsPages(read(n))).rejects.toMatchObject({ name: 'PasswordException' });
    expect(await pdfjsPages(read(n), 'RAMA1965')).toBe(1);
  });
});

describe('@cantoo/pdf-lib fallback decryption', () => {
  it('opens the owner-only PDF with an empty password', async () => {
    const doc = await PDFDocument.load(read('owner-only.pdf'), { password: '' });
    expect(doc.getPageCount()).toBe(1);
  });

  it.each(USER)('%s: right password gives an unencrypted copy that opens with no password', async (n) => {
    const doc = await PDFDocument.load(read(n), { password: 'RAMA1965' });
    const plain = await doc.save();
    expect((await PDFDocument.load(plain)).isEncrypted).toBe(false);
    expect(await pdfjsPages(plain)).toBe(1);
  });

  it.each(USER)('%s: wrong password is refused', async (n) => {
    await expect(PDFDocument.load(read(n), { password: 'WRONG1234' })).rejects.toThrow();
  });
});
