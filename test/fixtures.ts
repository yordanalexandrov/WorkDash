import type { Issue } from "../src/domain/issues.js";
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
    author: "colleague1",
    labels: [],
    assignees: [],
    comments: 0,
    milestone: null,
    linkedPullRequests: [],
    createdAt: "2026-10-29T10:00:00Z",
    updatedAt: "2026-10-30T10:00:00Z",
    ...overrides,
  };
}
