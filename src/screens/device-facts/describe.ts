import type { PdfUnlockTier } from '../../native/printEngine';

const LOCKED = 'This phone can open locked PDFs (like e-Aadhaar) by itself:';

export function describeUnlockTier(tier: PdfUnlockTier): string {
  return tier === 'NONE' ? `${LOCKED} No — PrintSaathi will need its own helper` : `${LOCKED} Yes`;
}

export const formatRam = (mb: number): string => `${(mb / 1024).toFixed(1)} GB`;

/** Android 11+ reports a system update (SDK extension) level; older phones report nothing. */
export const formatExtensionLevel = (level: number | null | undefined): string =>
  level === null || level === undefined ? 'Not available' : String(level);
