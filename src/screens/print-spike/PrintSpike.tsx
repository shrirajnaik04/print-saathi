import { useState } from 'preact/hooks';
import { PrintEngine } from '../../native/printEngine';

type Scenario = {
  label: string;
  paper: 'A4' | '4x6';
  sheets: 1 | 2;
  contentType: 'photo' | 'document';
  monochrome?: boolean;
};

// Phase 0 spike (b): the owner prints these on the shop printer and measures with a ruler (USER-CHECKLIST §B).
const SCENARIOS: Scenario[] = [
  { label: 'Test page A4', paper: 'A4', sheets: 1, contentType: 'document' },
  { label: 'Test page A4 black & white', paper: 'A4', sheets: 1, contentType: 'document', monochrome: true },
  { label: 'Passport 4×6 — 1 sheet (document)', paper: '4x6', sheets: 1, contentType: 'document' },
  { label: 'Passport 4×6 — 2 sheets (document)', paper: '4x6', sheets: 2, contentType: 'document' },
  { label: 'Passport 4×6 — 1 sheet (photo)', paper: '4x6', sheets: 1, contentType: 'photo' },
  { label: 'Passport 4×6 — 2 sheets (photo)', paper: '4x6', sheets: 2, contentType: 'photo' },
];

export function PrintSpike() {
  const [report, setReport] = useState('');

  const run = async (s: Scenario) => {
    const r = await PrintEngine.printSpike(s);
    if (r.result === 'busy') setReport('A print is already open. Finish it first.');
  };
  const show = async () => setReport(JSON.stringify(await PrintEngine.lastPrintReport(), null, 2));

  return (
    <section aria-labelledby="print-spike-title">
      <h2 id="print-spike-title">Printer test (for the shop owner)</h2>
      <div class="spike-buttons">
        {SCENARIOS.map((s) => (
          <button key={s.label} type="button" class="spike-button" onClick={() => run(s)}>
            {s.label}
          </button>
        ))}
        <button type="button" class="spike-button" onClick={show}>
          Show last print report
        </button>
        {report && (
          <button type="button" class="spike-button" onClick={() => PrintEngine.shareText({ text: report })}>
            Send report
          </button>
        )}
      </div>
      {report && <pre class="report">{report}</pre>}
    </section>
  );
}
