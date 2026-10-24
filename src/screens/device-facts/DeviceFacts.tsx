import { useEffect, useState } from 'preact/hooks';
import { type DeviceFacts as Facts, PrintEngine } from '../../native/printEngine';
import { describeUnlockTier, formatExtensionLevel, formatRam } from './describe';

// Phase 0 spike (i): shows the facts that decide memory budgets and the locked-PDF approach.
export function DeviceFacts() {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    PrintEngine.getDeviceFacts()
      .then(setFacts)
      .catch(() => setProblem('Could not read this phone’s details. Close PrintSaathi and open it again.'));
  }, []);

  if (problem) return <p role="alert">{problem}</p>;
  if (!facts) return <p>Reading this phone’s details…</p>;

  const rows: [string, string][] = [
    ['Phone', `${facts.manufacturer} ${facts.model}`],
    ['Android version', `${facts.androidRelease} (level ${facts.sdkInt})`],
    ['System update level', formatExtensionLevel(facts.sExtensionLevel)],
    ['Memory', `${formatRam(facts.totalRamMb)}${facts.isLowRamDevice ? ' (low-memory phone)' : ''}`],
    ['App memory limit', `${facts.memoryClassMb} MB (large: ${facts.largeMemoryClassMb} MB)`],
    ['Web engine', `${facts.webViewPackage} ${facts.webViewVersion}`],
    ['Text size setting', `${Math.round(facts.fontScale * 100)} %`],
  ];

  return (
    <section aria-labelledby="facts-title">
      <h2 id="facts-title">This phone</h2>
      <p>
        <strong>{describeUnlockTier(facts.pdfUnlockTier)}</strong>
      </p>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} class="fact">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
