import type { PollError } from "./poll-error.js";
import { type DemandAnswer, rateLimitLiftsAt } from "./poll-mode.js";

/** What asks for a poll of a repo's issues: the repo being opened (going to the Issue dashboard, or to its tab), or "Обнови". */
export const ISSUE_DEMANDS = ["open", "button"] as const;
export type IssueDemand = (typeof ISSUE_DEMANDS)[number];

/** How long after a poll of a repo opening it again shows what was saved instead of polling. */
const ISSUE_POLL_GAP_MS = 60_000;

/**
 * What a demand for a repo's issues does. A poll of the repo under way answers it; a rate limit refuses every demand until
 * it lifts; opening the repo within ISSUE_POLL_GAP_MS of its last poll is not worth one; "Обнови" always is.
 */
export function answerIssueDemand(options: {
  demand: IssueDemand;
  /** Whether a poll of the repo is under way. */
  polling: boolean;
  /** When the repo was last polled, whether that poll succeeded or not; null when it never was. */
  lastPolledAt: string | null;
  /** Why the last poll failed; null when it succeeded. */
  error: PollError | null;
  now: Date;
}): DemandAnswer {
  const { demand, polling, lastPolledAt, error, now } = options;
  if (polling) return "join";
  if (rateLimitLiftsAt(error, now)) return "skip";
  if (demand !== "button" && lastPolledAt && now.getTime() - Date.parse(lastPolledAt) < ISSUE_POLL_GAP_MS) return "skip";
  return "poll";
}
