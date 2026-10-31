// The motion layer every view uses: the two springs, the live reduced-motion flag, FLIP and the "animation runs" gate.
// Only transform and opacity move; see "Motion" in docs/design.md and docs/research/motion.md for why there is no library.

import { type RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

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

/** How long the entrance cascade runs (the delays of .col, .slot, .trow and .tgroup in style.css). */
const CASCADE_MS = 2200;

/** Whether the first entrance cascade is over; after it, whatever comes (cards, rows, a view switched to) enters without its delay. */
export function useBooted(): boolean {
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setBooted(true), CASCADE_MS);
    return () => clearTimeout(timer);
  }, []);
  return booted;
}

/** The transform that lays an element whose rect is `to` over `from`: translate and scale, with transform-origin 0 0. */
export function morphTransform(from: DOMRectReadOnly, to: DOMRectReadOnly): string {
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
}

/** `el` grows out of `from` into its place with GLIDE; nothing moves under reduced motion. */
export function growFrom(el: HTMLElement, from: DOMRectReadOnly): void {
  if (reducedMotion()) return;
  el.animate([{ transform: morphTransform(from, el.getBoundingClientRect()) }, { transform: "none" }], {
    duration: GLIDE.duration,
    easing: GLIDE.easing,
  });
}

/**
 * `el` shrinks onto `to` with GLIDE, holding the board's gate meanwhile, so a snapshot that arrives on the way renders after it.
 * It carries on from wherever a grow still running has it. Resolves when it has shrunk; at once under reduced motion.
 */
export function shrinkTo(el: HTMLElement, to: DOMRectReadOnly): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  const now = getComputedStyle(el).transform;
  for (const animation of el.getAnimations()) animation.cancel();
  const shrink = el.animate([{ transform: now }, { transform: morphTransform(to, el.getBoundingClientRect()) }], {
    duration: GLIDE.duration,
    easing: GLIDE.easing,
    fill: "forwards",
  });
  const done = shrink.finished.then(
    () => undefined,
    () => undefined,
  );
  holdWhile(done);
  return done;
}

// A card slides out to the right and shrinks; a row slides out and folds flat.
const LEAVE: Record<"card" | "row", Keyframe[]> = {
  card: [
    { transform: "none", opacity: 1 },
    { transform: "translateX(30px) scale(.96) rotate(2deg)", opacity: 1, offset: 0.35 },
    { transform: "translateX(260px) scale(.5) rotate(10deg)", opacity: 0 },
  ],
  row: [
    { transform: "none", opacity: 1 },
    { transform: "translateX(18px)", opacity: 1, offset: 0.3 },
    { transform: "translateX(140px) scaleY(.2)", opacity: 0 },
  ],
};

/**
 * The card (or row) leaves for "видях", holding the board's gate meanwhile, so a snapshot that arrives on the way renders
 * after it. Null under reduced motion, when nothing moves. It stays hidden until `left` settles (the PR marked seen); if it
 * is still there a hold later, the PR stayed, so it comes back.
 */
export function slideOut(el: HTMLElement, left: () => Promise<void>, shape: "card" | "row" = "card"): void {
  if (reducedMotion()) {
    left().catch(() => {});
    return;
  }
  const exit = el.animate(LEAVE[shape], { duration: GLIDE.duration, easing: GLIDE.easing, fill: "forwards", composite: "add" });
  holdWhile(exit.finished);
  exit.finished
    .then(left)
    .then(() => setTimeout(() => exit.cancel(), MAX_HOLD_MS))
    .catch(() => exit.cancel());
}

/** Whether `rect` has a width and crosses a viewport of `w` × `h`. */
export function visibleIn(rect: DOMRectReadOnly, w: number, h: number): boolean {
  return rect.width > 0 && rect.bottom > 0 && rect.top < h && rect.right > 0 && rect.left < w;
}

/** How far apart the flyers set off, top to bottom, and the latest any sets off. */
const STAGGER_MS = 18;
const MAX_STAGGER_MS = 260;

export type Landing = { pairs: { key: string; delay: number }[]; leaving: string[]; arriving: string[] };

/** Which lifted keys land on a target, which leave with none, and which targets arrive with no flyer. */
export function planLanding(flyerKeys: string[], targetKeys: string[]): Landing {
  const targets = new Set(targetKeys);
  const lifted = new Set(flyerKeys);
  return {
    pairs: flyerKeys.filter((key) => targets.has(key)).map((key, i) => ({ key, delay: Math.min(i * STAGGER_MS, MAX_STAGGER_MS) })),
    leaving: flyerKeys.filter((key) => !targets.has(key)),
    arriving: targetKeys.filter((key) => !lifted.has(key)),
  };
}

/** The CSS entrance keyframes (style.css): a view switched to lands instead of entering from the start. */
const ENTRANCES = new Set(["col-enter", "enter", "row-enter"]);

/** A copy of a card or row, lifted into the effects layer where the original was, by the original's FLIP key. */
export type Flyer = { key: string; from: DOMRectReadOnly; el: HTMLElement };

