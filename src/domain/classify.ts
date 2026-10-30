import { mentions, type ReReview, reReviewActivity, sameLogin, unreadComments } from "./activity.js";
import type { PullRequest } from "./types.js";

/** Dashboard sections, in the order they are shown: most attention needed first. */
export const SECTIONS = ["waiting_on_me", "free_for_review", "ready_to_merge", "waiting_on_others", "team"] as const;
export type Section = (typeof SECTIONS)[number];

/** Why a PR waits on me. */
export type Reason =
  | "ci_failed"
  | "sonar_failed"
  | "changes_requested"
  | "conflict"
  | "unread_comments"
  | "needs_rebase"
  | "review_requested"
  | "mention"
  | "re_review";

export type Classification = { section: "waiting_on_me"; reason: Reason } | { section: Exclude<Section, "waiting_on_me"> };

export type ClassifyRules = {
  team: string[];
  /** Approvals that count as approved when GitHub gives no review decision. */
  requiredApprovals: number;
};

export type ClassifiedPullRequest = PullRequest & {
  reason?: Reason;
  /** Comments by others since the PR was last marked seen; groupIntoSections always sets it. */
  unreadComments?: number;
  /** What is new since my review asked for changes; only on someone else's PR that has some. */
  reReview?: ReReview;
};

/** When `me` last marked a PR seen; null when never. */
export type SeenAt = (pr: PullRequest) => string | null;

function isApproved(pr: PullRequest, rules: ClassifyRules): boolean {
  if (pr.reviewDecision) return pr.reviewDecision === "APPROVED";
  return pr.reviews.filter((review) => review.state === "APPROVED").length >= rules.requiredApprovals;
}

function changesRequested(pr: PullRequest): boolean {
  if (pr.reviewDecision) return pr.reviewDecision === "CHANGES_REQUESTED";
  return pr.reviews.some((review) => review.state === "CHANGES_REQUESTED");
}

/**
 * Places a PR in a section for `me`, or returns null when the dashboard should not show it.
 * `seenAt` is when I last marked the PR seen: comments and commits until then no longer call for me.
 */
export function classify(pr: PullRequest, me: string, rules: ClassifyRules, seenAt: string | null = null): Classification | null {
  const unread = unreadComments(pr, me, seenAt);
  if (sameLogin(pr.author, me)) {
    if (pr.ci === "FAILURE" || pr.ci === "ERROR") return { section: "waiting_on_me", reason: "ci_failed" };
    if (pr.sonar === "FAILURE" || pr.sonar === "ERROR") return { section: "waiting_on_me", reason: "sonar_failed" };
    if (changesRequested(pr)) return { section: "waiting_on_me", reason: "changes_requested" };
    if (pr.mergeable === "CONFLICTING") return { section: "waiting_on_me", reason: "conflict" };
    if (unread.length > 0) return { section: "waiting_on_me", reason: "unread_comments" };
    // A repo without CI or Sonar reports no checks; that should not keep a PR from being merged.
    const ciGreen = (pr.ci === "SUCCESS" || pr.ci === null) && (pr.sonar === "SUCCESS" || pr.sonar === null);
    if (!isApproved(pr, rules) || !ciGreen || pr.isDraft) return { section: "waiting_on_others" };
    // Branch protection that requires an up-to-date branch blocks the merge until I rebase.
    if (pr.mergeStateStatus === "BEHIND") return { section: "waiting_on_me", reason: "needs_rebase" };
    return { section: "ready_to_merge" };
  }

  if (pr.requestedReviewers.some((login) => sameLogin(login, me))) {
    return { section: "waiting_on_me", reason: "review_requested" };
  }
  if (unread.some((comment) => mentions(comment.body, me))) return { section: "waiting_on_me", reason: "mention" };
  if (reReviewActivity(pr, me, seenAt)) return { section: "waiting_on_me", reason: "re_review" };
  if (!rules.team.some((login) => sameLogin(login, pr.author))) return null;
  const reviewedByMe = pr.reviews.some((review) => sameLogin(review.author, me));
  if (!pr.isDraft && !isApproved(pr, rules) && !reviewedByMe) return { section: "free_for_review" };
  return { section: "team" };
}

/** Classifies every PR and returns all sections in display order, most recently updated PR first. */
export function groupIntoSections(
  pullRequests: PullRequest[],
  me: string,
  rules: ClassifyRules,
  seenAt: SeenAt = () => null,
): { section: Section; pullRequests: ClassifiedPullRequest[] }[] {
  const bySection = new Map<Section, ClassifiedPullRequest[]>(SECTIONS.map((section) => [section, []]));
  const newestFirst = [...pullRequests].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const pr of newestFirst) {
    const seen = seenAt(pr);
    const classification = classify(pr, me, rules, seen);
    if (!classification) continue;
    const reason = "reason" in classification ? { reason: classification.reason } : {};
    const reReview = sameLogin(pr.author, me) ? null : reReviewActivity(pr, me, seen);
    bySection.get(classification.section)!.push({
      ...pr,
      ...reason,
      unreadComments: unreadComments(pr, me, seen).length,
      ...(reReview ? { reReview } : {}),
    });
  }
  return SECTIONS.map((section) => ({ section, pullRequests: bySection.get(section)! }));
}
