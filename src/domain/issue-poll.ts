import type { PollError } from "./poll-error.js";
import { type DemandAnswer, rateLimitLiftsAt } from "./poll-mode.js";

/**
 * What asks for a poll of a repo's issues: the repo being opened (going to the Issue dashboard, or to its tab), the page
 * coming back into view (window focus, the browser tab shown again), the poll interval passing while the Issue dashboard
 * shows in Periodic, or "Обнови".
 */
export const ISSUE_DEMANDS = ["open", "focus", "interval", "button"] as const;
export type IssueDemand = (typeof ISSUE_DEMANDS)[number];

/** How long after a poll of a repo opening it again, or coming back to it, shows what was saved instead of polling. */
const ISSUE_POLL_GAP_MS = 60_000;

/** How often the interval polls a repo: every poll interval, but not more often than once a minute. */
const intervalGap = (intervalMs: number) => Math.max(intervalMs, ISSUE_POLL_GAP_MS);

/**
 * What a demand for a repo's issues does. A poll of the repo under way answers it; a rate limit refuses every demand until
 * it lifts; opening the repo or coming back to it within ISSUE_POLL_GAP_MS of its last poll is not worth one, nor is the
 * interval before the poll interval (at least ISSUE_POLL_GAP_MS) has passed; "Обнови" always is.
 */
export function answerIssueDemand(options: {
  demand: IssueDemand;
  /** Whether a poll of the repo is under way. */
  polling: boolean;
  /** When the repo was last polled, whether that poll succeeded or not; null when it never was. */
  lastPolledAt: string | null;
  /** Why the last poll failed; null when it succeeded. */
  error: PollError | null;
  /** The poll interval of config.yaml. */
  intervalMs: number;
  now: Date;
}): DemandAnswer {
  const { demand, polling, lastPolledAt, error, intervalMs, now } = options;
  if (polling) return "join";
  if (rateLimitLiftsAt(error, now)) return "skip";
  if (demand === "button" || !lastPolledAt) return "poll";
  const gap = demand === "interval" ? intervalGap(intervalMs) : ISSUE_POLL_GAP_MS;
  return now.getTime() - Date.parse(lastPolledAt) < gap ? "skip" : "poll";
}

/**
 * When the interval next polls a repo: the poll interval (at least a minute) after its last poll, or later when a rate limit
 * lifts later. When that is not after `now`, a demand has just polled nothing (there is no token, say), so it is a whole
 * interval from `now`, and a page asking on the interval does not ask again at once.
 */
export function nextIntervalPollAt(options: { lastPolledAt: string | null; error: PollError | null; intervalMs: number; now: Date }): string {
  const { lastPolledAt, error, intervalMs, now } = options;
  const gap = intervalGap(intervalMs);
  const lifts = rateLimitLiftsAt(error, now);
  const due = Math.max(lastPolledAt ? Date.parse(lastPolledAt) + gap : 0, lifts ? Date.parse(lifts) : 0);
  return new Date(due > now.getTime() ? due : now.getTime() + gap).toISOString();
}

/** What the page is told of its demand: what it does, and when the interval is next worth asking on (`nextIntervalPollAt`). */
export type IssuePollAnswer = { answer: DemandAnswer; dueAt: string };
