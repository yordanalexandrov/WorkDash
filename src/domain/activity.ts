import { type Comment, type PullRequest, pushedAt, type Review } from "./types.js";

/** What happened on someone else's PR since my last review that asks for another look. */
export type ReReview = { newCommits: number; replies: number };

/** GitHub logins are case-insensitive. */
export const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// GitHub writes "…:00Z" and the store "…:00.000Z", so compare instants rather than strings.
const after = (time: string, since: string | null) => since === null || Date.parse(time) > Date.parse(since);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether `body` mentions `@login`, as GitHub would link it. */
export function mentions(body: string, login: string): boolean {
  return new RegExp(`(?<![\\w@./-])@${escapeRegExp(login)}(?![\\w-])`, "i").test(body);
}

/** Comments by someone other than `me` created after `seenAt`; all of them when the PR was never marked seen. */
export function unreadComments(pr: PullRequest, me: string, seenAt: string | null): Comment[] {
  return pr.comments.filter((comment) => !sameLogin(comment.author, me) && after(comment.createdAt, seenAt));
}

/** Whether a comment on someone else's PR answers `me`: by the PR author, in my review thread, or mentioning me. */
export function repliesTo(pr: PullRequest, me: string): (comment: Comment) => boolean {
  const myThreads = new Set(pr.comments.flatMap((comment) => (comment.thread && sameLogin(comment.author, me) ? [comment.thread] : [])));
  return (comment) =>
    sameLogin(comment.author, pr.author) || (comment.thread !== undefined && myThreads.has(comment.thread)) || mentions(comment.body, me);
}

/** My latest review on the PR when it left comments or asked for changes; null otherwise. */
export function reviewAskingForMore(pr: PullRequest, me: string): Review | null {
  const review = pr.reviews.find((candidate) => sameLogin(candidate.author, me));
  return review && (review.state === "COMMENTED" || review.state === "CHANGES_REQUESTED") ? review : null;
}

/** New commits and replies to me since my review asking for more or `seenAt`, whichever is later; null when none. */
export function reReviewActivity(pr: PullRequest, me: string, seenAt: string | null): ReReview | null {
  const review = reviewAskingForMore(pr, me);
  if (!review) return null;
  const since = seenAt !== null && after(seenAt, review.submittedAt) ? seenAt : review.submittedAt;

  const isReplyToMe = repliesTo(pr, me);

  const newCommits = pr.commits.filter((commit) => after(pushedAt(commit), since)).length;
  const replies = pr.comments.filter(
    (comment) => !sameLogin(comment.author, me) && after(comment.createdAt, since) && isReplyToMe(comment),
  ).length;
  return newCommits || replies ? { newCommits, replies } : null;
}
