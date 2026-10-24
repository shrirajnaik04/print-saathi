import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [preact()],
  build: {
    // Oldest Android System WebView we support (PLAN §D6 WebView gate).
    target: 'chrome92',
    outDir: 'dist',
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Time limits catch hangs, not slowness (speed is measured on devices). This PC also runs emulators and Gradle:
    // heavy property and decryption tests took 5 s+ there that take 0.2–2.5 s alone (Phase 11/12 rulings).
    testTimeout: 20_000,
  },
});
