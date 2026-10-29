/**
 * Round 10 (some pages in colour, some in black & white): the words of the page colour switch and the page chooser. They
 * load with those parts, not at start (startup JS budget, PLAN §C); the jargon and plain-wording checks read them too.
 */
export const colourWords = {
  /** The switch under each page's picture, named for screen readers. */
  pageSwitch: 'Colour of page {n}',
  colour: 'Colour',
  bw: 'Black & white',
  choose: 'Choose pages in colour',
  chooseSome: '{n} in colour, {m} black & white: change',
  /** Change's Colour row for a job whose pages have colours of their own. */
  some: 'Some in colour',
  title: 'Which pages in colour?',
  tap: 'Tap a page to change it.',
  looking: 'Looking at the pages…',
  allColour: 'All colour',
  allBw: 'All black & white',
  done: 'Done',
  page: 'Page {n}',
  saveFailed: "Couldn't save that. Try again.",
} as const;
