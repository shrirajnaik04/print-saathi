import { Capacitor } from '@capacitor/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type IdCardSide, type IdCardSize, validQuad } from '../../core/job/job';
import { FULL } from '../../core/layout/crop';
import { moveSideStraight, quadOfBox } from '../../core/layout/quad';
import { CARD_H_MM, CARD_W_MM, maxCardSets } from '../../core/plan/plan';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { passwords } from '../../native/passwords';
import { type CardsInItem, PrintEngine } from '../../native/printEngine';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { CropBar } from '../../ui/CropBar';
import { CropFrame } from '../../ui/CropFrame';
import { Panel } from '../../ui/Panel';
import { turnedStyle } from '../../ui/PaperPreview';
import { SideNudge } from '../../ui/SideNudge';
import { Tile } from '../../ui/Tile';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import { push, type ScreenProps } from '../types';
import { forgetAddedChoice, forgetCardSide, noteCardSide, peekAddedChoice, peekCardSide } from '../useAddNotice';
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

/**
 * A card-shaped frame (85.6 : 54 on the photo as shown) in the middle of a photo of shape [aspect] (width ÷ height): 80 %
 * of its width, or of its height if that is less (owner, round 4: "crop selection frame default to card size").
 */
export function cardFrame(aspect: number): number[] {
  const card = CARD_W_MM / CARD_H_MM;
  let w = 0.8;
  let h = (w * aspect) / card;
  if (h > 0.8) {
    h = 0.8;
    w = (h * card) / aspect;
  }
  const x = (1 - w) / 2;
  const y = (1 - h) / 2;
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}

/** Corners just outside the photo (a card touching its edge) brought inside it (review m13). */
const inside = (q: number[]) => q.map((v) => Math.min(1, Math.max(0, v)));

/**
 * Which cards to print, front first (spec Part 2), from what the engine found per photo or PDF page (in received
 * order): one file gives every card in it (both sides in one photo, an e-Aadhaar's two panels; unsure ones marked);
 * several files give the surest card of each. At most two. Front = the card with a face when exactly one has one;
 * otherwise received order. A photo or PDF page with no card at all gets a starting frame to fix; a locked or damaged
 * file gets nothing.
 */
