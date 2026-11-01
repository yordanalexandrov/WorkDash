// Delight: confetti on merged and sparks on "видях", particles in the effects layer (`.fx`). They know a point, a count, colours
// and a label, nothing of PRs and issues but `newlyMerged` and `watchCompleted`; see "Motion" in docs/design.md, where particles are the exception to the springs.

import type { ClosedPullRequest, IssueBoardState } from "./api.js";
import { prKey } from "./detail.js";
import { issueFlipKey, type Pos, reducedMotion } from "./motion.js";
import { issueKey, sameRepo } from "../../src/domain/repos.js";

/** The keys of the PRs merged since `before`: in `after` as merged and not in `before`; none for the first snapshot (`null`). */
export function newlyMerged(before: ClosedPullRequest[] | null, after: ClosedPullRequest[]): string[] {
  if (!before) return [];
  const known = new Set(before.map(prKey));
  return after.filter((pr) => pr.state === "MERGED" && !known.has(prKey(pr))).map(prKey);
}

/** What `watchCompleted` compares: what the Issue dashboard shows of its open repo. */
type ClosedIssues = Pick<IssueBoardState, "repo" | "fetchedAt" | "closed">;

/**
 * What the Issue dashboard keeps between two states of its open repo, to tell an issue completed while it watched: the
 * state it showed last, and the last poll answer that came in while it showed the repo (a state fetched later than the one
 * before it), if one did.
 */
export type CompletedWatch = { shown: ClosedIssues | null; answer: ClosedIssues | null };

export const NO_WATCH: CompletedWatch = { shown: null, answer: null };

/**
 * The watch after the dashboard shows `next` (null while it shows no repo's issues), and the FLIP keys of the cards of the issues completed
 * since the last poll answer: those in `next` as completed and not in that answer. Only a poll answer that follows another
 * one seen for the same repo counts, so neither the saved issues (perhaps hours old), nor the start of a poll (which carries
 * them as saved), nor opening a tab or the dashboard ever bursts for what closed while nobody looked.
 */
export function watchCompleted(watch: CompletedWatch, next: ClosedIssues | null): { watch: CompletedWatch; completed: string[] } {
  const { shown, answer } = watch;
  if (!next || !shown || !sameRepo(shown.repo, next.repo)) return { watch: { shown: next, answer: null }, completed: [] };
  if (next.fetchedAt === null || next.fetchedAt === shown.fetchedAt) return { watch: { shown: next, answer }, completed: [] };
  const known = new Set(answer?.closed.map(issueKey));
  const completed = answer ? next.closed.filter((issue) => issue.closedAs === "completed" && !known.has(issueKey(issue))).map(issueFlipKey) : [];
  return { watch: { shown: next, answer: next }, completed };
}

