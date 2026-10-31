// The motion layer every view uses: the two springs, the live reduced-motion flag, FLIP and the "animation runs" gate.
// Only transform and opacity move, but for the view switch's flyers, which stretch their box outside the flow;
// see "Motion" in docs/design.md and docs/research/motion.md for why there is no library.

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
export const MAX_HOLD_MS = 1500;

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

/** Every card or row of a PR, in any view. */
const PR_FLIP = '[data-flip^="pr:"]';

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

/** A copy of `el` that is only a picture, with the class `kind`: no key, id, focus or animations of its own. */
function picture(el: HTMLElement, kind: string): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.removeAttribute("data-flip");
  copy.classList.remove("ghost");
  copy.classList.add(kind);
  copy.querySelectorAll("[id]").forEach((child) => child.removeAttribute("id"));
  copy.removeAttribute("id");
  copy.removeAttribute("tabindex");
  copy.inert = true;
  copy.setAttribute("aria-hidden", "true");
  return copy;
}

/**
 * Copies every [data-flip^="pr:"] under `root` that shows in the viewport into `layer`, on its rect, before the old view goes.
 * Nothing is lifted under reduced motion.
 */
export function liftFlyers(root: HTMLElement, layer: HTMLElement): Flyer[] {
  if (reducedMotion()) return [];
  const flyers: Flyer[] = [];
  root.querySelectorAll<HTMLElement>(PR_FLIP).forEach((el) => {
    const from = el.getBoundingClientRect();
    if (!visibleIn(from, innerWidth, innerHeight)) return;
    const copy = picture(el, "flyer");
    // A row lays its cells on the table's subgrid, which the layer has not: it keeps the tracks it had.
    Object.assign(copy.style, box(from), { gridTemplateColumns: getComputedStyle(el).gridTemplateColumns });
    layer.appendChild(copy);
    flyers.push({ key: el.dataset.flip!, from, el: copy });
  });
  return flyers;
}

/** How much a dragged copy grows as it is picked up. */
const LIFTED_SCALE = 1.05;

/**
 * A picture of `el` in `layer`, exactly on its rect, for dragging: it moves by its `transform`, which the caller sets, and
 * rises a little with GLIDE (by `scale`, so the two do not fight); it does not rise under reduced motion.
 */
export function liftClone(el: HTMLElement, layer: HTMLElement): HTMLElement {
  const copy = picture(el, "clone");
  Object.assign(copy.style, box(el.getBoundingClientRect()));
  layer.appendChild(copy);
  if (!reducedMotion()) copy.animate([{ scale: "1" }, { scale: `${LIFTED_SCALE}` }], { duration: GLIDE.duration, easing: GLIDE.easing, fill: "forwards" });
  return copy;
}

/** How far a dragged copy must move to sit on `to`, from where it was lifted (its box in the layer, which covers the viewport). */
function moveOnto(copy: HTMLElement, to: DOMRectReadOnly): Delta {
  return { dx: to.left - copy.offsetLeft, dy: to.top - copy.offsetTop };
}

/** Plays `keyframes` on a dragged copy, after whatever it ran, and removes it at the end; at once under reduced motion. */
function settle(copy: HTMLElement, keyframes: Keyframe[], spring: Spring): Promise<void> {
  if (reducedMotion()) {
    copy.remove();
    return Promise.resolve();
  }
  for (const animation of copy.getAnimations()) animation.cancel();
  return copy.animate(keyframes, { duration: spring.duration, easing: spring.easing, fill: "forwards" }).finished.then(
    () => copy.remove(),
    () => copy.remove(),
  );
}

/** How small a copy dropped into the zone gets as it goes in. */
const SWALLOWED_SCALE = 0.12;

/**
 * A dragged copy, now at the transform `from`, goes into the middle of `target` with GLIDE: it turns by `spin` degrees, shrinks
 * and fades, then it is removed. Holds the board's gate meanwhile, so a snapshot that arrives on the way renders after it.
 */
