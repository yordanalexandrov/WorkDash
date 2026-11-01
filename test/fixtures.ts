import type { ClosedIssue, Issue } from "../src/domain/issues.js";
import type { PullRequest } from "../src/domain/types.js";

/** An open, mergeable PR by `me` with green CI and no reviews; override what a test cares about. */
export function pullRequest(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    repo: "my-org/repo-a",
    number: 1,
    title: "PR 1",
    headRefName: "pr-1",
    body: "",
    url: "https://github.com/my-org/repo-a/pull/1",
    author: "me",
    isDraft: false,
    createdAt: "2026-10-29T10:00:00Z",
    updatedAt: "2026-10-30T10:00:00Z",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    requestedReviewers: [],
    reviews: [],
    ci: "SUCCESS",
    sonar: null,
    comments: [],
    commits: [],
    ...overrides,
  };
}

/** An open issue of `my-org/repo-a` by `colleague1`, without labels, assignees or comments; override what a test cares about. */
export function issue(overrides: Partial<Issue> = {}): Issue {
  const number = overrides.number ?? 1;
  return {
    repo: "my-org/repo-a",
    number,
    title: `Issue ${number}`,
    url: `https://github.com/my-org/repo-a/issues/${number}`,
    body: "",
    author: "colleague1",
    labels: [],
    assignees: [],
    comments: 0,
    latestComments: [],
    milestone: null,
    linkedPullRequests: [],
    parent: null,
    subIssues: { total: 0, completed: 0 },
    dependencies: { blockedBy: 0, blocking: 0, totalBlockedBy: 0, totalBlocking: 0 },
    createdAt: "2026-10-29T10:00:00Z",
    updatedAt: "2026-10-30T10:00:00Z",
    closedAt: null,
    ...overrides,
  };
}

/** An issue of `my-org/repo-a` closed as completed on 2026-10-31 at 08:00 UTC; override what a test cares about. */
export function closedIssue(overrides: Partial<ClosedIssue> = {}): ClosedIssue {
  return { ...issue(overrides), closedAt: "2026-10-31T08:00:00Z", closedAs: "completed", ...overrides };
}
