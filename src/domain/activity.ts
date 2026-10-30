import { type Comment, type PullRequest, pushedAt } from "./types.js";

/** What happened on someone else's PR since my last review that asks for another look. */
export type ReReview = { newCommits: number; replies: number };

const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

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

/**
 * Whether a comment on someone else's PR answers `me`: it is by the PR author, in a review thread
 * I wrote in, or mentions me.
 */
export function repliesTo(pr: PullRequest, me: string): (comment: Comment) => boolean {
  const myThreads = new Set(pr.comments.flatMap((comment) => (comment.thread && sameLogin(comment.author, me) ? [comment.thread] : [])));
  return (comment) =>
    sameLogin(comment.author, pr.author) || (comment.thread !== undefined && myThreads.has(comment.thread)) || mentions(comment.body, me);
}

/**
 * New commits and replies to me on someone else's PR after my last review that left comments or
 * requested changes, counted from whichever is later: that review or `seenAt`. A reply is a comment
 * by the PR author, a comment in a review thread I wrote in, or a comment that mentions me.
 * Null when I have no such review or nothing new happened since.
 */
export function reReviewActivity(pr: PullRequest, me: string, seenAt: string | null): ReReview | null {
  const review = pr.reviews.find((candidate) => sameLogin(candidate.author, me));
  if (!review || (review.state !== "COMMENTED" && review.state !== "CHANGES_REQUESTED")) return null;
  const since = seenAt !== null && after(seenAt, review.submittedAt) ? seenAt : review.submittedAt;

  const isReplyToMe = repliesTo(pr, me);

  const newCommits = pr.commits.filter((commit) => after(pushedAt(commit), since)).length;
  const replies = pr.comments.filter(
    (comment) => !sameLogin(comment.author, me) && after(comment.createdAt, since) && isReplyToMe(comment),
  ).length;
  return newCommits || replies ? { newCommits, replies } : null;
}
