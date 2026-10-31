import { nextPollDelay, type PollError } from "./poll-error.js";

/** When polls happen: every poll interval, or only when I come back to the dashboard or press "Обнови". */
export const POLL_MODES = ["periodic", "on_demand"] as const;
export type PollMode = (typeof POLL_MODES)[number];

/** What asked for a poll: the dashboard coming back into view, or "Обнови". */
export type Demand = "focus" | "button";

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
  if (rateLimitedAt(error, now)) return "skip";
  if (demand === "focus" && lastSuccessAt && now.getTime() - Date.parse(lastSuccessAt) < FOCUS_GAP_MS) return "skip";
  return "poll";
}

/** Whether `error` is a rate limit that has not lifted by `now`; one without a known reset time counts as lifted. */
function rateLimitedAt(error: PollError | null, now: Date): boolean {
  return error?.kind === "rate_limit" && error.resetAt !== null && Date.parse(error.resetAt) > now.getTime();
}

/**
 * How long a poller switched to Periodic waits before its next poll: what is left of the interval since the
 * last poll ended (longer while a rate limit lasts), or nothing when that has run out or there was no poll.
 */
export function delayAfterSwitch(options: { lastPollAt: string | null; intervalMs: number; error: PollError | null; now: Date }): number {
  const { lastPollAt, intervalMs, error, now } = options;
  if (!lastPollAt) return 0;
  const last = new Date(lastPollAt);
  return Math.max(0, last.getTime() + nextPollDelay(error, intervalMs, last) - now.getTime());
}
