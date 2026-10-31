import type { MergeStateStatus } from "../../src/domain/types.js";
import type { ClassifiedPullRequest } from "./api.js";

/** `kind` picks the colour: ok, bad, pending, muted or merged. */
export type Badge = { text: string; kind: string; title?: string };

type Mark = [text: string, kind: string, title?: string];

// Same colour as the matching merge-state badge, so "needs rebase" looks alike wherever it shows.
const REASONS: Record<string, Mark> = {
  ci_failed: ["CI failed", "bad"],
  sonar_failed: ["Sonar failed", "bad"],
  changes_requested: ["changes requested", "bad"],
  conflict: ["conflict", "bad"],
  needs_rebase: ["needs rebase", "pending"],
  review_requested: ["review requested", "bad"],
  mention: ["mention", "bad"],
};

/** "1 нов коментар", "2 нови коментара": Bulgarian counts take a different form after one. */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const newComments = (n: number) => count(n, "нов коментар", "нови коментара");

/** The reasons whose text depends on what the PR holds. */
function reasonMark(pr: ClassifiedPullRequest): Mark | undefined {
  if (pr.reason === "unread_comments") return [newComments(pr.unreadComments ?? 0), "bad"];
  if (pr.reason === "re_review") {
    const { newCommits = 0, replies = 0 } = pr.reReview ?? {};
    const news = [
      ...(newCommits ? [count(newCommits, "нов commit", "нови commit-а")] : []),
      ...(replies ? [count(replies, "отговор", "отговора")] : []),
    ];
    return [`re-review: ${news.join(", ")}`, "bad"];
  }
  return pr.reason ? REASONS[pr.reason] : undefined;
}

// What the merge box would say: conflict, out of date, blocked by rules, or free to merge.
const MERGE_STATES: Partial<Record<MergeStateStatus, Mark>> = {
  DIRTY: ["conflict", "bad", "Има конфликт с base клона"],
  BEHIND: ["needs rebase", "pending", "Клонът е изостанал от base и трябва rebase преди merge"],
  BLOCKED: ["blocked", "muted", "Merge е блокиран от правилата на repo-то (review-та или задължителни проверки)"],
  CLEAN: ["mergeable", "ok", "Може да се merge-не"],
  HAS_HOOKS: ["mergeable", "ok", "Може да се merge-не"],
  UNSTABLE: ["mergeable", "ok", "Може да се merge-не, но незадължителни проверки не минават"],
};

function badge([text, kind, title]: Mark): Badge {
  return title ? { text, kind, title } : { text, kind };
}

/** Why the PR waits on me, whether it is a draft, and whether it can be merged. */
export function statusBadges(pr: ClassifiedPullRequest): Badge[] {
  const badges: Badge[] = [];
  if (pr.reason) badges.push(badge(reasonMark(pr) ?? [pr.reason, "bad"]));
  if (pr.isDraft) badges.push(badge(["draft", "muted"]));
  // GitHub may still be computing DIRTY while `mergeable` already says CONFLICTING.
  const state = pr.mergeable === "CONFLICTING" ? "DIRTY" : pr.mergeStateStatus;
  const merge = MERGE_STATES[state];
  const saidByReason = (pr.reason === "conflict" && state === "DIRTY") || (pr.reason === "needs_rebase" && state === "BEHIND");
  if (merge && !saidByReason) badges.push(badge(merge));
  return badges;
}
