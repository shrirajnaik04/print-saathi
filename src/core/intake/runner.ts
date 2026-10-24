/**
 * Runs `take` (turn pending shares into jobs) one at a time. A request while one is running makes exactly one more
 * pass afterwards, so a share that arrives mid-take is never dropped (gate review #2). Nothing runs before `start`,
 * which says whether the first pass may open what it finds (false after a crash loop, PLAN §D5); passes after it
 * always may.
 */
export function intakeRunner(take: (open: boolean) => Promise<void>) {
  let started = false;
  let running = false;
  let again = false;
  let open = true;

  async function run(): Promise<void> {
    if (!started || running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        const mayOpen = open;
        open = true;
        await take(mayOpen);
      } while (again);
    } finally {
      running = false;
    }
  }

  return {
    request: run,
    start(openFirst: boolean): Promise<void> {
      started = true;
      open = openFirst;
      return run();
    },
  };
}
