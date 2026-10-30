/**
 * Why a poll of GitHub failed, in the terms the dashboard shows it:
 * - `auth`: GitHub rejects the token (bad, expired, or without access);
 * - `rate_limit`: the token's rate limit is used up, until `resetAt` when GitHub says;
 * - `unreachable`: GitHub could not be reached or answered with a server error;
 * - `other`: anything else, shown with GitHub's own message.
 */
export type PollErrorKind = "auth" | "rate_limit" | "unreachable" | "other";

export type PollError = {
  kind: PollErrorKind;
  message: string;
  /** ISO time when a rate limit lifts; null for other kinds or when GitHub did not say. */
  resetAt: string | null;
};

/** How the last poll went. The last good snapshot stays in the store whatever this says. */
export type PollHealth = {
  /** Why the last poll failed; null once a poll succeeds again. */
  error: PollError | null;
  /** What the last successful poll could not fetch whole (an unresolvable repo, a truncated page). */
  problems: string[];
};

/** What a failed GitHub response carries; GitHubError fills it in. */
export type GitHubResponseFailure = Error & {
  status?: number;
  /** Response headers, with lower-case names. */
  headers?: Record<string, string>;
  /** The `type` of each GraphQL error, e.g. RATE_LIMITED. */
  errorTypes?: string[];
};

/** Sorts whatever a poll threw into one of the kinds the dashboard tells apart. */
export function classifyPollError(error: unknown, now: Date): PollError {
  if (!(error instanceof Error)) return { kind: "other", message: String(error), resetAt: null };
  const { status, headers = {}, errorTypes = [] } = error as GitHubResponseFailure;
  const plain = (kind: PollErrorKind, message = error.message): PollError => ({ kind, message, resetAt: null });

  if (error.name === "TimeoutError" || error.name === "AbortError") return plain("unreachable");
  // fetch() rejects with a TypeError when it cannot connect at all; the cause says why.
  if (error instanceof TypeError && status === undefined) {
    const cause = error.cause instanceof Error ? `: ${error.cause.message}` : "";
    return plain("unreachable", `${error.message}${cause}`);
  }

  const rateLimited =
    errorTypes.includes("RATE_LIMITED") ||
    status === 429 ||
    (status === 403 && (headers["x-ratelimit-remaining"] === "0" || headers["retry-after"] !== undefined));
  if (rateLimited) return { kind: "rate_limit", message: error.message, resetAt: rateLimitReset(headers, now) };

  if (status === 401 || status === 403) return plain("auth");
  if (status !== undefined && status >= 500) return plain("unreachable");
  return plain("other");
}

function rateLimitReset(headers: Record<string, string>, now: Date): string | null {
  const retryAfter = Number(headers["retry-after"]);
  if (headers["retry-after"] && Number.isFinite(retryAfter)) return new Date(now.getTime() + retryAfter * 1000).toISOString();
  const reset = Number(headers["x-ratelimit-reset"]);
  if (headers["x-ratelimit-reset"] && Number.isFinite(reset)) return new Date(reset * 1000).toISOString();
  return null;
}

/** How long the poller waits before the next try: the interval, or until a rate limit lifts if that is later. */
export function nextPollDelay(error: PollError | null, intervalMs: number, now: Date): number {
  if (error?.kind !== "rate_limit" || !error.resetAt) return intervalMs;
  return Math.max(intervalMs, Date.parse(error.resetAt) - now.getTime());
}
