/**
 * Why a request to GitHub failed, in the terms the dashboard shows it, whoever asked (a poll, the Dependency graph):
 * - `auth`: GitHub rejects the token (bad, expired, or without access);
 * - `rate_limit`: the token's rate limit is used up, until `resetAt` when GitHub says;
 * - `unreachable`: GitHub could not be reached or answered with a server error;
 * - `other`: anything else, shown with GitHub's own message.
 */
export type GitHubFailureKind = "auth" | "rate_limit" | "unreachable" | "other";

export type GitHubFailure = {
  kind: GitHubFailureKind;
  message: string;
  /** ISO time when a rate limit lifts; null for other kinds or when GitHub did not say. */
  resetAt: string | null;
};

/** What a failed GitHub response carries; GitHubError fills it in. */
export type GitHubResponseFailure = Error & {
  status?: number;
  /** Response headers, with lower-case names. */
  headers?: Record<string, string>;
  /** The `type` of each GraphQL error, e.g. RATE_LIMITED. */
  errorTypes?: string[];
};

/** Sorts whatever a request to GitHub threw into one of the kinds the dashboard tells apart. */
export function classifyGitHubError(error: unknown, now: Date): GitHubFailure {
  if (!(error instanceof Error)) return { kind: "other", message: String(error), resetAt: null };
  const { status, headers = {}, errorTypes = [] } = error as GitHubResponseFailure;
  const plain = (kind: GitHubFailureKind, message = error.message): GitHubFailure => ({ kind, message, resetAt: null });

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
