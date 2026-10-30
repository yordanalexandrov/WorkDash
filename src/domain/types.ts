export type CiState = "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED";

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
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  requestedReviewers: string[];
  reviews: Review[];
  ci: CiState | null; // null when the head commit has no checks
};

/** What one poll learns from GitHub. */
export type Snapshot = {
  viewer: string;
  pullRequests: PullRequest[];
};