/** [aspectOf]: a photo's shape, for its card-shaped starting frame when no card is found in it (round 4). */
export function pickCards(found: CardsInItem[], aspectOf?: (item: number) => number | undefined): Picked[] {
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
    if (!chosen.length && it.state === 'ok' && (it.page ?? 0) === 0) {
      const aspect = it.page === undefined ? aspectOf?.(it.index) : undefined;
      all.push({
        item: it.index,
        ...at,
        quad: aspect ? cardFrame(aspect) : DEFAULT_QUAD,
        turns: 0,
        sure: false,
        face: false,
      });
    }
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

/** The next side after [at] that comes from a photo (it is cropped by hand in turn, owner round 4); -1 if none. */
const nextPhotoSide = (cards: readonly IdCardSide[], at: number) =>
  cards.findIndex((c, i) => i > at && c.page === undefined);

/** A straightened card's picture: standing when turned a quarter (its frame then stands too, owner round 4). */
function CardPicture({ src, turns, alt }: { src: string; turns: number; alt: string }) {
  const standing = turns % 2 === 1;
  return (
    <img
      src={src}
      alt={alt}
      class="card-picture"
      // Standing: centred in its standing frame and turned (as on the page); lying: turned in place.
      style={
        standing
          ? turnedStyle(turns, CARD_H_MM, CARD_W_MM)
          : turns
            ? { transform: `rotate(${turns * 90}deg)` }
            : undefined
      }
    />
  );
}

/**
 * Screen 1 of ID card copy (spec Part 2, the approved mockup): the cards found, straightened, Front and Back. Swap,
 * Fix edges, Turn left / right and Change photo per card; Card copy goes on to "How big?". Each side from a photo is
 * first fitted on its own crop screen, front then back (owner, round 4).
 */
export function CardsFound({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, aspects: shapes, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  const [state, setState] = useState<'finding' | 'ready' | 'locked' | 'failed'>('finding');
  const [lockedItem, setLockedItem] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  // A back side just added from the phone (owner, 2026-10-24): its photo is looked at, and its card goes after the front.
  // It stays noted until its card is saved: leaving while it is looked at and coming back looks again (review I1).
  const [addedBack] = useState(() => peekAddedChoice(jobId));
  // Change photo (owner, round 4): the side whose photo the photo just added replaces.
  const [replacing] = useState(() => peekCardSide(jobId));
  const shapesNow = useRef(shapes);
  shapesNow.current = shapes;
  const [looking, setLooking] = useState(false);
  const backStarted = useRef(false);
  // The cards as they are now (a look that ends later adds the back to these, never to the ones it started with).
  const latest = useRef<IdCardSide[] | undefined>(undefined);
  latest.current = job?.idCard?.cards;
  // The back left out by "Print front only", for Undo.
  const [leftOut, setLeftOut] = useState<IdCardSide | null>(null);
  const started = useRef(-1);
  // Open while the screen is: the look for a back card ends only when the screen closes. Not with the effect: clearing
  // the note redraws the screen and ended it, so on a phone (slower than the tests' engine) no back was ever added
  // (owner, round 3).
  const open = useRef(true);
  useEffect(
    () => () => {
      open.current = false;
    },
    [],
  );
  useEffect(() => {
    const cards = job?.idCard?.cards;
    if (!job || !cards || backStarted.current) return;
    // Change photo closed without a photo: nothing to replace.
    if (replacing !== null && addedBack === null) return forgetCardSide();
    if (addedBack === null) return;
    const item = addedBack;
    if (!job.items.some((i) => i.index === item)) {
      forgetCardSide();
      return forgetAddedChoice();
    }
    // The photo replaces side [replacing]: its card (or a card-shaped frame) takes that side; the old photo leaves the
    // job unless the other side uses it; then its crop screen.
    if (replacing !== null) {
      const old = cards[replacing];
      if (!old) {
        forgetCardSide();
        return forgetAddedChoice();
      }
      backStarted.current = true;
      setLooking(true);
      void (async () => {
        try {
          const { items } = await PrintEngine.findCards({ jobId, passwords: passwords.forJob(jobId) });
          if (!open.current) return;
          const found = pickCards(
            items.filter((f) => f.index === item),
            (i) => shapesNow.current.get(i),
          )[0] ?? { item, quad: cardFrame(shapesNow.current.get(item) ?? 4 / 3), turns: 0 as const, sure: false };
          const now = latest.current ?? cards;
          const next = now.map((c, i) => (i === replacing ? found : c));
          const gone = !next.some((c) => c.item === old.item);
          const saved = await change({
            type: 'all',
            actions: [
              { type: 'setIdCards', cards: next },
              ...(gone ? [{ type: 'removeItem' as const, index: old.item }] : []),
            ],
          });
          if (!saved || !open.current) return;
          forgetAddedChoice();
          forgetCardSide();
          go(push('fixcorners', { jobId, at: replacing }));
        } catch {
          if (open.current) setState('failed');
        } finally {
          if (open.current) setLooking(false);
        }
      })();
      return;
    }
    // Already two sides: nothing left to look at.
    if (cards.length !== 1) return forgetAddedChoice();
    backStarted.current = true;
    setLooking(true);
    void (async () => {
      try {
        const { items } = await PrintEngine.findCards({ jobId, passwords: passwords.forJob(jobId) });
        if (!open.current) return;
        // The surest card in the added photo; none found: a card-shaped frame to fit (as for any photo).
        const back = pickCards(
          items.filter((f) => f.index === item),
          (i) => shapesNow.current.get(i),
        )[0] ?? { item, quad: cardFrame(shapesNow.current.get(item) ?? 4 / 3), turns: 0 as const, sure: false };
        const now = latest.current;
        if (now?.length === 1 && (await change({ type: 'setIdCards', cards: [...now, back] }))) {
          forgetAddedChoice();
          // Its crop screen, as for every side from a photo (owner, round 4).
          if (open.current) go(push('fixcorners', { jobId, at: now.length, chain: 1 }));
        }
      } catch {
        if (open.current) setState('failed');
      } finally {
        if (open.current) setLooking(false);
      }
    })();
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
        const picked = pickCards(items, (i) => shapesNow.current.get(i));
        if (!picked.length) return setState('failed');
        const saved = await change({ type: 'setIdCards', cards: picked });
        if (!live) return;
        if (!saved) return setState('failed');
        setState('ready');
        // Each side from a photo on its crop screen in turn, front first (owner, round 4); a PDF's panels are exact,
        // but a PDF page with none still opens Fix edges on a starting frame (spec Part 2, review I3).
        const first = nextPhotoSide(picked, -1);
        if (first >= 0) go(push('fixcorners', { jobId, at: first, chain: 1 }));
        else if (picked.every((p) => !p.sure) && items.every((i) => i.cards.length === 0))
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
  const none =
    !!cards?.length &&
    cards.every(
      (c) =>
        c.sure === false &&
        (c.quad.join() === DEFAULT_QUAD.join() || c.quad.join() === cardFrame(shapes.get(c.item) ?? 4 / 3).join()),
    );
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
      {state === 'ready' && looking && <p role="status">{t.lookingBack}</p>}
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
                  <div class={c.turns % 2 === 1 ? 'card-shot card-standing' : 'card-shot'}>
                    {src ? (
                      <CardPicture src={src} turns={c.turns} alt={fill(t.imageLabel, { side })} />
                    ) : (
                      <span class="thumb-note">{src === null ? t.noPicture : t.making}</span>
                    )}
                  </div>
                  <div class="nudge-grid">
                    <Button
                      variant="secondary"
                      icon="crop"
                      disabled={looking}
                      label={`${t.fix} (${side})`}
                      onClick={() => go(push('fixcorners', { jobId, at: i }))}
                    >
                      {t.fix}
                    </Button>
                    <Button
                      variant="secondary"
                      icon="photos"
                      disabled={busy || looking}
                      label={`${t.changePhoto} (${side})`}
                      onClick={() => {
                        noteCardSide(jobId, i);
                        go(push('addsource', { jobId, kind: 'side', at: i }));
                      }}
                    >
                      {t.changePhoto}
                    </Button>
                    <Button
                      variant="secondary"
                      icon="turnLeft"
                      disabled={busy || looking}
                      label={`${t.turnLeft} (${side})`}
                      onClick={() => void change({ type: 'turnIdCard', at: i, by: 3 })}
                    >
                      {t.turnLeft}
                    </Button>
                    <Button
                      variant="secondary"
                      icon="turn"
                      disabled={busy || looking}
                      label={`${t.turnRight} (${side})`}
                      onClick={() => void change({ type: 'turnIdCard', at: i, by: 1 })}
                    >
                      {t.turnRight}
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
          {cards.length === 1 && !leftOut && !looking && (
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
          <Button icon="next" busy={busy} disabled={looking} onClick={() => go(push('cardsize', { jobId }))}>
            {t.next}
          </Button>
        </ActionBar>
      )}
    </main>
  );
}

const STEP = 0.01;

/**
 * Fix the edges (spec Part 2; the scanner app's frame since 2026-10-24; round 3: the middle bars only): the photo with
 * the card's frame as found. Drag a side's bar, or pick a side ("Next side") and move it with the arrows, 1 % a tap (no
 * precision needed, PLAN §H2.5).
 * The straightened card shows below as it will print; Upside down turns it; Done keeps it.
 */
export function FixCorners({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const at = Number(params?.at ?? 0);
  const { job, aspects, srcOf, gone, change, busy, saveFailed } = useJob(jobId);
  const card = job?.idCard?.cards[at];
  const [quad, setQuad] = useState<number[] | null>(null);
  const [side, setSide] = useState<0 | 1 | 2 | 3>(0);
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
  const nudge = (d: number) => q && setQuad(moveSideStraight(q, side, d));
  const preSrc = card && shown ? preview({ ...card, quad: shown }) : undefined;
  // Owner, round 4: the side it is, and (fitting each side from a photo in turn) the next side after Done.
  const title = at === 0 ? t.frontTitle : t.backSideTitle;
  const next = params?.chain && job?.idCard ? nextPhotoSide(job.idCard.cards, at) : -1;
  return (
    <main class="screen">
      <TopBar title={title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      <p>{t.cropHint}</p>
      {q && (
        <CropFrame
          src={src}
          turns={0}
          aspect={aspect}
          quad={q}
          onChange={setQuad}
          side={side}
          onSide={setSide}
          label={title}
          sideLabel={c.sideLabel}
          sideNames={c.sideNames}
        />
      )}
      <SideNudge side={side} onSide={setSide} move={nudge} reset={() => setQuad(card?.quad ?? null)} step={STEP} />
      <h2>{t.preview}</h2>
      <div class={(card?.turns ?? 0) % 2 === 1 ? 'card-shot card-standing' : 'card-shot'}>
        {preSrc ? (
          <CardPicture src={preSrc} turns={card?.turns ?? 0} alt={t.previewLabel} />
        ) : (
          <span class="thumb-note">{preSrc === null ? t.noPicture : t.making}</span>
        )}
      </div>
      <CropBar
        busy={busy}
        tools={[
          { label: c.cancel, icon: 'close', onClick: () => go({ type: 'back' }) },
          { label: c.whole, icon: 'whole', onClick: () => setQuad(quadOfBox(FULL)) },
          // Any way round (owner, round 4): a quarter at a time; turned a quarter, the card prints standing.
          {
            label: t.turnLeft,
            icon: 'turnLeft',
            disabled: busy,
            onClick: () => void change({ type: 'turnIdCard', at, by: 3 }),
          },
          {
            label: t.turnRight,
            icon: 'turn',
            disabled: busy,
            onClick: () => void change({ type: 'turnIdCard', at, by: 1 }),
          },
        ]}
        done={{
          label: c.done,
          icon: 'check',
          onClick: async () => {
            if (!q) return;
            // The card always prints lying down, whichever corner the shopkeeper started from (review I4).
            if (quad && !(await change({ type: 'setIdCardQuad', at, quad: landscapeQuad(quad, aspect) }))) return;
            // The next side from a photo, in place of this one; else back to the cards.
            if (next >= 0)
              go({ type: 'replace', screen: { name: 'fixcorners', params: { jobId, at: next, chain: 1 } } });
            else go({ type: 'back' });
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
  const sets = maxCardSets(
    6,
    cards.length,
    cards.some((c) => c.turns % 2 === 1),
  );
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
