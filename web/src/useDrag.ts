// Dragging an element onto a drop zone with the pointer, so a mouse, a touchpad and touch all work. It knows elements by their
// FLIP key and nothing of what they show; see "Drag to видях" in docs/design.md.

import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { type Box, dropSpin, nextTilt, overZone, pastThreshold } from "./drag.js";
import { dropInto, liftClone, MAX_HOLD_MS, reducedMotion, returnTo } from "./motion.js";

/** Whether the zone shows, and whether the pointer is over it. */
export type ZoneState = "off" | "on" | "over";

export type Drag = {
  /** The FLIP keys of the elements to hide: the one being dragged, and those dropped into the zone and on their way out. */
  held: ReadonlySet<string>;
  zone: ZoneState;
  /**
   * Watches a press on `el`, a [data-flip] element, from its `pointerdown`: it becomes a drag once the pointer has moved past
   * the threshold, and `onDrop` runs when it is dropped into the zone. A press on a link or a button in it is left alone.
   */
  grab(event: PointerEvent, el: HTMLElement, onDrop: () => Promise<void>): void;
  /** Ends the drag under way as if it were dropped outside the zone; false when there is none. */
  cancel(): boolean;
};

type Press = {
  key: string;
  el: HTMLElement;
  pointerId: number;
  x0: number;
  y0: number;
  lastX: number;
  tilt: number;
  over: boolean;
  /** The copy in the effects layer, once the press has become a drag. */
  copy: HTMLElement | null;
  onDrop(): Promise<void>;
  /** Stops listening to the pointer. */
  stop(): void;
};

/** The element under a FLIP key now: what was dragged may have been re-created or moved meanwhile. */
function byKey(key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-flip="${CSS.escape(key)}"]`);
}

/** The box of a fixed element in the viewport, leaving out its transforms, so its entrance and "over" growth do not move it. */
function layoutBox(el: HTMLElement): Box {
  return { left: el.offsetLeft, top: el.offsetTop, right: el.offsetLeft + el.offsetWidth, bottom: el.offsetTop + el.offsetHeight };
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

/**
 * Drags copies, lifted into `layer`, onto `zone`, which shows while a drag runs. The original stays hidden (`held`) until its
 * copy has come back onto it, or, once dropped into the zone, until `onDrop` has settled and a gate hold more has passed for
 * the render that takes it away; if it is still there then, it shows again.
 */
export function useDrag(layer: RefObject<HTMLElement>, zone: RefObject<HTMLElement>): Drag {
  const press = useRef<Press | null>(null);
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  const [zoneState, setZone] = useState<ZoneState>("off");
  const hold = (key: string, on: boolean) =>
    setHeld((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const end = (p: Press, into: boolean) => {
    p.stop();
    press.current = null;
    const { copy } = p;
    if (!copy) return;
    swallowClick();
    document.documentElement.classList.remove("dragging");
    setZone("off");
    const from = copy.style.transform;
    const target = into && zone.current ? layoutBox(zone.current) : null;
    if (target) {
      const rect = new DOMRect(target.left, target.top, target.right - target.left, target.bottom - target.top);
      void dropInto(copy, from, rect, dropSpin(p.tilt))
        .then(p.onDrop)
        .then(
          () => setTimeout(() => hold(p.key, false), MAX_HOLD_MS),
          () => hold(p.key, false),
        );
    } else {
      void returnTo(copy, from, byKey(p.key)?.getBoundingClientRect() ?? null).then(() => hold(p.key, false));
    }
  };

  const move = (p: Press, event: PointerEvent) => {
    const dx = event.clientX - p.x0;
    const dy = event.clientY - p.y0;
    if (!p.copy) {
      if (!pastThreshold(dx, dy) || !layer.current) return;
      p.copy = liftClone(p.el, layer.current);
      // Moves and the release reach the element even off the window; a press that never got here stays a click.
      p.el.setPointerCapture(p.pointerId);
      hold(p.key, true);
      setZone("on");
      document.documentElement.classList.add("dragging");
      getSelection()?.removeAllRanges();
    }
    p.tilt = reducedMotion() ? 0 : nextTilt(p.tilt, event.clientX - p.lastX);
    p.lastX = event.clientX;
    p.copy.style.transform = `translate(${dx}px, ${dy}px) rotate(${p.tilt}deg)`;
    const over = !!zone.current && overZone({ x: event.clientX, y: event.clientY }, layoutBox(zone.current));
    if (over === p.over) return;
    p.over = over;
    setZone(over ? "over" : "on");
  };

  const grab: Drag["grab"] = (event, el, onDrop) => {
    if (press.current || event.button !== 0 || !event.isPrimary) return;
    if (event.target instanceof Element && event.target.closest("a, button")) return;
    const key = el.dataset.flip;
    if (!key) return;
    const ours = (e: PointerEvent) => e.pointerId === p.pointerId && press.current === p;
    const onMove = (e: PointerEvent) => ours(e) && move(p, e);
    const onUp = (e: PointerEvent) => ours(e) && end(p, p.over);
    const onCancel = (e: PointerEvent) => ours(e) && end(p, false);
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

  const cancel = () => {
    const p = press.current;
    if (!p) return false;
    end(p, false);
    return p.copy !== null;
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

  return { held, zone: zoneState, grab, cancel };
}
