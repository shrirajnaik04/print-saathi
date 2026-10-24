import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'preact/hooks';
import { PrintEngine } from '../../native/printEngine';
import type { FileLengthResult } from '../../workers/fileLength';

const FONT = '20px "Atkinson Hyperlegible Next"';

// Phase 0 spike (c): in a release build with no INTERNET permission, the bundled font, a Web Worker fetching a
// local file, and a local image must all work, and the network must be unreachable.
export function OfflineSpike() {
  const [font, setFont] = useState('checking…');
  const [worker, setWorker] = useState('waiting for a received file…');
  const [thumb, setThumb] = useState<string | null>(null);
  const [network, setNetwork] = useState('not tried');

  useEffect(() => {
    document.fonts.ready.then(() =>
      setFont(document.fonts.check(FONT) ? 'Atkinson font active' : 'Atkinson font MISSING'),
    );
    PrintEngine.getPendingIntake().then(({ intake }) => {
      const first = intake?.files.find((f) => f.sniffedType === 'jpeg' || f.sniffedType === 'png');
      if (!first) return;
      const url = Capacitor.convertFileSrc(first.path);
      setThumb(url);
      const w = new Worker(new URL('../../workers/ping.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<FileLengthResult>) => {
        setWorker(e.data.ok ? `worker read ${e.data.bytes} bytes` : `worker failed: ${e.data.error}`);
        w.terminate();
      };
      w.onerror = () => setWorker('worker could not start');
      w.postMessage(url);
    });
  }, []);

  const tryNetwork = () =>
    fetch('https://example.com/')
      .then((r) => setNetwork(`REACHED the network (HTTP ${r.status})`))
      .catch((e: unknown) => setNetwork(`blocked: ${e instanceof Error ? `${e.name}: ${e.message}` : 'error'}`));

  return (
    <section aria-labelledby="offline-title">
      <h2 id="offline-title">Offline check (for the shop owner)</h2>
      <p class="fact" data-testid="font">
        {font}
      </p>
      <p class="fact" data-testid="worker">
        {worker}
      </p>
      {thumb && <img class="spike-thumb" src={thumb} alt="First file the customer sent" />}
      <button type="button" class="spike-button" onClick={tryNetwork}>
        Try the internet
      </button>
      <p class="fact" data-testid="network">
        {network}
      </p>
    </section>
  );
}
