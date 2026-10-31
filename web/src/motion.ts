// The motion layer every view uses: the two springs, the live reduced-motion flag, FLIP and the "animation runs" gate.
// Only transform and opacity move; see "Motion" in docs/design.md and docs/research/motion.md for why there is no library.

import { type RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";

export type Spring = { easing: string; duration: number };

/** A damped spring sampled into a CSS linear() easing; falls back to an overshooting bezier where linear() is missing. */
export function spring(stiffness: number, damping: number): Spring {
  let x = 0;
  let v = 0;
  const dt = 1 / 120;
  const samples: number[] = [];
  let t = 0;
  for (; t < 3; t += dt) {
    v += (stiffness * (1 - x) - damping * v) * dt;
    x += v * dt;
    samples.push(x);
    if (t > 0.2 && Math.abs(1 - x) < 0.002 && Math.abs(v) < 0.02) break;
  }
  const step = Math.max(1, Math.floor(samples.length / 48));
  const points = ["0", ...samples.filter((_, i) => i % step === 0).map((s) => s.toFixed(3)), "1"];
  const easing = `linear(${points.join(", ")})`;
  const ok = typeof CSS !== "undefined" && CSS?.supports("transition-timing-function", easing);
  return { easing: ok ? easing : "cubic-bezier(.34,1.56,.64,1)", duration: Math.round(t * 1000) };
}

/** Something goes to a new place. */
export const GLIDE = spring(260, 24);
/** Something arrives or is dropped. */
export const BOUNCE = spring(320, 16);

export type Pos = { x: number; y: number };
export type Delta = { dx: number; dy: number };

/** How far each key that moved must be put back to start where it was: old minus new; new, gone and sub-pixel moves are left out. */
export function flipDeltas(before: Map<string, Pos>, after: Map<string, Pos>): Map<string, Delta> {
  const deltas = new Map<string, Delta>();
  for (const [key, now] of after) {
    const old = before.get(key);
    if (!old) continue;
    const dx = old.x - now.x;
    const dy = old.y - now.y;
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) deltas.set(key, { dx, dy });
  }
  return deltas;
}

/** The longest a gate holds for one animation, even if it never ends. */
const MAX_HOLD_MS = 1500;

export type Gate<T> = {
  /** Lets `value` through now, or, while held, keeps it as the one to let through when the hold ends. */
  push(value: T): void;
  /** Holds until `done` settles (or 1.5s pass); holds stack, so the gate opens after the last one. */
  hold(done: Promise<unknown>): void;
  subscribe(fn: (value: T) => void): () => void;
};

/**
 * The "animation runs" gate: while animations are registered, arriving values wait and only the last one is let through
 * when they end, so the board renders once after, say, a card has left, and FLIP glides whatever moved.
 */
