import { en } from './en';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function clock(d: Date): string {
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "Today 9:05 am", "Yesterday 6:30 pm" or "28 Sep" (phone's local time). */
export function whenText(ms: number, nowMs: number): string {
  const d = new Date(ms);
  const n = new Date(nowMs);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, n)) return `${en.recent.today} ${clock(d)}`;
  if (sameDay(d, new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1))) return `${en.recent.yesterday} ${clock(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
