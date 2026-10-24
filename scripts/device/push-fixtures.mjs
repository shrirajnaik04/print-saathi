// Pushes large generated fixtures into the DEBUG app's private files dir (run-as), for device tests.
// Usage: node scripts/device/push-fixtures.mjs <serial> [file ...]  (default: tests/fixtures-large/108mp.jpg)
import path from 'node:path';
import { adb } from './adb.mjs';

const [serial, ...files] = process.argv.slice(2);
const list = files.length ? files : ['tests/fixtures-large/108mp.jpg'];
for (const f of list) {
  const name = path.basename(f);
  adb(serial, ['push', f, `/data/local/tmp/${name}`]);
  adb(serial, ['shell', 'run-as', 'in.printsaathi.app', 'mkdir', '-p', 'files/test-fixtures']);
  adb(serial, [
    'shell',
    'run-as',
    'in.printsaathi.app',
    'cp',
    `/data/local/tmp/${name}`,
    `files/test-fixtures/${name}`,
  ]);
  adb(serial, ['shell', 'rm', `/data/local/tmp/${name}`]);
  console.log(`pushed ${name}`);
}
