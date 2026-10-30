export type CiState = "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED";

export type Mergeable = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";

/** GitHub's verdict on whether the PR can be merged right now; BEHIND means the branch needs a rebase. */
export type MergeStateStatus = "BEHIND" | "BLOCKED" | "CLEAN" | "DIRTY" | "DRAFT" | "HAS_HOOKS" | "UNKNOWN" | "UNSTABLE";

export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED";

export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";

/** The latest submitted review of one reviewer. */
export type Review = { author: string; state: ReviewState; submittedAt: string };

/**
 * A comment by a person (bots are left out): a general PR comment, or one in a review thread.
 * `thread` is the review thread's id; general comments have none.
 */
export type Comment = { id: string; author: string; createdAt: string; body: string; thread?: string };

/** A commit on the PR branch; `committedAt` changes when the commit is rebased or amended. */
export type Commit = { oid: string; committedAt: string };

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
  comments: Comment[]; // the latest general and review-thread comments by people, oldest first
  commits: Commit[]; // the latest commits on the branch, oldest first
};

/** What one poll learns from GitHub. */
export type Snapshot = {
  viewer: string;
  pullRequests: PullRequest[];
};
