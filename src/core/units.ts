// Physical-unit conversions. All layout geometry is in PDF points (1/72 inch).
export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;

export const mmToPt = (mm: number): number => (mm * PT_PER_INCH) / MM_PER_INCH;
export const ptToMm = (pt: number): number => (pt * MM_PER_INCH) / PT_PER_INCH;
export const mmToPx = (mm: number, dpi: number): number => Math.round((mm / MM_PER_INCH) * dpi);
