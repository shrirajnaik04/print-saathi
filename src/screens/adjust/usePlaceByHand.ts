import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Job, JobAction } from '../../core/job/job';
import { freezeSizes } from '../../core/layout/flow';
import { clampCentre, snapBox, spotsFromPlan } from '../../core/layout/free';
import type { Box } from '../../core/layout/onePerPage';
import type { PrintPlan } from '../../core/plan/plan';
import { pageSize } from './place';

const MM = 72 / 25.4;
/** Held this long without moving, a photo lifts (owner, 2026-10-24: "press and hold"). */
export const HOLD_MS = 450;
/** A finger that moves further than this first is scrolling the page, not holding a photo. */
const SLOP_PX = 8;
/** Snapping distance to the guides (page middles, margins, other photos). */
const SNAP_MM = 2;

type Line = { x1: number; y1: number; x2: number; y2: number };
export type Lifted = { item: number; page: number; box: Box; guides: Line[] };

type Hold = {
  id: number;
  item: number;
  page: number;
  x: number;
  y: number;
  timer: ReturnType<typeof setTimeout>;
  lifted: boolean;
  el: HTMLElement;
  pxPerPt: number;
};

/**
 * Press and hold to place a photo anywhere on its page (owner, 2026-10-24; spec Part 5): a finger held still for
 * HOLD_MS lifts the photo, which then follows it, kept inside the margins and snapping to Word-like guides; lifting
 * the finger drops it there. The first drop fixes every photo where it is (the others stay). A finger that moves first
 * scrolls the page as usual; a cancelled touch drops nothing. The Move buttons do the same without dragging.
 */
