import { Capacitor } from '@capacitor/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type IdCardSide, type IdCardSize, validQuad } from '../../core/job/job';
import { FULL } from '../../core/layout/crop';
import { moveCorner, quadOfBox } from '../../core/layout/quad';
import { maxCardSets } from '../../core/plan/plan';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { passwords } from '../../native/passwords';
import { type CardsInItem, PrintEngine } from '../../native/printEngine';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { CropBar } from '../../ui/CropBar';
import { CropFrame } from '../../ui/CropFrame';
import { Panel } from '../../ui/Panel';
import { Tile } from '../../ui/Tile';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import { push, type ScreenProps } from '../types';
import { takeAddedChoice } from '../useAddNotice';
import { useJob } from '../useJob';
import { loadSettings, settingsStore } from '../useSettings';
import { useStraightImages } from '../useStraightImages';

const t = en.cards;
const c = en.crop;
/** A card found at or above this is taken as it is; below, it is shown with "Check the corners" (spec Part 2). */
const AUTO_ACCEPT = 0.75;
/** A frame to start from when no card was found: the middle of the photo, card-shaped on a 4:3 photo. */
const DEFAULT_QUAD = [0.2, 0.25, 0.8, 0.25, 0.8, 0.75, 0.2, 0.75];

type Picked = IdCardSide & { sure: boolean };

/** Corners just outside the photo (a card touching its edge) brought inside it (review m13). */
const inside = (q: number[]) => q.map((v) => Math.min(1, Math.max(0, v)));

/**
 * Which cards to print, front first (spec Part 2), from what the engine found per photo or PDF page (in received
 * order): one file gives every card in it (both sides in one photo, an e-Aadhaar's two panels; unsure ones marked);
 * several files give the surest card of each. At most two. Front = the card with a face when exactly one has one;
 * otherwise received order. A photo or PDF page with no card at all gets a starting frame to fix; a locked or damaged
 * file gets nothing.
 */
export function pickCards(found: CardsInItem[]): Picked[] {
  type Candidate = Picked & { face: boolean };
  const files = [...new Set(found.map((f) => f.index))];
  const all: Candidate[] = [];
  for (const index of files) {
    const entries = found.filter((f) => f.index === index);
    // A PDF: its first page with cards on it.
    const it = entries.find((e) => e.cards.some((c) => validQuad(inside(c.quad)))) ?? entries[0];
    if (!it) continue;
    const ok = it.cards
      .map((c) => ({ ...c, quad: inside(c.quad) }))
      .filter((c) => validQuad(c.quad))
      .sort((x, y) => Number(y.confidence >= AUTO_ACCEPT) - Number(x.confidence >= AUTO_ACCEPT));
    const sure = ok.filter((c) => c.confidence >= AUTO_ACCEPT);
    const chosen = files.length === 1 ? ok : (sure.length ? sure : ok).slice(0, 1);
    const at = it.page !== undefined ? { page: it.page } : {};
    // A card lying upside down (its face reads only turned over) prints turned the right way up.
    for (const c of chosen)
      all.push({
        item: it.index,
        ...at,
        quad: c.quad,
        turns: c.upsideDown ? 2 : 0,
        sure: c.confidence >= AUTO_ACCEPT,
        face: c.face,
      });
    if (!chosen.length && it.state === 'ok' && (it.page ?? 0) === 0)
      all.push({ item: it.index, ...at, quad: DEFAULT_QUAD, turns: 0, sure: false, face: false });
  }
  const two = all.slice(0, 2);
  if (two.length === 2 && two.filter((c) => c.face).length === 1 && !two[0]?.face) two.reverse();
  return two.map(({ face: _face, ...c }) => c);
}

/**
 * Corners set by hand, made to start at one of the card's long sides (review I4): a card standing up in the photo
 * would otherwise be stretched into the card's lying-down box. [aspect]: the photo's width ÷ height.
 */
