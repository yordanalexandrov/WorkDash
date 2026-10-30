import type { ClosedPullRequest, PullRequest } from "./types.js";

const key = (pr: { repo: string; number: number }) => `${pr.repo}#${pr.number}`;

/**
 * The PRs that were open at the previous poll and are not open now: merged, closed, or (rarely)
 * pushed off a full page. A repo the current poll could not read is skipped, since its PRs
 * did not really disappear.
 */
export function vanishedPullRequests(previous: PullRequest[], current: PullRequest[], unreadRepos: string[]): PullRequest[] {
  const open = new Set(current.map(key));
  return previous.filter((pr) => !open.has(key(pr)) && !unreadRepos.includes(pr.repo));
}

/** The closed PRs still worth showing: closed within the last `windowMs`. */
export function withinWindow(closed: ClosedPullRequest[], now: Date, windowMs: number): ClosedPullRequest[] {
  const since = now.getTime() - windowMs;
  return closed.filter((pr) => new Date(pr.closedAt).getTime() >= since);
}

/**
 * The recently closed list after a poll: the known entries plus the newly closed ones (one entry
 * per PR, the newer wins), minus PRs that were reopened and PRs closed before the window.
 * Most recently closed first.
 */
export function updateRecentlyClosed(options: {
  known: ClosedPullRequest[];
  newlyClosed: ClosedPullRequest[];
  open: PullRequest[];
  now: Date;
  windowMs: number;
}): ClosedPullRequest[] {
  const { known, newlyClosed, open, now, windowMs } = options;
  const byKey = new Map<string, ClosedPullRequest>();
  for (const pr of [...known, ...newlyClosed]) byKey.set(key(pr), pr);
  const reopened = new Set(open.map(key));
  const kept = [...byKey.values()].filter((pr) => !reopened.has(key(pr)));
  return withinWindow(kept, now, windowMs).sort((a, b) => b.closedAt.localeCompare(a.closedAt));
}