export function dropInto(copy: HTMLElement, from: string, target: DOMRectReadOnly, spin: number): Promise<void> {
  const { dx, dy } = moveOnto(copy, target);
  const x = dx + (target.width - copy.offsetWidth) / 2;
  const y = dy + (target.height - copy.offsetHeight) / 2;
  const done = settle(
    copy,
    [
      { transform: from, scale: `${LIFTED_SCALE}`, opacity: 1 },
      { transform: `translate(${x}px, ${y}px) rotate(${spin}deg)`, scale: `${SWALLOWED_SCALE}`, opacity: 0 },
    ],
    GLIDE,
  );
  holdWhile(done);
  return done;
}

/**
 * A dragged copy, now at the transform `from`, comes back down onto `to` with BOUNCE and is removed; with no `to` (what it
 * was dragged from is gone) it fades where it is.
 */
export function returnTo(copy: HTMLElement, from: string, to: DOMRectReadOnly | null): Promise<void> {
  if (!to) return settle(copy, [{ transform: from, scale: `${LIFTED_SCALE}`, opacity: 1 }, { transform: from, scale: `${LIFTED_SCALE}`, opacity: 0 }], GLIDE);
  const { dx, dy } = moveOnto(copy, to);
  return settle(
    copy,
    [
      { transform: from, scale: `${LIFTED_SCALE}` },
      { transform: `translate(${dx}px, ${dy}px)`, scale: "1" },
    ],
    BOUNCE,
  );
}

/** Removes flyers lifted but never landed, e.g. by a switch that two key presses replaced before it rendered. */
export function dropFlyers(flyers: Flyer[]): void {
  for (const flyer of flyers) flyer.el.remove();
}

// The choreography of a landing, besides the stagger of planLanding: a flyer's content is gone by HIDE_CONTENT of its flight,
// the target fades in and then the flyer out, each over HAND_OVER of it; arrivals and heads follow with a stagger of their own.
const HIDE_CONTENT = 0.2;
const HAND_OVER = 0.25;
const FALL: Keyframe[] = [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(12px) scale(.86)" }];
const ARRIVE: Keyframe[] = [{ opacity: 0, transform: "translateY(18px) scale(.96)" }, { opacity: 1, transform: "none" }];
const ARRIVE_AFTER_MS = 300;
const ARRIVE_STAGGER_MS = 28;
const RISE: Keyframe[] = [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }];
const RISE_STAGGER_MS = 45;
const FADE_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }];
const FADE_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

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
    dropFlyers(flyers);
    return Promise.resolve();
  }
  for (const animation of root.getAnimations({ subtree: true })) {
    if (animation instanceof CSSAnimation && ENTRANCES.has(animation.animationName)) animation.cancel();
  }
  // Only what shows is landed on: a PR scrolled out of sight in the new view lets its flyer fall away, like a folded one.
  // Measured before anything moves, so every flyer heads for where its target rests.
  const targets = new Map<string, { el: HTMLElement; rest: DOMRectReadOnly }>();
  root.querySelectorAll<HTMLElement>(PR_FLIP).forEach((el) => {
    const rest = el.getBoundingClientRect();
    if (visibleIn(rest, innerWidth, innerHeight)) targets.set(el.dataset.flip!, { el, rest });
  });
  const lifted = new Map(flyers.map((flyer) => [flyer.key, flyer]));
  const plan = planLanding([...lifted.keys()], [...targets.keys()]);
  const animations: Animation[] = [];
  const play = (el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = el.animate(keyframes, options);
    animations.push(animation);
    return animation;
  };
  // A flyer goes as soon as its last animation ends, not when the whole landing is over.
  const removeAfter = (flyer: Flyer, last: Animation) => {
    void last.finished.then(
      () => flyer.el.remove(),
      () => {},
    );
  };
  const glide = (duration: number, delay: number): KeyframeAnimationOptions => ({ duration, delay, easing: GLIDE.easing, fill: "both" });
  const handOver = Math.round(GLIDE.duration * HAND_OVER);

  for (const { key, delay } of plan.pairs) {
    const flyer = lifted.get(key)!;
    const target = targets.get(key)!;
    const arrive = delay + GLIDE.duration;
    // The box (tint, stripe, shadow) travels and what it showed fades out early; once the box is there, the target shows
    // under it, and then the box goes.
    flyer.el.querySelectorAll(":scope > .card > *, :scope > .tc").forEach((content) =>
      play(content, FADE_OUT, glide(Math.round(GLIDE.duration * HIDE_CONTENT), delay)),
    );
    play(flyer.el, [box(flyer.from), box(target.rest)], glide(GLIDE.duration, delay));
    play(target.el, FADE_IN, { ...glide(handOver, arrive), fill: "backwards" });
    removeAfter(flyer, play(flyer.el, FADE_OUT, glide(handOver, arrive + handOver)));
  }
  for (const key of plan.leaving) {
    const flyer = lifted.get(key)!;
    removeAfter(flyer, play(flyer.el, FALL, glide(GLIDE.duration, 0)));
  }
  plan.arriving.forEach((key, i) =>
    play(targets.get(key)!.el, ARRIVE, {
      duration: BOUNCE.duration,
      delay: ARRIVE_AFTER_MS + Math.min(i, 24) * ARRIVE_STAGGER_MS,
      easing: BOUNCE.easing,
      fill: "backwards",
    }),
  );
  root.querySelectorAll(".col, .tpanel, .tgroup").forEach((el, i) =>
    play(el, RISE, { ...glide(GLIDE.duration, Math.min(i, 8) * RISE_STAGGER_MS), fill: "backwards" }),
  );

  const current = { flyers: flyers.map((flyer) => flyer.el), animations };
  landing = current;
  const done = Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => {
    if (landing === current) landing = null;
  });
  holdWhile(done);
  return done;
}

