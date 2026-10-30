export type CiState = "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED";

export type Mergeable = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";

/** GitHub's verdict on whether the PR can be merged right now; BEHIND means the branch needs a rebase. */
export type MergeStateStatus = "BEHIND" | "BLOCKED" | "CLEAN" | "DIRTY" | "DRAFT" | "HAS_HOOKS" | "UNKNOWN" | "UNSTABLE";

export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED";

export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";

/** The latest submitted review of one reviewer. */
export type Review = { author: string; state: ReviewState; submittedAt: string };

export type PullRequest = {
  repo: string; // owner/name
  number: number;
  title: string;
  url: string;
  author: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  mergeable: Mergeable;
  mergeStateStatus: MergeStateStatus;
  reviewDecision: ReviewDecision | null;
  requestedReviewers: string[];
  reviews: Review[];
  ci: CiState | null; // every check on the head commit except Sonar; null when there are none
  sonar: CiState | null; // the Sonar quality gate; null when the repo does not run Sonar
};

/** A PR that left the open list, with how it ended. */
export type ClosedPullRequest = {
  repo: string; // owner/name
  number: number;
  title: string;
  url: string;
  author: string;
  state: "MERGED" | "CLOSED";
  closedAt: string;
};

/** What one poll learns from GitHub. */
export type Snapshot = {
  viewer: string;
  pullRequests: PullRequest[];
};
