// Runs Gradle with JAVA_HOME/ANDROID_HOME resolved per call, so no machine-wide env changes are needed.
// Usage: node scripts/android-env.mjs <gradle args...>
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STUDIO_JBR = String.raw`C:\Program Files\Android\Android Studio\jbr`;

export function resolveAndroidEnv(env, exists = existsSync) {
  const java = [env.JAVA_HOME, STUDIO_JBR].find((p) => p && exists(p));
  if (!java) throw new Error('No JDK found: set JAVA_HOME or install Android Studio (bundled JBR, JDK 21).');
  const defaultSdk = env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, 'Android', 'Sdk') : undefined;
  const sdk = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, defaultSdk].find((p) => p && exists(p));
  if (!sdk) throw new Error('No Android SDK found: set ANDROID_HOME or install the SDK via Android Studio.');
  return { JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const resolved = resolveAndroidEnv(process.env);
  const androidDir = path.resolve('android');
  // Absolute path: cmd.exe may not search the current directory (NoDefaultCurrentDirectoryInExePath).
  const gradlew = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  const r = spawnSync(`"${gradlew}"`, process.argv.slice(2), {
    cwd: androidDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...resolved },
  });
  process.exit(r.status ?? 1);
}
