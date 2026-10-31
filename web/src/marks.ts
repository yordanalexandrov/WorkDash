// The small marks in a card's footer; the reason texts stay in badges.ts.

import { sameLogin } from "../../src/domain/activity.js";
import type { CiState, MergeStateStatus, ReviewState } from "../../src/domain/types.js";
import type { ClassifiedPullRequest } from "./api.js";
import type { Badge } from "./badges.js";

const MERGEABLE: Badge = { text: "⇢ merge", kind: "ok", title: "Може да се merge-не" };

const MERGE_MARKS: Partial<Record<MergeStateStatus, Badge>> = {
  DIRTY: { text: "⨯ конфликт", kind: "bad", title: "Има конфликт с base клона" },
  BEHIND: { text: "↻", kind: "pending", title: "Клонът е изостанал от base и трябва rebase преди merge" },
  BLOCKED: { text: "⏸", kind: "muted", title: "Merge е блокиран от правилата на repo-то (review-та или задължителни проверки)" },
  CLEAN: MERGEABLE,
  HAS_HOOKS: MERGEABLE,
  UNSTABLE: { ...MERGEABLE, title: "Може да се merge-не, но незадължителни проверки не минават" },
};

/** Whether the PR can be merged, unless the reason already says why not. */
export function mergeMark(pr: ClassifiedPullRequest): Badge | undefined {
  // GitHub may still be computing DIRTY while `mergeable` already says CONFLICTING.
  const state = pr.mergeable === "CONFLICTING" ? "DIRTY" : pr.mergeStateStatus;
  const saidByReason = (pr.reason === "conflict" && state === "DIRTY") || (pr.reason === "needs_rebase" && state === "BEHIND");
  return saidByReason ? undefined : MERGE_MARKS[state];
}

/** The requested reviewers who have not answered with a review yet. */
export function askedReviewers(pr: ClassifiedPullRequest): string[] {
  return pr.requestedReviewers.filter((login) => !pr.reviews.some((review) => sameLogin(review.author, login)));
}

/** A CI or Sonar ring; `kind` picks the colour. */
export type CheckRing = { label: "CI" | "Sonar"; state: CiState; kind: "ok" | "bad" | "pending" };

const CHECK_KINDS: Record<CiState, CheckRing["kind"]> = { SUCCESS: "ok", FAILURE: "bad", ERROR: "bad", PENDING: "pending", EXPECTED: "pending" };

/** The CI and Sonar rings: none for a check without a state, nor for the failure the reason already names. */
export function checkRings(pr: ClassifiedPullRequest): CheckRing[] {
  const rings: CheckRing[] = [];
  if (pr.ci && pr.reason !== "ci_failed") rings.push({ label: "CI", state: pr.ci, kind: CHECK_KINDS[pr.ci] });
  if (pr.sonar && pr.reason !== "sonar_failed") rings.push({ label: "Sonar", state: pr.sonar, kind: CHECK_KINDS[pr.sonar] });
  return rings;
}

/** Two letters for an avatar: the first of two login parts, else the login's first two. */
export function initials(login: string): string {
  const parts = login.split(/[-_.]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : login.slice(0, 2);
  return letters.toUpperCase();
}

/** A reviewer's avatar dot: how their latest review went. */
export type ReviewMark = { login: string; kind: "ok" | "bad" | "muted"; title: string };

const REVIEW_MARKS: Partial<Record<ReviewState, [ReviewMark["kind"], string]>> = {
  APPROVED: ["ok", "одобри"],
  CHANGES_REQUESTED: ["bad", "иска промени"],
  COMMENTED: ["muted", "коментира"],
};

/** One mark per reviewer's latest review; dismissed reviews are left out. */
export function reviewMarks(pr: ClassifiedPullRequest): ReviewMark[] {
  return pr.reviews.flatMap((review) => {
    const mark = REVIEW_MARKS[review.state];
    return mark ? [{ login: review.author, kind: mark[0], title: `${review.author} ${mark[1]}` }] : [];
  });
}
