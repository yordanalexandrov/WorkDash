// The small marks on a card or row: its footer, how hard it pulses and how the table ranks them; the reason texts stay in badges.ts.

import { sameLogin } from "../../src/domain/activity.js";
import type { Reason, Section } from "../../src/domain/classify.js";
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

/** The ring of one check. */
export function checkRing(label: CheckRing["label"], state: CiState): CheckRing {
  return { label, state, kind: CHECK_KINDS[state] };
}

/** The CI and Sonar rings: none for a check without a state, nor for the failure the reason already names. */
export function checkRings(pr: ClassifiedPullRequest): CheckRing[] {
  const rings: CheckRing[] = [];
  if (pr.ci && pr.reason !== "ci_failed") rings.push(checkRing("CI", pr.ci));
  if (pr.sonar && pr.reason !== "sonar_failed") rings.push(checkRing("Sonar", pr.sonar));
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

/** How many comments are unread, or 0 when the reason label already says it. */
export function unreadCount(pr: ClassifiedPullRequest): number {
  return pr.reason === "unread_comments" ? 0 : (pr.unreadComments ?? 0);
}

const URGENT = new Set<Reason>(["ci_failed", "sonar_failed", "review_requested", "changes_requested", "conflict", "mention"]);

/** How hard a "Чака теб" card pulses: `u2` for failures and for what asks me to act, `u1` for the rest; nothing outside "Чака теб". */
export function urgency(reason: Reason | undefined): "u1" | "u2" | undefined {
  if (!reason) return undefined;
  return URGENT.has(reason) ? "u2" : "u1";
}

const SECTION_SHORT: Record<Section, string> = {
  waiting_on_me: "теб",
  free_for_review: "review",
  ready_to_merge: "merge",
  waiting_on_others: "други",
  team: "екип",
};

/** The section in a word, for its pill in the table. */
export function sectionShort(section: Section): string {
  return SECTION_SHORT[section] ?? section;
}

// The ranks the table sorts by: the lower, the sooner it needs me.

const REASON_ORDER: Reason[] = [
  "ci_failed",
  "sonar_failed",
  "changes_requested",
  "conflict",
  "unread_comments",
  "needs_rebase",
  "review_requested",
  "mention",
  "re_review",
];

/** How urgent the reason is; no reason comes last. */
export function reasonRank(reason: Reason | undefined): number {
  const rank = reason ? REASON_ORDER.indexOf(reason) : -1;
  return rank < 0 ? REASON_ORDER.length : rank;
}

const CHECK_RANK: Record<CiState, number> = { FAILURE: 0, ERROR: 0, PENDING: 1, EXPECTED: 1, SUCCESS: 2 };

/** Failed, then running, then passed, then no check at all. */
export function checkRank(state: CiState | null): number {
  return state ? CHECK_RANK[state] : 3;
}

const MERGE_RANK: Record<MergeStateStatus, number> = { DIRTY: 0, BEHIND: 1, BLOCKED: 2, DRAFT: 3, UNKNOWN: 4, UNSTABLE: 5, HAS_HOOKS: 5, CLEAN: 6 };

/** Conflict, behind, blocked, draft, unknown, unstable or hooks, clean; a conflict `mergeable` says outranks a draft, a draft the state. */
export function mergeRank(pr: ClassifiedPullRequest): number {
  return MERGE_RANK[pr.mergeable === "CONFLICTING" ? "DIRTY" : pr.isDraft ? "DRAFT" : pr.mergeStateStatus];
}

const REVIEW_SCORE: Partial<Record<ReviewState, number>> = { APPROVED: 10, CHANGES_REQUESTED: -10, COMMENTED: 1 };

/** How the reviews went: an approval counts 10, changes requested -10, a comment 1. */
export function reviewRank(pr: ClassifiedPullRequest): number {
  return pr.reviews.reduce((score, review) => score + (REVIEW_SCORE[review.state] ?? 0), 0);
}
