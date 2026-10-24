/** Puts values into a catalogue string: fill('Page {n} of {total}', { n: 1, total: 3 }) -> 'Page 1 of 3'. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? String(values[key]) : m));
}
