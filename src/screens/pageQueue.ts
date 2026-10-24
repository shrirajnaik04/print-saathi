/**
 * Page images for one screen (re-review I3, m4): asked for one at a time, in order, never twice; a page that failed is
 * asked once more at the end; when the screen closes ([stop]) nothing more is asked, so the phone's side never works
 * through images nobody will see.
 */
export class PageQueue {
  private readonly queue: string[] = [];
  private readonly seen = new Set<string>();
  private readonly retried = new Set<string>();
  private running = false;
  private stopped = false;

  constructor(
    private readonly ask: (key: string) => Promise<string | null>,
    private readonly got: (key: string, src: string) => void,
  ) {}

  want(keys: readonly string[]) {
    for (const k of keys) {
      if (this.seen.has(k)) continue;
      this.seen.add(k);
      this.queue.push(k);
    }
    void this.run();
  }

  stop() {
    this.stopped = true;
    this.queue.length = 0;
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.stopped) {
        const k = this.queue.shift();
        if (k === undefined) return;
        const src = await this.ask(k).catch(() => null);
        if (this.stopped) return;
        if (src) this.got(k, src);
        else if (!this.retried.has(k)) {
          this.retried.add(k);
          this.queue.push(k);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
