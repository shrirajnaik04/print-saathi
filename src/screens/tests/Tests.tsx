import { useEffect } from 'preact/hooks';
import { en } from '../../i18n/en';
import { PrintEngine } from '../../native/printEngine';
import { TopBar } from '../../ui/TopBar';
import { DeviceFacts } from '../device-facts/DeviceFacts';
import { IntakeSpike } from '../intake-spike/IntakeSpike';
import { OfflineSpike } from '../offline-spike/OfflineSpike';
import { PrintSpike } from '../print-spike/PrintSpike';
import type { ScreenProps } from '../types';

/** Owner-only test tools from Phase 0 (print test pages, phone facts, offline check), kept off the shopkeeper's path. */
export function Tests({ go }: ScreenProps) {
  // This screen shows received customer files (thumbnails): keep them out of screenshots on older phones.
  useEffect(() => {
    void PrintEngine.setCustomerContentShown({ shown: true });
    return () => void PrintEngine.setCustomerContentShown({ shown: false });
  }, []);
  return (
    <main class="screen">
      <TopBar title={en.tests.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      <IntakeSpike />
      <PrintSpike />
      <OfflineSpike />
      <DeviceFacts />
    </main>
  );
}