export function landscapeQuad(q: number[], aspect: number): number[] {
  const px = (i: number) => [(q[2 * i] ?? 0) * aspect, q[2 * i + 1] ?? 0];
  const len = (i: number) => {
    const [ax, ay] = px(i);
    const [bx, by] = px((i + 1) % 4);
    return Math.hypot((bx ?? 0) - (ax ?? 0), (by ?? 0) - (ay ?? 0));
  };
  if (len(0) + len(2) >= len(1) + len(3)) return q;
  // Start one corner later: the first side is then a long one, still clockwise.
  return [...q.slice(2), ...q.slice(0, 2)];
}

/** The straightened image of each card (made by the engine), refreshed when its corners change. */
export const useCardImages = useStraightImages;

/**
 * Screen 1 of ID card copy (spec Part 2, the approved mockup): the cards found, straightened, Front and Back. Swap,
 * Fix corners and Turn per card; Card copy goes on to "How big?".
 */
export function CardsFound({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  const [state, setState] = useState<'finding' | 'ready' | 'locked' | 'failed'>('finding');
  const [lockedItem, setLockedItem] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  // A back side just added from the phone (owner, 2026-10-24): its photo is looked at, and its card goes after the front.
  const [addedBack, setAddedBack] = useState(() => takeAddedChoice(jobId));
  // The back left out by "Print front only", for Undo.
  const [leftOut, setLeftOut] = useState<IdCardSide | null>(null);
  const started = useRef(-1);
  useEffect(() => {
    const cards = job?.idCard?.cards;
    if (!job || addedBack === null || !cards || cards.length !== 1 || !job.items.some((i) => i.index === addedBack))
      return;
    const item = addedBack;
    setAddedBack(null);
    let live = true;
    void (async () => {
      try {
        const { items } = await PrintEngine.findCards({ jobId, passwords: passwords.forJob(jobId) });
        if (!live) return;
        // The surest card in the added photo; none found: a starting frame to fix (as for any photo).
        const back = pickCards(items.filter((f) => f.index === item))[0] ?? {
          item,
          quad: DEFAULT_QUAD,
          turns: 0 as const,
          sure: false,
        };
        await change({ type: 'setIdCards', cards: [...cards, back] });
      } catch {
        if (live) setState('failed');
      }
    })();
    return () => {
      live = false;
    };
  }, [job?.id, job?.rev, addedBack]);
  useEffect(() => {
    if (!job || started.current === attempt) return;
    started.current = attempt;
    // Cards already chosen for this job: shown as they are (a fix or a swap is never undone by looking again).
    if (job.layout === 'idCard' && job.idCard && attempt === 0) return setState('ready');
    // The shopkeeper may leave while the cards are looked for: then nothing is saved and no screen opens (review I7).
    let live = true;
    void (async () => {
      try {
        // A locked e-Aadhaar is unlocked first (spec Part 2 input 4).
        const pdfs = job.items.filter((i) => i.type === 'pdf');
        if (pdfs.length) {
          const facts = await PrintEngine.documentFacts({ jobId, passwords: passwords.forJob(jobId) });
          const locked = facts.items.find((f) => f.state === 'password');
          if (!live) return;
          if (locked) {
            setLockedItem(locked.index);
            return setState('locked');
          }
        }
        const { items } = await PrintEngine.findCards({ jobId, passwords: passwords.forJob(jobId) });
        if (!live) return;
        const picked = pickCards(items);
        if (!picked.length) return setState('failed');
        const saved = await change({ type: 'setIdCards', cards: picked });
        if (!live) return;
        if (!saved) return setState('failed');
        setState('ready');
        // No card found: straight to Fix corners with a default frame (spec Part 2).
        if (picked.every((p) => !p.sure) && items.every((i) => i.cards.length === 0))
          go(push('fixcorners', { jobId, at: 0 }));
      } catch {
        if (live) setState('failed');
      }
    })();
    return () => {
      live = false;
    };
  }, [job?.id, attempt]);
  const cards = job?.idCard?.cards;
  const imageOf = useCardImages(jobId, cards);
  const unsure = (cards ?? []).map((c) => c.sure === false);
  // Nothing was found: every card is still the starting frame.
  const none = !!cards?.length && cards.every((c) => c.sure === false && c.quad.join() === DEFAULT_QUAD.join());
  if (gone) return <JobGone go={go} title={t.title} />;
  const heading = state !== 'ready' || !cards ? t.title : none ? t.none : cards.length === 2 ? t.found2 : t.found1;
  return (
    <main class="screen">
      <TopBar title={t.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {(failed || state === 'failed') && (
        <Panel
          kind="error"
          title={t.failed}
          action={{
            label: en.ready.tryAgain,
            // Looks for the cards again (review I3: Try again used to reload the job only).
            onClick: () => {
              setState('finding');
              setAttempt((n) => n + 1);
              retry();
            },
          }}
        />
      )}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      {state === 'finding' && <p role="status">{t.finding}</p>}
      {state === 'locked' && lockedItem !== null && (
        <Panel
          kind="warn"
          title={t.locked}
          action={{ label: t.unlock, onClick: () => go(push('unlock', { jobId, item: lockedItem, back: 'cards' })) }}
        />
      )}
      {state === 'ready' && cards && (
        <>
          <h2>{heading}</h2>
          {none && <p>{t.noneHint}</p>}
          <ul class="card-list rise">
            {cards.map((c, i) => {
              const side = i === 0 ? t.front : t.back;
              const src = imageOf(c);
              return (
                <li key={`${c.item}-${c.page ?? ''}-${i}`} class="card-found">
                  <div class="card-head">
                    <span class="badge-label">{side}</span>
                    <span class={unsure[i] ? 'card-state card-check' : 'card-state'}>
                      {unsure[i] ? t.check : `✓ ${t.straightened}`}
                    </span>
                  </div>
                  <div class="card-shot">
                    {src ? (
                      <img src={src} alt={fill(t.imageLabel, { side })} class={c.turns === 2 ? 'turn-2' : undefined} />
                    ) : (
                      <span class="thumb-note">{src === null ? t.noPicture : t.making}</span>
                    )}
                  </div>
                  <div class="nudge-grid">
                    <Button
                      variant="secondary"
                      icon="crop"
                      label={`${t.fix} (${side})`}
                      onClick={() => go(push('fixcorners', { jobId, at: i }))}
                    >
                      {t.fix}
                    </Button>
                    <Button
                      variant="secondary"
                      icon="turn"
                      disabled={busy}
                      label={`${t.turn} (${side})`}
                      onClick={() => void change({ type: 'turnIdCard', at: i })}
                    >
                      {t.turn}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {cards.length === 2 && (
            <div class="nudge-grid">
              <Button variant="secondary" disabled={busy} onClick={() => void change({ type: 'swapIdCards' })}>
                {t.swap}
              </Button>
              {/* Optional (owner, 2026-10-24): the customer may want the front alone. */}
              <Button
                variant="secondary"
                icon="remove"
                disabled={busy}
                onClick={async () => {
                  const [front, back] = cards;
                  if (front && back && (await change({ type: 'setIdCards', cards: [front] }))) setLeftOut(back);
                }}
              >
                {t.frontOnly}
              </Button>
            </div>
          )}
          {cards.length === 1 && leftOut && (
            <Panel
              kind="info"
              title={t.oneSide}
              action={{
                label: en.photos.undo,
                onClick: async () => {
                  const [front] = cards;
                  if (front && (await change({ type: 'setIdCards', cards: [front, leftOut] }))) setLeftOut(null);
                },
              }}
            />
          )}
          {cards.length === 1 && !leftOut && (
            <Panel
              kind="info"
              title={t.oneSide}
              action={{ label: t.addBack, onClick: () => go(push('addsource', { jobId, kind: 'back' })) }}
            />
          )}
        </>
      )}
      {state === 'ready' && cards && (
        <ActionBar>
          <Button icon="next" busy={busy} onClick={() => go(push('cardsize', { jobId }))}>
            {t.next}
          </Button>
        </ActionBar>
      )}
    </main>
  );
}

const STEP = 0.01;

/**
 * Fix corners (spec Part 2; the scanner app's frame since 2026-10-24): the photo with the card's frame. Drag a corner or
 * a side, or pick a corner ("Next corner") and move it with the arrows, 1 % a tap (no precision needed, PLAN §H2.5).
 * The straightened card shows below as it will print; Upside down turns it; Done keeps it.
 */
export function FixCorners({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const at = Number(params?.at ?? 0);
  const { job, aspects, srcOf, gone, change, busy, saveFailed } = useJob(jobId);
  const card = job?.idCard?.cards[at];
  const [quad, setQuad] = useState<number[] | null>(null);
  const [corner, setCorner] = useState(0);
  const [pageSrc, setPageSrc] = useState<string | undefined>(undefined);
  const [pageAspect, setPageAspect] = useState<number>(595 / 842);
  const q = quad ?? card?.quad ?? null;
  // A PDF page (e-Aadhaar): its page image from the engine, and its shape.
  useEffect(() => {
    if (!card || card.page === undefined) return;
    let live = true;
    void PrintEngine.pdfPageThumb({
      jobId,
      item: card.item,
      page: card.page,
      password: passwords.forJob(jobId)[card.item],
    }).then(({ path }) => {
      if (live && path) setPageSrc(path.startsWith('data:') ? path : Capacitor.convertFileSrc(path));
    });
    void PrintEngine.documentFacts({ jobId, passwords: passwords.forJob(jobId) }).then(({ items }) => {
      const s = items.find((f) => f.index === card.item)?.sizes?.[card.page as number];
      if (live && s) setPageAspect(s[0] / s[1]);
    });
    return () => {
      live = false;
    };
  }, [card?.item, card?.page]);
  // The straightened result, a moment after the corners stop moving (a preview-size straightening).
  const [shown, setShown] = useState<number[] | null>(null);
  useEffect(() => {
    if (!q) return;
    const timer = setTimeout(() => setShown(q), 350);
    return () => clearTimeout(timer);
  }, [q?.join(',')]);
  const preview = useCardImages(jobId, card && shown ? [{ ...card, quad: shown }] : undefined, 480);
  if (gone) return <JobGone go={go} title={t.fixTitle} />;
  const aspect = card?.page !== undefined ? pageAspect : (aspects.get(card?.item ?? -1) ?? 4 / 3);
  const src = card?.page !== undefined ? pageSrc : srcOf(card?.item ?? -1);
  const nudge = (dx: number, dy: number) =>
    q && setQuad(moveCorner(q, corner, (q[2 * corner] ?? 0) + dx, (q[2 * corner + 1] ?? 0) + dy));
  const preSrc = card && shown ? preview({ ...card, quad: shown }) : undefined;
  return (
    <main class="screen">
      <TopBar title={t.fixTitle} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      <p>{t.fixHint}</p>
      {q && (
        <CropFrame
          src={src}
          turns={0}
          aspect={aspect}
          quad={q}
          onChange={setQuad}
          chosen={corner}
          onChoose={setCorner}
          label={t.fixTitle}
          cornerLabel={c.cornerLabel}
          cornerNames={c.cornerNames}
        />
      )}
      <p role="status" class="corner-now">
        {fill(c.corner, { k: corner + 1, name: c.cornerNames[corner] ?? '' })}
      </p>
      <div class="nudge-grid">
        <Button variant="secondary" icon="next" onClick={() => setCorner((corner + 1) % 4)}>
          {c.nextCorner}
        </Button>
        <Button variant="secondary" icon="up" onClick={() => nudge(0, -STEP)}>
          {c.up}
        </Button>
        <Button variant="secondary" icon="left" onClick={() => nudge(-STEP, 0)}>
          {c.left}
        </Button>
        <Button variant="secondary" icon="right" onClick={() => nudge(STEP, 0)}>
          {c.right}
        </Button>
        <Button variant="secondary" icon="down" onClick={() => nudge(0, STEP)}>
          {c.down}
        </Button>
        <Button variant="secondary" icon="undo" onClick={() => setQuad(card?.quad ?? null)}>
          {c.reset}
        </Button>
      </div>
      <h2>{t.preview}</h2>
      <div class="card-shot">
        {preSrc ? (
          <img src={preSrc} alt={t.previewLabel} class={card?.turns === 2 ? 'turn-2' : undefined} />
        ) : (
          <span class="thumb-note">{preSrc === null ? t.noPicture : t.making}</span>
        )}
      </div>
      <CropBar
        busy={busy}
        tools={[
          { label: c.cancel, icon: 'close', onClick: () => go({ type: 'back' }) },
          { label: c.whole, icon: 'whole', onClick: () => setQuad(quadOfBox(FULL)) },
          // A card always prints lying flat: one turn, upside down (Phase 14).
          {
            label: c.upsideDown,
            icon: 'turn',
            disabled: busy,
            onClick: () => void change({ type: 'turnIdCard', at }),
          },
        ]}
        done={{
          label: c.done,
          icon: 'check',
          onClick: async () => {
            if (!q) return;
            // The card always prints lying down, whichever corner the shopkeeper started from (review I4).
            if (quad && !(await change({ type: 'setIdCardQuad', at, quad: landscapeQuad(quad, aspect) }))) return;
            go({ type: 'back' });
          },
        }}
      />
    </main>
  );
}

/**
 * "How big?" (spec Part 2): one question, picture choices; the last one used comes first. Tapping one goes on to
 * Ready. The whole e-Aadhaar page is offered only for a PDF.
 */
export function CardSize({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, gone, change, busy, saveFailed } = useJob(jobId);
  const [last, setLast] = useState<IdCardSize>('real');
  useEffect(() => {
    void loadSettings().then((s) => setLast(s.cardSize));
  }, []);
  if (gone) return <JobGone go={go} title={t.sizeTitle} />;
  const cards = job?.idCard?.cards ?? [];
  const fromPdf = cards.some((c) => c.page !== undefined);
  const sets = maxCardSets(6, cards.length);
  const all: {
    size: Exclude<IdCardSize, 'custom'>;
    title: string;
    helper: string;
    icon: 'passport' | 'photos' | 'files' | 'document';
  }[] = [
    { size: 'real', title: t.real, helper: t.realHelp, icon: 'passport' },
    { size: 'big', title: t.big, helper: t.bigHelp, icon: 'photos' },
    { size: 'sets', title: t.sets, helper: fill(t.setsHelp, { n: sets }), icon: 'files' },
    ...(fromPdf ? [{ size: 'page' as const, title: t.page, helper: t.pageHelp, icon: 'document' as const }] : []),
  ];
  const choices = [...all.filter((c) => c.size === last), ...all.filter((c) => c.size !== last)];
  const pick = async (size: Exclude<IdCardSize, 'custom'>) => {
    if (busy) return;
    if (!(await change({ type: 'setIdCardSize', size, ...(size === 'sets' ? { sets } : {}) }))) return;
    void settingsStore.update((s) => ({ ...s, cardSize: size }));
    if (params?.from === 'change') go({ type: 'backTo', name: 'ready' });
    else go(push('ready', { jobId }));
  };
  return (
    <main class="screen">
      <TopBar title={t.sizeTitle} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      <h2>{t.sizeAsk}</h2>
      <div class="stack rise">
        {choices.map((c) => (
          <Tile key={c.size} icon={c.icon} title={c.title} helper={c.helper} onClick={() => void pick(c.size)} />
        ))}
      </div>
    </main>
  );
}
