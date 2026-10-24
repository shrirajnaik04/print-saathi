import type { PrintPlan } from './plan';

/** PLAN §D4: big jobs go to the printer in parts, so a small phone's print queue never holds a huge file. */
export const MAX_SHEETS_PER_PART = 40;

/**
 * The plan as it goes to the printer, part by part. A job of up to [maxSheets] printed sheets is one part: the very
 * same plan, so its print file and preview are reused. A bigger job is cut into runs of the printed sheets in order
 * (collated copies: all pages of copy 1, then copy 2, …); each part is a plan of those sheets with copies 1, and the
 * engine encodes a repeated page only once.
 */
export function splitParts(plan: PrintPlan, maxSheets = MAX_SHEETS_PER_PART): PrintPlan[] {
  // The customer's own file goes as it is (PLAN §G4): never cut, or it would no longer be untouched.
  if (plan.exact || plan.pages.length * plan.copies <= maxSheets) return [plan];
  const sheets = Array.from({ length: plan.copies }, () => plan.pages).flat();
  const parts: PrintPlan[] = [];
  for (let i = 0; i < sheets.length; i += maxSheets)
    parts.push({ ...plan, copies: 1, pages: sheets.slice(i, i + maxSheets) });
  return parts;
}