/** The box of an absolutely placed element at `rect`; the effects layer covers the viewport, so viewport coordinates. */
function box(rect: DOMRectReadOnly): Keyframe {
  return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` };
}

/**
 * Copies every [data-flip^="pr:"] under `root` that shows in the viewport into `layer`, on its rect, before the old view goes.
 * A copy is only a picture: no key, id, focus or animations of its own. Nothing is lifted under reduced motion.
 */
export function liftFlyers(root: HTMLElement, layer: HTMLElement): Flyer[] {
  if (reducedMotion()) return [];
  const flyers: Flyer[] = [];
  root.querySelectorAll<HTMLElement>('[data-flip^="pr:"]').forEach((el) => {
    const from = el.getBoundingClientRect();
    if (!visibleIn(from, innerWidth, innerHeight)) return;
    const copy = el.cloneNode(true) as HTMLElement;
    copy.removeAttribute("data-flip");
    copy.classList.remove("ghost");
    copy.classList.add("flyer");
    copy.querySelectorAll("[id]").forEach((child) => child.removeAttribute("id"));
    copy.removeAttribute("id");
    copy.removeAttribute("tabindex");
    copy.inert = true;
    copy.setAttribute("aria-hidden", "true");
    // A row lays its cells on the table's subgrid, which the layer has not: it keeps the tracks it had.
    Object.assign(copy.style, box(from), { gridTemplateColumns: getComputedStyle(el).gridTemplateColumns });
    layer.appendChild(copy);
    flyers.push({ key: el.dataset.flip!, from, el: copy });
  });
  return flyers;
}

/** The landing under way: its flyers and every animation it started, so a switch in the middle can end it at once. */
let landing: { flyers: HTMLElement[]; animations: Animation[] } | null = null;

/** Ends the landing under way at once: the flyers go, the targets show. */
export function finishLanding(): void {
  const current = landing;
  landing = null;
  if (!current) return;
  for (const animation of current.animations) animation.finish();
  for (const el of current.flyers) el.remove();
}

/**
 * The view under `root` has just replaced the one the flyers were lifted from: its entrances are dropped (nothing enters from the
 * start), each flyer's box glides onto the element with its key and hands over to it, a flyer with none falls away, an element
 * with no flyer bounces in, and the columns, panel and group heads rise a little. Holds the board's gate until it is all over.
 */
export function land(root: HTMLElement, flyers: Flyer[]): Promise<void> {
  finishLanding();
  if (reducedMotion()) {
    flyers.forEach((flyer) => flyer.el.remove());
    return Promise.resolve();
  }
  for (const animation of root.getAnimations({ subtree: true })) {
    if (animation instanceof CSSAnimation && ENTRANCES.has(animation.animationName)) animation.cancel();
  }
  const targets = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>('[data-flip^="pr:"]').forEach((el) => targets.set(el.dataset.flip!, el));
  const lifted = new Map(flyers.map((flyer) => [flyer.key, flyer]));
  const plan = planLanding([...lifted.keys()], [...targets.keys()]);
  // Measured before anything moves, so every flyer heads for where its target rests.
  const rests = new Map(plan.pairs.map(({ key }) => [key, targets.get(key)!.getBoundingClientRect()]));
  const animations: Animation[] = [];
  const run = (el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = el.animate(keyframes, options);
    animations.push(animation);
    return animation;
  };
  // A flyer goes as soon as it has handed over or fallen away, not when the whole landing is over.
  const drop = (flyer: Flyer, last: Animation) => {
    void last.finished.then(
      () => flyer.el.remove(),
      () => {},
    );
  };
  const handOver = Math.round(GLIDE.duration * 0.25);

  for (const { key, delay } of plan.pairs) {
    const flyer = lifted.get(key)!;
    const arrive = delay + GLIDE.duration;
    // The box (tint, stripe, shadow) travels; what it showed fades out early, and the target shows once the box is there.
    flyer.el.querySelectorAll(":scope > .card > *, :scope > .tc").forEach((bit) =>
      run(bit, [{ opacity: 1 }, { opacity: 0 }], { duration: GLIDE.duration * 0.2, delay, fill: "both" }),
    );
    run(flyer.el, [box(flyer.from), box(rests.get(key)!)], { duration: GLIDE.duration, delay, easing: GLIDE.easing, fill: "both" });
    drop(flyer, run(flyer.el, [{ opacity: 1 }, { opacity: 0 }], { duration: handOver, delay: arrive, fill: "both" }));
    run(targets.get(key)!, [{ opacity: 0 }, { opacity: 0, offset: arrive / (arrive + handOver) }, { opacity: 1 }], {
      duration: arrive + handOver,
    });
  }
  for (const key of plan.leaving) {
    const flyer = lifted.get(key)!;
    drop(
      flyer,
      run(flyer.el, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(12px) scale(.86)" }], {
        duration: GLIDE.duration,
        easing: GLIDE.easing,
        fill: "both",
      }),
    );
  }
  plan.arriving.forEach((key, i) =>
    run(targets.get(key)!, [{ opacity: 0, transform: "translateY(18px) scale(.96)" }, { opacity: 1, transform: "none" }], {
      duration: BOUNCE.duration,
      delay: 300 + Math.min(i, 24) * 28,
      easing: BOUNCE.easing,
      fill: "backwards",
    }),
  );
  root.querySelectorAll(".col, .tpanel, .tgroup").forEach((el, i) =>
    run(el, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], {
      duration: GLIDE.duration,
      delay: Math.min(i, 8) * 45,
      easing: GLIDE.easing,
      fill: "backwards",
    }),
  );

  const current = { flyers: flyers.map((flyer) => flyer.el), animations };
  landing = current;
  const done = Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => {
    if (landing === current) landing = null;
  });
  holdWhile(done);
  return done;
}