export function createGate<T>(): Gate<T> {
  const listeners = new Set<(value: T) => void>();
  let holds = 0;
  let waiting: { value: T } | null = null;
  const emit = (value: T) => listeners.forEach((fn) => fn(value));
  const release = () => {
    holds -= 1;
    if (holds > 0 || !waiting) return;
    const { value } = waiting;
    waiting = null;
    emit(value);
  };
  return {
    push(value) {
      if (holds > 0) waiting = { value };
      else emit(value);
    },
    hold(done) {
      holds += 1;
      let released = false;
      const once = () => {
        if (released) return;
        released = true;
        clearTimeout(timer);
        release();
      };
      const timer = setTimeout(once, MAX_HOLD_MS);
      done.then(once, once);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const reduceQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

/** Whether the OS asks for reduced motion, read at the moment: switching the setting applies without a reload. */
export function reducedMotion(): boolean {
  return reduceQuery?.matches ?? false;
}

/** The board's gate: `useDashboard` lets snapshots through it, animations that must finish first hold it. */
const board = createGate<() => void>();
board.subscribe((render) => render());

/** Holds the board's snapshots until `done` settles. */
export function holdWhile(done: Promise<unknown>): void {
  board.hold(done);
}

/** Runs `render` now, or after the animations holding the board have ended if a newer one has not replaced it by then. */
export function afterMotion(render: () => void): void {
  board.push(render);
}

/**
 * Hands the springs to CSS (`--glide`, `--bounce` and their `-ms` durations) for keyframes and transitions,
 * and pauses the endless keyframes (pulse, halo, drift) while the page is hidden.
 */
export function startMotion(root: HTMLElement): void {
  const style = root.style;
  style.setProperty("--glide", GLIDE.easing);
  style.setProperty("--glide-ms", `${GLIDE.duration}ms`);
  style.setProperty("--bounce", BOUNCE.easing);
  style.setProperty("--bounce-ms", `${BOUNCE.duration}ms`);
  const pause = () => root.classList.toggle("paused", document.hidden);
  document.addEventListener("visibilitychange", pause);
  pause();
}

/** The FLIP key of a PR: the same in every view, so its card and its row are one thing that moves. */
export function prFlipKey(pr: { repo: string; number: number }): string {
  return `pr:${pr.repo}#${pr.number}`;
}

/** Position in the layout, ignoring transforms but not scrolling, relative to `root` (the [data-flip-root] FLIP runs on). */
export function layoutPos(el: HTMLElement, root: Element): Pos {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (!parent) break;
    if (parent !== root) {
      x -= parent.scrollLeft;
      y -= parent.scrollTop;
    }
    node = parent;
  }
  return { x, y };
}

/**
 * FLIP: after every commit, the elements marked [data-flip="<key>"] under `root` that moved glide from where they were.
 * The offset is added to whatever runs (`composite: "add"`), so a reorder in the middle of another one carries on without a jump.
 * An element inside another [data-flip] one (a card in a column) moves by its own offset less its container's, which the container
 * already animates; so a card changing column glides across. An element that came back under a known key (a card that changed
 * column is a new node) glides and skips its entrance. A change of `reset` (a new view) and reduced motion only record positions,
 * and so does scrolling a column, so that the next commit does not glide what only scrolled.
 */
export function useFlip(root: RefObject<HTMLElement>, reset?: unknown): void {
  const before = useRef(new Map<string, { pos: Pos; el: HTMLElement }>());
  const last = useRef(reset);
  useEffect(() => {
    const rootEl = root.current;
    if (!rootEl) return;
    let frame = 0;
    const record = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => (before.current = measure(rootEl)));
    };
    rootEl.addEventListener("scroll", record, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      rootEl.removeEventListener("scroll", record, { capture: true });
    };
  }, []);
  useLayoutEffect(() => {
    const rootEl = root.current;
    if (!rootEl) return;
    const fresh = last.current !== reset;
    last.current = reset;
    const now = measure(rootEl);
    const old = before.current;
    before.current = now;
    if (fresh || reducedMotion()) return;
    const positions = (items: typeof now) => new Map([...items].map(([key, { pos }]) => [key, pos]));
    const deltas = flipDeltas(positions(old), positions(now));
    for (const [key, { el }] of now) {
      if (old.has(key) && old.get(key)!.el !== el) skipEntrance(el);
      const delta = deltas.get(key);
      if (!delta) continue;
      const outer = el.parentElement?.closest<HTMLElement>("[data-flip]");
      const carried = outer && rootEl.contains(outer) ? deltas.get(outer.dataset.flip!) : undefined;
      const dx = delta.dx - (carried?.dx ?? 0);
      const dy = delta.dy - (carried?.dy ?? 0);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
        duration: GLIDE.duration,
        easing: GLIDE.easing,
        composite: "add",
      });
    }
  });
}

/** Where every [data-flip] element under `root` is now, by key. */
function measure(root: HTMLElement): Map<string, { pos: Pos; el: HTMLElement }> {
  const now = new Map<string, { pos: Pos; el: HTMLElement }>();
  root.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => now.set(el.dataset.flip!, { pos: layoutPos(el, root), el }));
  return now;
}

/** Ends the CSS entrance of an element that is not new, only re-created. */
function skipEntrance(el: HTMLElement): void {
  for (const animation of el.getAnimations()) if (animation instanceof CSSAnimation) animation.finish();
}

/**
 * The card leaves for "видях": it slides out to the right and shrinks, holding the board's gate meanwhile, so a snapshot
 * that arrives on the way renders after it. Null under reduced motion, when nothing moves. The card stays hidden until `left`
 * settles (the PR marked seen); if it is still on the board a hold later, the PR stayed, so the card comes back.
 */
export function slideOut(el: HTMLElement, left: () => Promise<void>): void {
  if (reducedMotion()) {
    left().catch(() => {});
    return;
  }
  const exit = el.animate(
    [
      { transform: "none", opacity: 1 },
      { transform: "translateX(30px) scale(.96) rotate(2deg)", opacity: 1, offset: 0.35 },
      { transform: "translateX(260px) scale(.5) rotate(10deg)", opacity: 0 },
    ],
    { duration: GLIDE.duration, easing: GLIDE.easing, fill: "forwards", composite: "add" },
  );
  holdWhile(exit.finished);
  exit.finished
    .then(left)
    .then(() => setTimeout(() => exit.cancel(), MAX_HOLD_MS))
    .catch(() => exit.cancel());
}
