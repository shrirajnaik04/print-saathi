import type { Intake, PrintEnginePlugin } from '../../native/printEngine';
import { type Job, jobFromIntake, normalizeJob } from '../job/job';

type Engine = Pick<PrintEnginePlugin, 'listIntakes' | 'saveJob' | 'ackIntake' | 'loadJob'>;

/** [picks]: for jobs whose files were chosen on Home, what for (PLAN §J0). */
/** [cancelled]: jobs whose receiving the shopkeeper cancelled (they wait in Recent; nothing opens by itself). */
export type TakenIntakes = {
  jobs: Job[];
  empty: Intake[];
  picks: Map<string, NonNullable<Intake['pick']>>;
  cancelled: Set<string>;
};

/**
 * Turns every pending intake into a saved job (the job id is the intake id), then acknowledges it. An intake is
 * acknowledged only after its job is safely saved, so a crash in between just repeats this next time (PLAN §D2).
 * Intakes that brought no file at all (interrupted, all refused) become no job; they are returned in `empty` so the
 * screen can explain them once.
 */
export async function takeNewIntakes(engine: Engine, nowMs: number): Promise<Job[]> {
  return (await takeNewIntakesDetailed(engine, nowMs)).jobs;
}

/** New jobs start in colour (owner, round 3); [paper]: the paper new photo jobs start on (Settings, PLAN §V3). */
export async function takeNewIntakesDetailed(
  engine: Engine,
  nowMs: number,
  paper: 'A4' | 'PHOTO_4x6' = 'A4',
): Promise<TakenIntakes> {
  const { intakes } = await engine.listIntakes();
  const jobs: Job[] = [];
  const empty: Intake[] = [];
  const picks: TakenIntakes['picks'] = new Map();
  const cancelled = new Set<string>();
  for (const intake of intakes) {
    if (intake.files.length === 0) {
      empty.push(intake);
      await engine.ackIntake({ intakeId: intake.intakeId });
      continue;
    }
    const fresh = jobFromIntake(intake.intakeId, intake, nowMs, 'colour', paper);
    const { saved } = await engine.saveJob({ job: fresh });
    // Refused because the job already exists: the app stopped after saving it but before acknowledging the
    // intake last time. Acknowledge now, or it would be listed on every start (gate review #7).
    const job = saved ? fresh : normalizeJob((await engine.loadJob({ id: intake.intakeId })).job);
    if (!job) continue;
    await engine.ackIntake({ intakeId: intake.intakeId });
    jobs.push(job);
    if (intake.pick) picks.set(job.id, intake.pick);
    if (intake.cancelled) cancelled.add(job.id);
  }
  return { jobs, empty, picks, cancelled };
}
