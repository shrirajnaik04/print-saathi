import type { CopiedPhoto, JobItem } from '../../core/job/job';

/**
 * What Copy or Cut on Adjust remembers (owner, round 5), for Paste. One at a time, for one job, in memory only:
 * forgotten when the job is left. [w], [h]: the photo's outline on the page (pt), to keep a paste inside the margins.
 */
export type Clip =
  | { jobId: string; kind: 'copy'; copy: CopiedPhoto; w: number; h: number }
  | {
      jobId: string;
      kind: 'cut';
      item: JobItem;
      at: number;
      pages: 'best' | number;
      size?: number;
      w: number;
      h: number;
    };

let clip: Clip | null = null;

export const keepClip = (c: Clip | null) => {
  clip = c;
};

export const clipFor = (jobId: string): Clip | null => (clip?.jobId === jobId ? clip : null);

/** The jobs still open on the screens keep theirs; any other job's is forgotten. */
export const forgetClipsExcept = (jobIds: readonly string[]) => {
  if (clip && !jobIds.includes(clip.jobId)) clip = null;
};