export function usePlaceByHand(o: {
  enabled: boolean;
  plan: PrintPlan | null;
  job: Job | null;
  /** The strip of drawn pages (round 4): page n's paper is the <figure> in its `.adjust-sheet[data-page=n]`. */
  figure: RefObject<HTMLDivElement>;
  /** The blank space at the page's edges (mm), as the plan keeps it. */
  edgeMm: number;
  onChoose: (item: number) => void;
  save: (actions: JobAction[]) => Promise<unknown>;
  /**
   * What is placed (owner, round 5: ID cards too): by default photos, by item number. Otherwise [key]'s box on page
   * [page], the boxes it snaps to, and the change that places it at [box].
   */
  boxOf?: (key: number, page: number) => Box | undefined;
  othersOf?: (key: number, page: number) => Box[];
  place?: (key: number, page: number, box: Box) => JobAction[];
}) {
  const hold = useRef<Hold | null>(null);
  const [lifted, setLifted] = useState<Lifted | null>(null);
  const liftedNow = useRef<Lifted | null>(null);
  const setLift = (l: Lifted | null) => {
    liftedNow.current = l;
    setLifted(l);
  };
  // While a photo is lifted the page must not scroll under the finger (only then: before, the finger may scroll).
  useEffect(() => {
    const el = o.figure.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (hold.current?.lifted) e.preventDefault();
    };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, [o.figure.current]);
  useEffect(() => () => clearTimeout(hold.current?.timer), []);
  // The app put away mid-drag (screen off, another app, a call): the lift ends, nothing is dropped (review I7).
  useEffect(() => {
    const away = () => {
      if (hold.current) end();
    };
    const hidden = () => {
      if (document.hidden) away();
    };
    window.addEventListener('blur', away);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', away);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  const boxOf = (item: number, page: number) =>
    o.boxOf ? o.boxOf(item, page) : o.plan?.pages[page]?.placements.find((p) => p.itemIndex === item)?.box;
  const end = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
    setLift(null);
  };

  /** The actions that fix every photo where it is (once) and put [item] at [box] on top. */
  const placeActions = (item: number, box: Box): JobAction[] => {
    if (!o.plan || !o.job) return [];
    const spots = spotsFromPlan(o.plan, o.job.spots);
    const page = spots[item]?.page ?? 0;
    return [
      { type: 'setSpots', spots, sizes: { ...freezeSizes(o.plan), ...(o.job.sizes ?? {}) } },
      { type: 'placeItem', item, page, x: (box.x + box.w / 2) / MM, y: (box.y + box.h / 2) / MM },
    ];
  };

  /** [box] kept inside the margins of page [page], snapped to the guides near it unless [snap] is false. */
  const settle = (page: number, item: number, box: Box, snap = true): { box: Box; guides: Line[] } => {
    if (!o.plan) return { box, guides: [] };
    const size = pageSize(o.plan, page);
    const orientation = o.plan.pages[page]?.orientation ?? 'portrait';
    const paper = { id: o.plan.paper.id, wPt: o.plan.paper.wPt, hPt: o.plan.paper.hPt, edgeMm: o.edgeMm };
    const inside = (b: Box) => {
      const c = clampCentre({ x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h }, paper, orientation);
      return { ...b, x: c.x - b.w / 2, y: c.y - b.h / 2 };
    };
    if (!snap) return { box: inside(box), guides: [] };
    const others = o.othersOf
      ? o.othersOf(item, page)
      : (o.plan.pages[page]?.placements ?? []).filter((p) => p.itemIndex !== item).map((p) => p.box);
    const snapped = snapBox(inside(box), others, { w: size.w, h: size.h, e: o.edgeMm * MM }, SNAP_MM * MM);
    return { box: inside(snapped.box), guides: snapped.guides };
  };

  const handlers = (item: number, page: number) => ({
    onPointerDown: (e: PointerEvent) => {
      // A hold left by a pointer the WebView never ended never blocks the next press (review I7).
      if (hold.current && hold.current.id !== e.pointerId) end();
      if (!o.enabled || !o.plan || hold.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.adjust-handle, .adjust-side')) return;
      const paperEl = o.figure.current?.querySelector(`.adjust-sheet[data-page="${page}"] figure`);
      const rect = paperEl?.getBoundingClientRect();
      if (!rect) return;
      const el = e.currentTarget as HTMLElement;
      const h: Hold = {
        id: e.pointerId,
        item,
        page,
        x: e.clientX,
        y: e.clientY,
        lifted: false,
        el,
        pxPerPt: rect.width / pageSize(o.plan, page).w,
        timer: setTimeout(() => {
          const box = boxOf(item, page);
          if (hold.current !== h || !box) return;
          h.lifted = true;
          el.setPointerCapture?.(h.id);
          o.onChoose(item);
          setLift({ item, page, box, guides: [] });
        }, HOLD_MS),
      };
      hold.current = h;
    },
    onPointerMove: (e: PointerEvent) => {
      const h = hold.current;
      if (!h || h.id !== e.pointerId) return;
      if (!h.lifted) {
        if (Math.hypot(e.clientX - h.x, e.clientY - h.y) > SLOP_PX) end();
        return;
      }
      const box = boxOf(h.item, h.page);
      if (!box) return;
      const moved = {
        ...box,
        x: box.x + (e.clientX - h.x) / h.pxPerPt,
        y: box.y + (e.clientY - h.y) / h.pxPerPt,
      };
      const s = settle(h.page, h.item, moved);
      setLift({ item: h.item, page: h.page, box: s.box, guides: s.guides });
    },
    onPointerUp: (e: PointerEvent) => {
      const h = hold.current;
      if (!h || h.id !== e.pointerId) return;
      const l = liftedNow.current;
      const from = boxOf(h.item, h.page);
      end();
      // Held but not moved: nothing changes (the job is not placed by hand by a look).
      const moved = !!l && !!from && (Math.abs(l.box.x - from.x) > 0.01 || Math.abs(l.box.y - from.y) > 0.01);
      if (h.lifted && l && moved) void o.save(placeOf(l.item, l.page, l.box));
    },
    // The system took the touch (a scroll, a second finger, the app paused): nothing is dropped.
    onPointerCancel: (e: PointerEvent) => {
      if (hold.current?.id === e.pointerId) end();
    },
    onLostPointerCapture: (e: PointerEvent) => {
      // Lost while lifted without a finger-up (the element was redrawn away): nothing is dropped.
      if (hold.current?.id === e.pointerId && hold.current.lifted && !hold.current.el.isConnected) end();
    },
  });

  /** Move buttons (no dragging): [item] by (dx, dy) mm on its page, kept inside and placed by hand. */
  const nudge = (item: number, page: number, dxMm: number, dyMm: number) => {
    const box = boxOf(item, page);
    if (!box) return;
    // Exactly 2 mm a tap: no snapping (it could pull the photo straight back).
    const s = settle(page, item, { ...box, x: box.x + dxMm * MM, y: box.y + dyMm * MM }, false);
    void o.save(placeOf(item, page, { ...s.box }));
  };

  // A second finger (a pinch to zoom) ends a hold that has not lifted the photo yet.
  /** The change that puts [key] at [box]: a photo placed by hand, or what the caller says (ID cards). */
  const placeOf = (key: number, page: number, box: Box) => (o.place ? o.place(key, page, box) : placeActions(key, box));
  /** [box] kept inside the margins of page [page], not snapped (a paste, owner round 5). */
  const inside = (page: number, box: Box) => settle(page, -1, box, false).box;
  return { lifted, handlers, nudge, placeActions, cancel: end, inside };
}
