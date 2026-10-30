import { mentions, repliesTo, reviewAskingForMore, sameLogin } from "./activity.js";
import { type ClassifyRules, classify, type SeenAt } from "./classify.js";
import { type CiState, type Comment, type PullRequest, pushedAt, type ReviewState, type Snapshot } from "./types.js";

/** What can happen between two polls that is worth telling me about, in the order the plan lists them. */
export const EVENT_TYPES = [
  "review_requested",
  "new_comment_on_my_pr",
  "review_on_my_pr",
  "ci_failed_on_my_pr",
  "my_pr_ready_to_merge",
  "mention",
  "re_review_needed",
  "team_pr_opened",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * One thing that happened on a PR. The `id` is deterministic (type, PR and what happened), so the
 * same event found again, by the next poll or after a restart, has the same id and is not repeated.
 */
export type PrEvent = {
  id: string;
  type: EventType;
  repo: string;
  number: number;
  title: string;
  url: string;
  /** Who did it: the commenter, reviewer, PR author. */
  actor: string;
  /** What the review said; only on `review_on_my_pr`. */
  review?: ReviewState;
};

/** The snapshot the previous poll saved, with when it was fetched. */
export type PreviousSnapshot = Snapshot & { fetchedAt: string };

const key = (pr: PullRequest) => `${pr.repo}#${pr.number}`;
const isFailed = (ci: CiState | null) => ci === "FAILURE" || ci === "ERROR";
const headCommit = (pr: PullRequest) => pr.commits.at(-1)?.oid ?? "none";

/**
 * How long before the previous poll a PR missing from it may have been opened and still count as
 * new: GitHub can list a PR a little after creating it. An older PR that shows up (a newly
 * followed repo, a reopened PR) is only baseline.
 */
const NEW_PR_SLACK_MS = 5 * 60_000;

/** A PR before anything happened on it, to diff a newly opened PR against. */
function unopened(pr: PullRequest): PullRequest {
  return { ...pr, isDraft: true, requestedReviewers: [], reviews: [], comments: [], commits: [], ci: null, sonar: null };
}

/**
 * The events between the previous poll and this one, as seen by `current.viewer`.
 * Without a previous snapshot (the first poll ever) there are none: the snapshot is only the baseline.
 * A PR that left the open list (merged, closed) is not an event. One comment gives one event:
 * a mention wins over "new comment on my PR" and over a re-review reply.
 */
export function diffSnapshots(
  previous: PreviousSnapshot | null,
  current: Snapshot,
  rules: ClassifyRules,
  seenAt: SeenAt = () => null,
): PrEvent[] {
  if (!previous || !sameLogin(previous.viewer, current.viewer)) return [];
  const me = current.viewer;
  const before = new Map(previous.pullRequests.map((pr) => [key(pr), pr]));
  const newSince = Date.parse(previous.fetchedAt) - NEW_PR_SLACK_MS;
  const events: PrEvent[] = [];

  for (const pr of current.pullRequests) {
    let old = before.get(key(pr));
    if (!old) {
      if (!(Date.parse(pr.createdAt) >= newSince)) continue;
      old = unopened(pr);
    }
    const event = (type: EventType, what: string | null, actor: string, extra: Partial<PrEvent> = {}): PrEvent => ({
      id: what === null ? `${type}:${key(pr)}` : `${type}:${key(pr)}:${what}`,
      type,
      repo: pr.repo,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      actor,
      ...extra,
    });
    const mine = sameLogin(pr.author, me);
    const oldComments = new Set(old.comments.map((comment) => comment.id));
    const newComments = pr.comments.filter((comment) => !oldComments.has(comment.id) && !sameLogin(comment.author, me));
    const isMention = (comment: Comment) => mentions(comment.body, me);

    if (mine) {
      for (const comment of newComments) {
        if (!isMention(comment)) events.push(event("new_comment_on_my_pr", comment.id, comment.author));
      }
      const oldReviews = new Set(old.reviews.map((review) => `${review.author}:${review.submittedAt}`));
      for (const review of pr.reviews) {
        const id = `${review.author}:${review.submittedAt}`;
        if (review.state === "DISMISSED" || sameLogin(review.author, me) || oldReviews.has(id)) continue;
        events.push(event("review_on_my_pr", id, review.author, { review: review.state }));
      }
      if (isFailed(pr.ci) && !isFailed(old.ci)) events.push(event("ci_failed_on_my_pr", headCommit(pr), me));
      const seen = seenAt(pr);
      const ready = (candidate: PullRequest) => classify(candidate, me, rules, seen)?.section === "ready_to_merge";
      if (ready(pr) && !ready(old)) events.push(event("my_pr_ready_to_merge", headCommit(pr), me));
    } else {
      const requested = (candidate: PullRequest) => candidate.requestedReviewers.some((login) => sameLogin(login, me));
      if (requested(pr) && !requested(old)) {
        // A re-request after my next review is a new event, so the id names the review it follows.
        const myReview = pr.reviews.find((review) => sameLogin(review.author, me));
        events.push(event("review_requested", myReview?.submittedAt ?? "none", pr.author));
      }
    }

    for (const comment of newComments) {
      if (isMention(comment)) events.push(event("mention", comment.id, comment.author));
    }

    if (!mine) {
      const news = reReviewNews(old, pr, me, newComments.filter((comment) => !isMention(comment)));
      if (news) events.push(event("re_review_needed", news.id, news.actor));
    }

    const inTeam = rules.team.some((login) => sameLogin(login, pr.author));
    if (inTeam && !mine && !pr.isDraft && old.isDraft) events.push(event("team_pr_opened", null, pr.author));
  }
  return events;
}

/**
 * The newest commit or reply to me on someone else's PR since the previous poll that came after my
 * last review leaving comments or asking for changes; null when there is none.
 */
function reReviewNews(old: PullRequest, pr: PullRequest, me: string, newComments: Comment[]): { id: string; actor: string } | null {
  const review = reviewAskingForMore(pr, me);
  if (!review) return null;
  const afterReview = (time: string) => Date.parse(time) > Date.parse(review.submittedAt);
  const oldCommits = new Set(old.commits.map((commit) => commit.oid));
  const isReply = repliesTo(pr, me);
  const news = [
    ...pr.commits
      .filter((commit) => !oldCommits.has(commit.oid) && afterReview(pushedAt(commit)))
      .map((commit) => ({ id: commit.oid, actor: pr.author, at: pushedAt(commit) })),
    ...newComments
      .filter((comment) => afterReview(comment.createdAt) && isReply(comment))
      .map((comment) => ({ id: comment.id, actor: comment.author, at: comment.createdAt })),
  ];
  const newest = news.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1);
  return newest ? { id: newest.id, actor: newest.actor } : null;
}
