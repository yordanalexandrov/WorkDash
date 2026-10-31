import type { ClassifiedPullRequest } from "./api.js";

/** `kind` picks the colour: ok, bad, pending, muted or merged. */
export type Badge = { text: string; kind: string; title?: string };

type Mark = [text: string, kind: string, title?: string];

// "needs rebase" is amber like the merge mark for a branch that is behind.
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

/** Why the PR waits on me, as the label on its card; undefined when it does not. */
export function reasonBadge(pr: ClassifiedPullRequest): Badge | undefined {
  if (!pr.reason) return undefined;
  const [text, kind] = reasonMark(pr) ?? [pr.reason, "bad"];
  return { text, kind };
}
