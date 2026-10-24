// Spike (d) fixtures: password-protected PDFs like e-Aadhaar (synthetic content, no personal data).
//   owner-only.pdf   empty user password + owner password (opens without asking; common for bank/govt files)
//   user-aes256.pdf  user password RAMA1965, AES-256 (revision 6)
//   user-aes128.pdf  user password RAMA1965, AES-128
//   user-rc4.pdf     user password RAMA1965, RC4 128 (legacy)
//   decrypted-*.pdf  what ADR-002 option (i) hands the engine: @cantoo/pdf-lib opens each user-password file with
//                    RAMA1965 and saves it unencrypted; old phones' classic PdfRenderer must open these
// Each page: a 50 mm black square at (20 mm, 20 mm) so a renderer's output can be checked.
// Usage: node tests/generate/make-locked-pdfs.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';

export const USER_PASSWORD = 'RAMA1965';
const MM = 72 / 25.4;

async function make(name, encryption) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([210 * MM, 297 * MM]);
  page.drawRectangle({ x: 20 * MM, y: (297 - 70) * MM, width: 50 * MM, height: 50 * MM, color: rgb(0, 0, 0) });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(`PrintSaathi locked-PDF test: ${name}`, { x: 20 * MM, y: 200 * MM, size: 14, font });
  doc.encrypt({ ownerPassword: 'owner-Only-9', permissions: { printing: 'highResolution' }, ...encryption });
  return doc.save({ useObjectStreams: false });
}

export async function makeAll(outDir = 'tests/fixtures/pdf') {
  mkdirSync(outDir, { recursive: true });
  const specs = {
    'owner-only.pdf': { userPassword: '' },
    'user-aes256.pdf': { userPassword: USER_PASSWORD, algorithm: 'AES-256' },
    'user-aes128.pdf': { userPassword: USER_PASSWORD, algorithm: 'AES-128' },
    'user-rc4.pdf': { userPassword: USER_PASSWORD, algorithm: 'RC4-128', allowWeakCryptography: true },
  };
  for (const [name, enc] of Object.entries(specs)) {
    const bytes = await make(name, enc);
    writeFileSync(path.join(outDir, name), bytes);
    console.log(`${name}: ${bytes.length} bytes`);
    if (enc.userPassword) {
      const plain = await (await PDFDocument.load(bytes, { password: USER_PASSWORD })).save();
      const out = name.replace('user-', 'decrypted-');
      writeFileSync(path.join(outDir, out), plain);
      console.log(`${out}: ${plain.length} bytes`);
    }
  }
}

if (process.argv[1]?.endsWith('make-locked-pdfs.mjs')) await makeAll(process.argv[2]);
