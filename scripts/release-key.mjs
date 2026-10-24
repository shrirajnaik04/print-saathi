// Makes PrintSaathi's release signing key once, outside the repo (PLAN §Q "Release integrity", Risk 11).
// Every update on the shopkeeper's phone must be signed with this same key, so it is never replaced, and once a release exists
// (its certificate fingerprint is pinned in android/release-cert.sha256) a new PC restores the backed-up key folder
// instead of making another (Phase 12 review C1). Usage: node scripts/release-key.mjs [--new-key-i-understand]
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAndroidEnv } from './android-env.mjs';

const ALIAS = 'printsaathi';
const STORE = 'printsaathi-release.jks';
export const PINNED_CERT = 'android/release-cert.sha256';

/** Where the signing details are: PRINTSAATHI_SIGNING (a full path), else <user folder>\.printsaathi\signing.properties. */
export function signingPropertiesPath(env) {
  if (env.PRINTSAATHI_SIGNING) {
    if (!path.win32.isAbsolute(env.PRINTSAATHI_SIGNING) && !path.posix.isAbsolute(env.PRINTSAATHI_SIGNING))
      throw new Error(
        'PRINTSAATHI_SIGNING must be a full path outside the project (e.g. D:\\keys\\signing.properties).',
      );
    return env.PRINTSAATHI_SIGNING;
  }
  if (!env.USERPROFILE)
    throw new Error('USERPROFILE is not set: set PRINTSAATHI_SIGNING to the signing.properties path.');
  return path.win32.join(env.USERPROFILE, '.printsaathi', 'signing.properties');
}

/** key=value lines (the same format Gradle's Properties reads); # comments ignored. */
export function parseSigningProperties(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const RESTORE =
  'Restore the key folder from your backup into this place (the whole folder: signing.properties and the .jks).';

/** Makes the key and its properties unless either exists, or a released key is pinned. Side effects passed in. */
export function ensureReleaseKey({
  propsPath,
  exists,
  pinned,
  allowNewKey,
  runKeytool,
  write,
  remove,
  mkdir,
  randomPassword,
}) {
  const dir = path.win32.dirname(propsPath);
  const store = path.win32.join(dir, STORE);
  if (exists(propsPath)) return { created: false, message: `The release key is already set up: ${propsPath}` };
  if (exists(store))
    return { created: false, message: `A keystore is at ${store} but its signing.properties is missing. ${RESTORE}` };
  if (pinned && !allowNewKey)
    return {
      created: false,
      message: `PrintSaathi was already released with a key, and the shopkeeper's phone only accepts updates signed with it. ${RESTORE} Expected at: ${dir}. Do not uninstall the app on the shopkeeper's phone.`,
    };
  mkdir(dir);
  const password = randomPassword();
  // The properties first, with the password: if keytool then fails they are removed, so no key is ever orphaned.
  write(
    propsPath,
    [
      '# PrintSaathi release signing — keep this folder backed up; never put it in the repo.',
      `storeFile=${STORE}`, // next to this file: the folder works on any PC
      `storePassword=${password}`,
      `keyAlias=${ALIAS}`,
      `keyPassword=${password}`,
      '',
    ].join('\n'),
  );
  try {
    runKeytool(
      [
        '-genkeypair',
        '-keystore',
        store,
        '-storetype',
        'PKCS12',
        '-alias',
        ALIAS,
        '-keyalg',
        'RSA',
        '-keysize',
        '4096',
        '-validity',
        '10950',
        '-storepass:env',
        'PRINTSAATHI_KEY_PASS',
        '-keypass:env',
        'PRINTSAATHI_KEY_PASS',
        '-dname',
        'CN=PrintSaathi, O=PrintSaathi shop',
      ],
      { PRINTSAATHI_KEY_PASS: password }, // never on the command line (review M2)
    );
  } catch (e) {
    remove(propsPath);
    throw e;
  }
  return {
    created: true,
    message: `Release key made in ${dir}. Back up this whole folder now. The first \`npm run android:release\` then shows its fingerprint to save in ${PINNED_CERT}.`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = resolveAndroidEnv(process.env);
  const keytool = path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');
  const r = ensureReleaseKey({
    propsPath: signingPropertiesPath(process.env),
    exists: existsSync,
    pinned: existsSync(PINNED_CERT),
    allowNewKey: process.argv.includes('--new-key-i-understand'),
    mkdir: (d) => mkdirSync(d, { recursive: true }),
    write: (p, text) => writeFileSync(p, text, { flag: 'wx' }), // never over an existing file
    remove: (p) => rmSync(p, { force: true }),
    randomPassword: () => randomBytes(24).toString('base64url'),
    runKeytool: (args, extraEnv) => {
      const k = spawnSync(keytool, args, {
        stdio: ['ignore', 'ignore', 'inherit'],
        env: { ...process.env, ...extraEnv },
      });
      if (k.status !== 0) throw new Error('keytool failed: no key was made.');
    },
  });
  console.log(r.message);
  if (!r.created && !existsSync(signingPropertiesPath(process.env))) process.exit(1);
}
