import { nextPollDelay, type PollError } from "./poll-error.js";

/** When polls happen: every poll interval, or only when I come back to the dashboard or press "Обнови". */
export const POLL_MODES = ["periodic", "on_demand"] as const;
export type PollMode = (typeof POLL_MODES)[number];

/** What asks for a poll: the dashboard coming into view, or "Обнови". */
export const DEMANDS = ["focus", "button"] as const;
export type Demand = (typeof DEMANDS)[number];

/** What a demand does: start a poll, wait for the one under way, or nothing. */
export type DemandAnswer = "poll" | "join" | "skip";

/** How recent a successful poll keeps a focus from polling again. */
const FOCUS_GAP_MS = 30_000;

/**
 * What a demand does. A poll under way answers it; a rate limit refuses every demand until it lifts;
 * a focus within FOCUS_GAP_MS of a successful poll is not worth one; "Обнови" always is.
 */
export function answerDemand(options: {
  demand: Demand;
  polling: boolean;
  /** When the last successful poll fetched its snapshot; null before the first. */
  lastSuccessAt: string | null;
  /** Why the last poll failed; null when it succeeded. */
  error: PollError | null;
  now: Date;
}): DemandAnswer {
  const { demand, polling, lastSuccessAt, error, now } = options;
  if (polling) return "join";
  if (rateLimitLiftsAt(error, now)) return "skip";
  if (demand === "focus" && lastSuccessAt && now.getTime() - Date.parse(lastSuccessAt) < FOCUS_GAP_MS) return "skip";
  return "poll";
}

/** When the rate limit `error` lifts, if it has not by `now`; null otherwise, a rate limit without a known reset time included. */
export function rateLimitLiftsAt(error: PollError | null, now: Date): string | null {
  return error?.kind === "rate_limit" && error.resetAt !== null && Date.parse(error.resetAt) > now.getTime() ? error.resetAt : null;
}

/**
 * How long a poller switched to Periodic waits before its next poll: what is left of the interval since the data was
 * fetched (longer while a rate limit lasts), or nothing when the data is older than that or there is none.
 */
export function delayAfterSwitch(options: { lastSuccessAt: string | null; intervalMs: number; error: PollError | null; now: Date }): number {
  const { lastSuccessAt, intervalMs, error, now } = options;
  if (!lastSuccessAt) return 0;
  const last = new Date(lastSuccessAt);
  return Math.max(0, last.getTime() + nextPollDelay(error, intervalMs, last) - now.getTime());
}
