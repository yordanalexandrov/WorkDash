import type { GitHubFailure } from "./github-error.js";

/** Why a poll of GitHub failed (`classifyGitHubError`), as the poll's health keeps it. */
export type PollError = GitHubFailure;

/** How the last poll went. The last good snapshot stays in the store whatever this says. */
export type PollHealth = {
  /** Why the last poll failed; null once a poll succeeds again. */
  error: PollError | null;
  /** What the last successful poll could not fetch whole (an unresolvable repo, a truncated page). */
  problems: string[];
};

/** How long the poller waits before the next try: the interval, or until a rate limit lifts if that is later. */
export function nextPollDelay(error: PollError | null, intervalMs: number, now: Date): number {
  if (error?.kind !== "rate_limit" || !error.resetAt) return intervalMs;
  return Math.max(intervalMs, Date.parse(error.resetAt) - now.getTime());
}
