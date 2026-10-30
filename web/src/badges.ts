import type { CiState, MergeStateStatus, ReviewState } from "../../src/domain/types.js";
import type { ClassifiedPullRequest } from "./api.js";

/** `kind` picks the colour: ok, bad, pending or muted. */
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
};

const CHECK_MARKS: Record<CiState, Mark> = {
  SUCCESS: ["✓", "ok"],
  FAILURE: ["✗", "bad"],
  ERROR: ["✗", "bad"],
  PENDING: ["…", "pending"],
  EXPECTED: ["…", "pending"],
};

// What the merge box would say: conflict, out of date, blocked by rules, or free to merge.
const MERGE_STATES: Partial<Record<MergeStateStatus, Mark>> = {
  DIRTY: ["conflict", "bad", "Има конфликт с base клона"],
  BEHIND: ["needs rebase", "pending", "Клонът е изостанал от base и трябва rebase преди merge"],
  BLOCKED: ["blocked", "muted", "Merge е блокиран от правилата на repo-то (review-та или задължителни проверки)"],
  CLEAN: ["mergeable", "ok", "Може да се merge-не"],
  HAS_HOOKS: ["mergeable", "ok", "Може да се merge-не"],
  UNSTABLE: ["mergeable", "ok", "Може да се merge-не, но незадължителни проверки не минават"],
};

const REVIEW_MARKS: Partial<Record<ReviewState, Mark>> = {
  APPROVED: ["✓", "ok"],
  CHANGES_REQUESTED: ["✗", "bad"],
  COMMENTED: ["💬", "muted"],
};

function badge([text, kind, title]: Mark): Badge {
  return title ? { text, kind, title } : { text, kind };
}

/** Why the PR waits on me, whether it is a draft, and whether it can be merged. */
export function statusBadges(pr: ClassifiedPullRequest): Badge[] {
  const badges: Badge[] = [];
  if (pr.reason) badges.push(badge(REASONS[pr.reason] ?? [pr.reason, "bad"]));
  if (pr.isDraft) badges.push(badge(["draft", "muted"]));
  // GitHub may still be computing DIRTY while `mergeable` already says CONFLICTING.
  const state = pr.mergeable === "CONFLICTING" ? "DIRTY" : pr.mergeStateStatus;
  const merge = MERGE_STATES[state];
  const saidByReason = (pr.reason === "conflict" && state === "DIRTY") || (pr.reason === "needs_rebase" && state === "BEHIND");
  if (merge && !saidByReason) badges.push(badge(merge));
  return badges;
}

/** CI and Sonar badges; a failure the reason badge already names is not repeated. */
export function checkBadges(pr: ClassifiedPullRequest): Badge[] {
  const badges: Badge[] = [];
  if (pr.reason !== "ci_failed") {
    const [mark, kind] = pr.ci ? (CHECK_MARKS[pr.ci] ?? [pr.ci, "muted"]) : ["–", "muted"];
    badges.push(badge([`CI ${mark}`, kind, pr.ci ? undefined : "Няма CI проверки"]));
  }
  if (pr.sonar && pr.reason !== "sonar_failed") {
    const [mark, kind] = CHECK_MARKS[pr.sonar] ?? [pr.sonar, "muted"];
    badges.push(badge([`Sonar ${mark}`, kind]));
  }
  return badges;
}

/** One badge per reviewer's latest review; dismissed reviews are left out. */
export function reviewBadges(pr: ClassifiedPullRequest): Badge[] {
  return pr.reviews.flatMap((review) => {
    const mark = REVIEW_MARKS[review.state];
    return mark ? [badge([`${mark[0]} ${review.author}`, mark[1]])] : [];
  });
}
