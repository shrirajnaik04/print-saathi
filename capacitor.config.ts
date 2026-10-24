import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.printsaathi.app',
  appName: 'PrintSaathi',
  webDir: 'dist',
  // Capacitor's own debug logging prints plugin results and local file paths; customer-file paths
  // must never reach logcat, even in debug builds (PLAN §Q).
  loggingBehavior: 'none',
  // See-through (#RRGGBBAA, alpha 00) until the page draws its own background (tokens.css body): the window's splash
  // picture shows meanwhile, so the printer never leaves the screen at start (device check 2026-10-24).
  backgroundColor: '#f3f4f600',
  plugins: {
    SystemBars: { insetsHandling: 'css' },
  },
};

export default config;
