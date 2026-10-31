// "Пусни деня": the activity of the last 48 hours replayed over the dashboard. Only `happenings` knows PRs; the clock, the
// track and the feed work on plain happenings, so a later dashboard (issues, #19) can feed them its own.

import { pushedAt } from "../../src/domain/types.js";
import type { ClosedPullRequest, DashboardPullRequest } from "./api.js";
import { prKey } from "./detail.js";

export type Kind = "comment" | "commit" | "review" | "changes" | "merged" | "closed";

/** One thing that happened, at `at` (ms), to the item under `key`: "**who** what", a snippet below, in `color`. */
export type Happening = {
  at: number;
  key: string;
  /** What the item belongs to, for its colour; `tag` is how the feed names the item ("#12"). */
  project: string;
  tag: string;
  kind: Kind;
  who: string;
  what: string;
  snippet?: string;
  color: string;
};

const COLOR: Record<Kind, string> = {
  comment: "var(--blue)",
  commit: "var(--pending)",
  review: "var(--ok)",
  changes: "var(--bad)",
  merged: "var(--merged)",
  closed: "var(--merged)",
};

const REVIEW: Record<"APPROVED" | "CHANGES_REQUESTED" | "COMMENTED", [Kind, string]> = {
  APPROVED: ["review", "одобри"],
  CHANGES_REQUESTED: ["changes", "поиска промени"],
  COMMENTED: ["review", "написа review"],
};

const SNIPPET = 90;

/** The happenings of these PRs in (start, end], oldest first. */
export function happenings(open: DashboardPullRequest[], closed: ClosedPullRequest[], start: number, end: number): Happening[] {
  const out: Happening[] = [];
  const push = (pr: { repo: string; number: number }, at: number, kind: Kind, who: string, what: string, snippet?: string) => {
    if (at <= start || at > end) return;
    out.push({ at, key: prKey(pr), project: pr.repo, tag: `#${pr.number}`, kind, who, what, ...(snippet ? { snippet } : {}), color: COLOR[kind] });
  };
  for (const pr of open) {
    for (const comment of pr.comments)
      push(pr, Date.parse(comment.createdAt), "comment", comment.author, "коментира", comment.body.replace(/\s+/g, " ").trim().slice(0, SNIPPET));
    for (const commit of pr.commits) push(pr, Date.parse(pushedAt(commit)), "commit", pr.author, "push-на commit", commit.oid.slice(0, 7));
    for (const review of pr.reviews) {
      if (review.state === "DISMISSED") continue;
      const [kind, what] = REVIEW[review.state];
      push(pr, Date.parse(review.submittedAt), kind, review.author, what);
    }
  }
  for (const pr of closed) {
    const merged = pr.state === "MERGED";
    push(pr, Date.parse(pr.closedAt), merged ? "merged" : "closed", pr.author, merged ? "merge-на" : "затвори");
  }
  return out.sort((a, b) => a.at - b.at);
}

const HOUR = 3_600_000;
/** How far back the replay goes from the snapshot. */
export const WINDOW = 48 * HOUR;
/** A stretch with nothing in it for longer than this flies by RUSH times faster. */
const QUIET = 3 * HOUR;
const RUSH = 8;
/** The longest frame counted, so a tab that was hidden does not leap ahead. */
const MAX_FRAME_MS = 100;

/**
 * How far the replay moves in one frame of `dtMs` at `speed` (1x = an hour a second; quiet stretches rush), and what happens
 * on the way, in (time, next].
 */
export function step(time: number, events: readonly Happening[], dtMs: number, speed: number, end: number): { next: number; due: Happening[] } {
  const upcoming = events.find((h) => h.at > time)?.at ?? end;
  const rush = upcoming - time > QUIET ? RUSH : 1;
  const next = Math.min(end, time + Math.min(dtMs, MAX_FRAME_MS) * speed * rush * (HOUR / 1000));
  return { next, due: events.filter((h) => h.at > time && h.at <= next) };
}

/** How many happenings have happened by `time`, with it. */
export function firedBy(events: readonly Happening[], time: number): number {
  return events.filter((h) => h.at <= time).length;
}

/** How many happenings fall in each hour of [start, end]; one at `end` counts in the last hour. */
export function hourBuckets(events: readonly Happening[], start: number, end: number): number[] {
  const hours = Math.ceil((end - start) / HOUR);
  const buckets = Array.from({ length: hours }, () => 0);
  for (const h of events) buckets[Math.min(hours - 1, Math.floor((h.at - start) / HOUR))]! += 1;
  return buckets;
}

/** A happening in the feed: `id` is its key there, `born` when it came (ms, the clock of the page). */
export type Toast = { id: number; happening: Happening; born: number };

const MAX_TOASTS = 6;
const FADE_MS = 7500;
const LIFE_MS = 9000;

/** The feed with `due` come in at `now`, numbered from `firstId`: the newest on top, six at most. */
export function pushToasts(toasts: readonly Toast[], due: readonly Happening[], now: number, firstId: number): Toast[] {
  const fresh = due.map((happening, i) => ({ id: firstId + i, happening, born: now })).reverse();
  return [...fresh, ...toasts].slice(0, MAX_TOASTS);
}

/** The feed without the toasts older than 9s; the same array when none is, so nothing renders for it. */
export function expireToasts(toasts: Toast[], now: number): Toast[] {
  return toasts.some((toast) => now - toast.born > LIFE_MS) ? toasts.filter((toast) => now - toast.born <= LIFE_MS) : toasts;
}

/** Whether a toast fades out: past 7.5s, on its way to being removed. */
export function fading(toast: Toast, now: number): boolean {
  return now - toast.born > FADE_MS;
}

const CLOCK = new Intl.DateTimeFormat("bg-BG", { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** The replay's clock: weekday and time, "пт, 14:05" (without the " ч." bg-BG puts after the time). */
export function clockLabel(time: number): string {
  const part = (type: Intl.DateTimeFormatPartTypes) => CLOCK.formatToParts(time).find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")}, ${part("hour")}:${part("minute")}`;
}

/** The whole hours left to the end of the window (the snapshot), rounded. */
export function hoursLeft(time: number, end: number): number {
  return Math.round((end - time) / HOUR);
}
