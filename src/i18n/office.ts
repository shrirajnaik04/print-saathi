/**
 * Round 9: the words of the Office card (Word, PowerPoint, Excel files). They load with the card, not at start (startup
 * JS budget, PLAN §C); the jargon and plain-wording checks read them with the rest.
 */
export const officeWords = {
  prints: {
    word: 'This Word file prints from WPS Office.',
    powerpoint: 'This PowerPoint file prints from WPS Office.',
    excel: 'This Excel file prints from WPS Office.',
    office: 'This Office file prints from WPS Office.',
  },
  made: {
    word: 'Made from a Word file. Check the preview — it may look a little different from Word.',
    powerpoint: 'Made from a PowerPoint file. Check the preview — it may look a little different from PowerPoint.',
    excel: 'Made from an Excel file. Check the preview — it may look a little different from Excel.',
    office: 'Made from an Office file. Check the preview — it may look a little different.',
  },
  missed: 'Some parts (charts, diagrams) print only from WPS Office.',
  open: 'Print with WPS Office',
  noApp: 'Install WPS Office from the Play Store to print this file.',
  failed: "Couldn't open WPS Office. Try again.",
  fileN: 'File {n}',
} as const;
