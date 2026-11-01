// Dragging an element onto a drop zone with the pointer, so a mouse, a touchpad and touch all work. It knows elements by their
// FLIP key and nothing of what they show; see "Motion" and "Interaction" in docs/design.md.

import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { dropSpin, nextTilt, overZone, pastThreshold } from "./drag.js";
import { dropInto, liftClone, MAX_HOLD_MS, reducedMotion, returnTo } from "./motion.js";

/** Whether the zone shows, and whether the pointer is over it. */
export type ZoneState = "off" | "on" | "over";

export type Drag = {
  /** The FLIP keys of the elements to hide: the one being dragged, and those dropped into the zone and on their way out. */
  held: ReadonlySet<string>;
  zone: ZoneState;
  /**
   * Watches a press on `el`, a [data-flip] element, from its `pointerdown`: it becomes a drag once the pointer has moved past
   * the threshold, and `onDrop` runs, with the zone's rect, once it has gone into the zone. A press on a link or a button in it
   * is left alone.
   */
  grab(event: PointerEvent, el: HTMLElement, onDrop: (zone: DOMRectReadOnly) => Promise<void>): void;
};

type Press = {
  key: string;
  /** The FLIP key of the [data-flip] element `el` was in (its column): the copy only comes back to it there. */
  home: string | undefined;
  el: HTMLElement;
  pointerId: number;
  x0: number;
  y0: number;
  lastX: number;
  tilt: number;
  over: boolean;
  /** The copy in the effects layer, once the press has become a drag. */
  copy: HTMLElement | null;
  onDrop(zone: DOMRectReadOnly): Promise<void>;
  /** Stops listening to the pointer and the keyboard. */
  stop(): void;
};