// A happening replayed on a card: a round ripple from its middle and a little bounce; on a row: a light sweep from left to
// right and a short glow. Both live in the card's or row's `.card-wrap`, which clips them.
const RIPPLE: Keyframe[] = [{ transform: "scale(0)", opacity: 0.9 }, { transform: "scale(9)", opacity: 0 }];
const HOP: Keyframe[] = [{ scale: "1" }, { scale: "1.045", offset: 0.35 }, { scale: "1" }];
const SWEEP: Keyframe[] = [{ transform: "translateX(-100%)" }, { transform: "translateX(100%)" }];
const GLOW: Keyframe[] = [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }];
/** How long a flash stays under reduced motion: an outline, on and off. */
const OUTLINE_MS = 600;
const outlines = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Something just happened to the PR of `el` (its [data-flip] slot or row): it is scrolled into sight and flashes in `color`.
 * Under reduced motion it scrolls at once and is outlined in `color` for 600ms, with nothing moving.
 */
export function flash(el: HTMLElement, color: string, kind: "card" | "row"): void {
  const wrap = el.querySelector<HTMLElement>(".card-wrap");
  const box = kind === "card" ? el.querySelector<HTMLElement>(".card") : el;
  if (!wrap || !box) return;
  const reduced = reducedMotion();
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
  if (reduced) {
    box.style.setProperty("--rc", color);
    box.classList.add("flashed");
    clearTimeout(outlines.get(box));
    outlines.set(box, setTimeout(() => box.classList.remove("flashed"), OUTLINE_MS));
    return;
  }
  const play = (kindOf: string, keyframes: Keyframe[], spring: Spring) => {
    const bit = document.createElement("span");
    bit.className = kindOf;
    bit.style.setProperty("--rc", color);
    wrap.appendChild(bit);
    void bit.animate(keyframes, { duration: spring.duration, easing: spring.easing }).finished.then(
      () => bit.remove(),
      () => bit.remove(),
    );
  };
  if (kind === "card") {
    play("ripple", RIPPLE, GLIDE);
    box.animate(HOP, { duration: BOUNCE.duration, easing: BOUNCE.easing });
  } else {
    play("sweep", SWEEP, GLIDE);
    play("glow", GLOW, GLIDE);
  }
}