/** A number in [min, max) from a generator of [0, 1). */
function between(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

/**
 * One piece of confetti: its size, the angle (in the upward fan) and power it sets off with, how far it goes across (`dx`) and up
 * (`rise`, negative) to the top of its flight, how far it then falls below that, its spin in degrees and how long it flies (ms).
 */
export type ConfettiPiece = {
  width: number;
  height: number;
  angle: number;
  power: number;
  dx: number;
  rise: number;
  fall: number;
  spin: number;
  duration: number;
};

/** A piece of confetti from `random`, a generator of [0, 1). */
export function confettiPiece(random: () => number): ConfettiPiece {
  const angle = between(random, -Math.PI * 0.95, -Math.PI * 0.05);
  const power = between(random, 120, 300);
  return {
    width: between(random, 5, 9),
    height: between(random, 8, 14),
    angle,
    power,
    dx: Math.cos(angle) * power,
    rise: Math.sin(angle) * power,
    fall: between(random, 220, 380),
    spin: between(random, -720, 720),
    duration: between(random, 1300, 2000),
  };
}

/** How many sparks go off around a "видях". */
export const SPARKS = 16;

/**
 * One spark: the angle it flies off at, near its place `i` of SPARKS around the circle, how far it goes (`dx`, `dy`), its size,
 * how long it flies (ms) and how much lighter than `--ok` it is (a `color-mix` share of white, %).
 */
export type SparkPiece = { angle: number; dx: number; dy: number; size: number; duration: number; light: number };

/** Spark `i` of SPARKS from `random`, a generator of [0, 1). */
export function sparkPiece(i: number, random: () => number): SparkPiece {
  const angle = (i / SPARKS) * Math.PI * 2 + between(random, -0.2, 0.2);
  const distance = between(random, 40, 90);
  return {
    angle,
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance,
    size: between(random, 4, 8),
    duration: between(random, 500, 800),
    light: between(random, 0, 35),
  };
}

/** A particle in `layer`, at its top left; it moves by `transform` alone. */
function bit(layer: HTMLElement, kind: string, style: Partial<CSSStyleDeclaration>, text = ""): HTMLElement {
  const el = document.createElement("div");
  el.className = kind;
  Object.assign(el.style, style);
  el.textContent = text;
  layer.appendChild(el);
  return el;
}

/** Plays `keyframes` on a particle and removes it at the end. */
function fly(el: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): void {
  void el.animate(keyframes, { ...options, fill: "forwards" }).finished.then(
    () => el.remove(),
    () => el.remove(),
  );
}

/** Whether particles may go off: not under reduced motion, and not on a page nobody sees. */
function canBurst(): boolean {
  return !reducedMotion() && !document.hidden;
}

/**
 * `count` pieces of confetti burst up in a fan from (`x`, `y`) in the viewport, spin and fall away with gravity in 1.3–2s.
 * Their colours are `hues` at the saturation of a card's stripe: here they mean joy, not a project.
 */
export function confetti(layer: HTMLElement, x: number, y: number, count: number, hues: readonly number[]): void {
  if (!canBurst() || !hues.length) return;
  for (let i = 0; i < count; i++) {
    const piece = confettiPiece(Math.random);
    const hue = hues[Math.floor(Math.random() * hues.length)];
    const el = bit(layer, "bit", { width: `${piece.width}px`, height: `${piece.height}px`, background: `hsl(${hue} 70% var(--stripe-l))` });
    fly(
      el,
      [
        { transform: `translate(${x}px, ${y}px) rotate(0deg)`, opacity: 1, easing: "cubic-bezier(.15,.8,.35,1)" },
        {
          transform: `translate(${x + piece.dx * 0.75}px, ${y + piece.rise}px) rotate(${piece.spin / 2}deg)`,
          opacity: 1,
          offset: 0.4,
          easing: "cubic-bezier(.5,0,.9,.6)",
        },
        { transform: `translate(${x + piece.dx}px, ${y + piece.rise + piece.fall}px) rotate(${piece.spin}deg)`, opacity: 0 },
      ],
      { duration: piece.duration },
    );
  }
}

/** SPARKS dots in `--ok` fly out in a ring from (`x`, `y`) and fade, and `label` rises above them and goes. */
export function sparks(layer: HTMLElement, x: number, y: number, label: string): void {
  if (!canBurst()) return;
  for (let i = 0; i < SPARKS; i++) {
    const piece = sparkPiece(i, Math.random);
    const half = piece.size / 2;
    const el = bit(layer, "bit spark", {
      width: `${piece.size}px`,
      height: `${piece.size}px`,
      background: `color-mix(in srgb, var(--ok), white ${piece.light}%)`,
    });
    fly(
      el,
      [
        { transform: `translate(${x - half}px, ${y - half}px) scale(1)`, opacity: 1 },
        { transform: `translate(${x - half + piece.dx}px, ${y - half + piece.dy}px) scale(.2)`, opacity: 0 },
      ],
      { duration: piece.duration, easing: "cubic-bezier(.1,.8,.3,1)" },
    );
  }
  const bubble = bit(layer, "bubble", {}, label);
  // Centred on the point by its own width, which is only known once it is in the layer.
  const left = x - bubble.offsetWidth / 2;
  const top = y - bubble.offsetHeight / 2;
  fly(
    bubble,
    [
      { transform: `translate(${left}px, ${top}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${left}px, ${top - 30}px) scale(1.15)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${left}px, ${top - 70}px) scale(1)`, opacity: 0 },
    ],
    { duration: 1100, easing: "ease-out" },
  );
}

/** The middle of `rect`. */
export function middleOf(rect: DOMRectReadOnly): Pos {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