/** The element under a FLIP key now: what was dragged may have been re-created or moved meanwhile. */
function byKey(key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-flip="${CSS.escape(key)}"]`);
}

/** The FLIP key of the [data-flip] element `el` is in. */
function homeOf(el: HTMLElement): string | undefined {
  return el.parentElement?.closest<HTMLElement>("[data-flip]")?.dataset.flip;
}

/** The rect of a fixed element in the viewport, leaving out its transforms, so its entrance and "over" growth do not move it. */
function layoutRect(el: HTMLElement): DOMRect {
  return new DOMRect(el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight);
}

/** Eats the click the browser sends after the `pointerup` that ended a drag, so it opens nothing. */
function swallowClick(): void {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => removeEventListener("click", swallow, { capture: true }), 0);
}

/** Eats the click after the pointer `pointerId`, still down, comes up; a drag put back with Esc must not open anything either. */
function swallowClickAfter(pointerId: number): void {
  const after = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    removeEventListener("pointerup", after, { capture: true });
    removeEventListener("pointercancel", after, { capture: true });
    if (event.type === "pointerup") swallowClick();
  };
  addEventListener("pointerup", after, { capture: true });
  addEventListener("pointercancel", after, { capture: true });
}

/**
 * Drags copies, lifted into `layer`, onto `zone`, which shows while a drag runs; Esc puts the copy back, before any other
 * shortcut and even in a field. The original stays hidden (`held`) until its copy has come back onto it, or, once dropped into
 * the zone, until `onDrop` has settled and a gate hold more has passed for the render that takes it away; if it is still there
 * then, it shows again.
 */
export function useDrag(layer: RefObject<HTMLElement | null>, zone: RefObject<HTMLElement | null>): Drag {
  const press = useRef<Press | null>(null);
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  const [zoneState, setZoneState] = useState<ZoneState>("off");
  const hold = (key: string, on: boolean) =>
    setHeld((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  /** Ends the press: dropped into the zone or not, and whether the pointer is still down (Esc). */
  const end = (p: Press, into: boolean, stillDown = false) => {
    p.stop();
    press.current = null;
    const { copy } = p;
    if (!copy) return;
    if (stillDown) swallowClickAfter(p.pointerId);
    else swallowClick();
    document.documentElement.classList.remove("dragging");
    setZoneState("off");
    const from = copy.style.transform;
    if (into && zone.current) {
      // Taken now: the zone goes as soon as the drag ends.
      const target = layoutRect(zone.current);
      void dropInto(copy, from, target, dropSpin(p.tilt))
        .then(() => p.onDrop(target))
        .then(
          () => setTimeout(() => hold(p.key, false), MAX_HOLD_MS),
          () => hold(p.key, false),
        );
      return;
    }
    // Back onto the element if it is still where it was dragged from, wherever it has moved to there; else it fades.
    const now = byKey(p.key);
    const to = now && homeOf(now) === p.home ? now.getBoundingClientRect() : null;
    void returnTo(copy, from, to).then(() => hold(p.key, false));
  };

  const move = (p: Press, event: PointerEvent, onKey: (e: KeyboardEvent) => void) => {
    const dx = event.clientX - p.x0;
    const dy = event.clientY - p.y0;
    if (!p.copy) {
      if (!pastThreshold(dx, dy) || !layer.current) return;
      p.copy = liftClone(p.el, layer.current);
      // Moves and the release reach the element even off the window. Taken only now: a press that never got here stays a
      // click, which a capture taken on `pointerdown` would send to the slot instead of the card.
      p.el.setPointerCapture(p.pointerId);
      addEventListener("keydown", onKey, { capture: true });
      hold(p.key, true);
      setZoneState("on");
      document.documentElement.classList.add("dragging");
      getSelection()?.removeAllRanges();
    }
    p.tilt = reducedMotion() ? 0 : nextTilt(p.tilt, event.clientX - p.lastX);
    p.lastX = event.clientX;
    p.copy.style.transform = `translate(${dx}px, ${dy}px) rotate(${p.tilt}deg)`;
    const over = !!zone.current && overZone({ x: event.clientX, y: event.clientY }, layoutRect(zone.current));
    if (over === p.over) return;
    p.over = over;
    setZoneState(over ? "over" : "on");
  };

  const grab: Drag["grab"] = (event, el, onDrop) => {
    if (press.current || event.button !== 0 || !event.isPrimary) return;
    if (event.target instanceof Element && event.target.closest("a, button")) return;
    const key = el.dataset.flip;
    if (!key) return;
    const ours = (e: PointerEvent) => e.pointerId === p.pointerId && press.current === p;
    const onMove = (e: PointerEvent) => ours(e) && move(p, e, onKey);
    const onUp = (e: PointerEvent) => ours(e) && end(p, p.over);
    const onCancel = (e: PointerEvent) => ours(e) && end(p, false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || press.current !== p) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      end(p, false, true);
    };
    // A render that moves or re-creates the element (a snapshot during the drag) takes the capture away: it is set again on the
    // element under the key, and only a pointer that is no longer down ends the drag. Touch has the pointer captured by what the
    // finger pressed, inside `el`; that capture moving to `el` bubbles up as a loss, which it is not.
    const onLost = (e: PointerEvent) => {
      if (!ours(e) || e.target !== p.el || !p.copy) return;
      const now = byKey(p.key) ?? p.el;
      try {
        now.setPointerCapture(p.pointerId);
      } catch {
        end(p, false);
        return;
      }
      if (now === p.el) return;
      p.el.removeEventListener("lostpointercapture", onLost);
      p.el = now;
      now.addEventListener("lostpointercapture", onLost);
    };
    const p: Press = {
      key,
      home: homeOf(el),
      el,
      pointerId: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      lastX: event.clientX,
      tilt: 0,
      over: false,
      copy: null,
      onDrop,
      stop() {
        removeEventListener("pointermove", onMove);
        removeEventListener("pointerup", onUp);
        removeEventListener("pointercancel", onCancel);
        removeEventListener("keydown", onKey, { capture: true });
        p.el.removeEventListener("lostpointercapture", onLost);
        if (p.el.hasPointerCapture(p.pointerId)) p.el.releasePointerCapture(p.pointerId);
      },
    };
    press.current = p;
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onCancel);
    el.addEventListener("lostpointercapture", onLost);
  };

  useEffect(
    () => () => {
      const p = press.current;
      if (!p) return;
      p.stop();
      p.copy?.remove();
      document.documentElement.classList.remove("dragging");
    },
    [],
  );

  return { held, zone: zoneState, grab };
}
