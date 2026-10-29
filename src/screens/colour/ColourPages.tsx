import { useEffect, useRef, useState } from 'preact/hooks';
import type { Job, JobAction } from '../../core/job/job';
import { colourWords as w } from '../../i18n/colour';
import { fill } from '../../i18n/fill';
import { Button } from '../../ui/Button';
import { ColourSwitch } from '../../ui/ColourSwitch';
import { Icon } from '../../ui/Icon';
import { guessMarks, type Source } from './guess';

/**
 * One printed page as the chooser needs it: its pictures' keys and sources, whether it prints grey (or, with photos of
 * both colours on it, [both]), and its picture.
 */
export type ColourPage = { grey: boolean; both?: boolean; sources: Source[]; image?: string };

/**
 * Round 10 (owner: some pages in colour, some in black & white; change per page while paging): the switch under each
 * page's picture. One tap prints that page in the other colour; the picture changes at once.
 */
export function PageColour({
  n,
  state,
  busy,
  onChange,
}: {
  n: number;
  /** 'both': photos of both colours are on this page: neither half is chosen (review I4). */
  state: 'colour' | 'bw' | 'both';
  busy: boolean;
  onChange: (grey: boolean) => void;
}) {
  return (
    <ColourSwitch
      value={state === 'both' ? null : state}
      disabled={busy}
      label={fill(w.pageSwitch, { n })}
      onChange={(c) => onChange(c === 'bw')}
    />
  );
}

/**
 * "Choose pages in colour": every page's picture with its colour, tapped to change, All colour / All black & white. The
 * first time it opens on a job in colour, pages with colour in them stay Colour and plain pages start as Black & white
 * (a guess from the pages' pictures; anything tapped stays).
 */
export function ColourChooser({
  job,
  pages,
  busy,
  apply,
  wantAll,
}: {
  job: Job;
  pages: ColourPage[];
  busy: boolean;
  apply: (action: JobAction) => Promise<boolean>;
  wantAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [guessing, setGuessing] = useState(false);
  const [late, setLate] = useState(false);
  const guessed = useRef(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const greyPages = pages.filter((p) => p.grey).length;
  const mixed = (greyPages > 0 || pages.some((p) => p.both)) && greyPages < pages.length;
  const everySource = pages.every((p) => p.sources.every((s) => s.src));

  useEffect(() => {
    if (!open) return;
    wantAll();
    const timer = setTimeout(() => setLate(true), 8000);
    return () => clearTimeout(timer);
  }, [open]);

  // The guess: once per visit, only from a job in colour that has no marks yet, when the pictures are there (or after
  // a while: a page without a picture stays in colour).
  useEffect(() => {
    if (
      !open ||
      guessed.current ||
      job.pagesMarked ||
      job.pageColour ||
      job.colour !== 'colour' ||
      !(everySource || late)
    )
      return;
    guessed.current = true;
    setGuessing(true);
    // Left Ready meanwhile: nothing is saved (and the job itself ignores a guess after any choice, review I2).
    void guessMarks(pages.flatMap((p) => p.sources))
      .then((marks) => (alive.current ? apply({ type: 'someColour', marks }) : undefined))
      .finally(() => alive.current && setGuessing(false));
  }, [open, everySource, late]);

  const disabled = busy || guessing;
  const keysOf = (p: ColourPage) => [...new Set(p.sources.map((s) => s.key))];
  return (
    <section class="colour-chooser" aria-label={w.title}>
      <Button variant="secondary" icon={open ? 'check' : 'print'} onClick={() => setOpen((o) => !o)}>
        {open ? w.done : mixed ? fill(w.chooseSome, { n: pages.length - greyPages, m: greyPages }) : w.choose}
      </Button>
      {open && (
        <div class="colour-grid-box">
          <h2 class="colour-title">{w.title}</h2>
          <p role="status" class="muted">
            {guessing ? w.looking : w.tap}
          </p>
          <div class="colour-all">
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => void apply({ type: 'setColour', colour: 'colour' })}
            >
              {w.allColour}
            </Button>
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => void apply({ type: 'setColour', colour: 'bw' })}
            >
              {w.allBw}
            </Button>
          </div>
          <ol class="colour-grid">
            {pages.map((p, i) => (
              <li key={keysOf(p).join(',') || i}>
                <button
                  type="button"
                  class={p.grey ? 'colour-card colour-card-grey' : 'colour-card'}
                  disabled={disabled}
                  aria-label={`${fill(w.page, { n: i + 1 })}: ${p.both ? w.some : p.grey ? w.bw : w.colour}`}
                  onClick={() =>
                    void apply({
                      type: 'setPageColours',
                      marks: Object.fromEntries(
                        keysOf(p).map((k) => [k, p.grey ? 'colour' : p.both ? 'colour' : 'bw']),
                      ),
                    })
                  }
                >
                  {p.image ? (
                    <img src={p.image} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span class="colour-card-blank" />
                  )}
                  <span class="colour-card-label" aria-hidden="true">
                    {fill(w.page, { n: i + 1 })}
                  </span>
                  <span class="colour-card-mark" aria-hidden="true">
                    {!p.grey && !p.both && <Icon name="check" size="sm" />}
                    {p.both ? w.some : p.grey ? w.bw : w.colour}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
