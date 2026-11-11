import { sameLogin } from "./activity.js";
import type { GitHubFailure } from "./github-error.js";
import { extractJiraKeys, type JiraConfig } from "./jira.js";
import type { ReviewState } from "./types.js";

/** Whose PR it is to me: one I opened ("Мои PR-и"), or someone else's I reviewed or commented on ("Review-та"). */
export type WorkRole = "author" | "review";

/** A review I gave, by its verdict: approved, changes requested, or comments only (a dismissed one counts as comments). */
export type ReviewVerdict = "approved" | "changes" | "commented";

/** One thing I did on a PR, and when. */
export type WorkEvent =
  | { kind: "opened" | "merged" | "closed" | "commit" | "comment"; at: string }
  | { kind: "review"; at: string; verdict: ReviewVerdict };

/** A PR as the work log's search reads it from GitHub: who did what on it, whoever it was. */
export type WorkSource = {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  headRefName: string;
  body: string;
  createdAt: string;
  mergedAt: string | null;
  /** When it was closed without a merge; null when open or merged. */
  closedAt: string | null;
  /** The commits on the branch with their author date, which a rebase keeps. */
  commits: { author: string | null; authoredAt: string }[];
  /** Every submitted review, with how many comments it holds (inline ones, or a reply in a thread). */
  reviews: { author: string; state: ReviewState; submittedAt: string; comments: number }[];
  /** The general comments. */
  comments: { author: string; createdAt: string }[];
};

/** A PR of the work log, as saved: what I did on it since the search began, oldest first. */
export type WorkItem = {
  repo: string;
  number: number;
  title: string;
  url: string;
  role: WorkRole;
  headRefName: string;
  body: string;
  events: WorkEvent[];
};

/** A Jira ticket a PR names; without a Jira base URL in the settings, its key alone. */
export type WorkTicket = { key: string; url: string | null };

/** A PR of the work log as served: its Jira tickets instead of the texts they are read from. */
export type WorkLogPr = Omit<WorkItem, "headRefName" | "body"> & { jira: WorkTicket[] };

const VERDICTS: Record<ReviewState, ReviewVerdict> = { APPROVED: "approved", CHANGES_REQUESTED: "changes", COMMENTED: "commented", DISMISSED: "commented" };

/**
 * What `me` did on `pr` since `since`, or null when nothing. On my PR: opening it, its merge or close, my commits and my
 * comments (a review of my own PR is a reply, so its comments count as comments). On someone else's: my commits, my
 * reviews and my comments, a review's inline comments counted as comments too.
 */
export function workItem(pr: WorkSource, me: string, since: Date): WorkItem | null {
  const mine = sameLogin(pr.author, me);
  const events: WorkEvent[] = [];
  if (mine) {
    events.push({ kind: "opened", at: pr.createdAt });
    if (pr.mergedAt) events.push({ kind: "merged", at: pr.mergedAt });
    if (pr.closedAt) events.push({ kind: "closed", at: pr.closedAt });
  }
  for (const commit of pr.commits) if (commit.author !== null && sameLogin(commit.author, me)) events.push({ kind: "commit", at: commit.authoredAt });
  for (const review of pr.reviews) {
    if (!sameLogin(review.author, me)) continue;
    if (!mine) events.push({ kind: "review", at: review.submittedAt, verdict: VERDICTS[review.state] });
    const comments = mine ? Math.max(review.comments, 1) : review.comments;
    for (let i = 0; i < comments; i++) events.push({ kind: "comment", at: review.submittedAt });
  }
  for (const comment of pr.comments) if (sameLogin(comment.author, me)) events.push({ kind: "comment", at: comment.createdAt });

  const kept = events.filter((event) => Date.parse(event.at) >= since.getTime()).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (kept.length === 0) return null;
  const { repo, number, title, url, headRefName, body } = pr;
  return { repo, number, title, url, role: mine ? "author" : "review", headRefName, body, events: kept };
}

/**
 * The work log's PRs with their Jira tickets, by the Jira settings in effect now. Unlike the dashboard, a key shows even
 * without a base URL to link it to: the tickets are what the time is logged against.
 */
export function servedItems(items: WorkItem[], jira: JiraConfig): WorkLogPr[] {
  return items.map(({ headRefName, body, ...item }) => ({
    ...item,
    jira: extractJiraKeys({ headRefName, title: item.title, body }, jira).map((key) => ({ key, url: jira.baseUrl ? jira.baseUrl + key : null })),
  }));
}

/** What GET /api/work-log returns: the saved work log, of the followed repos only, and how its search goes. */
export type WorkLogState = {
  viewer: string | null;
  fetchedAt: string | null;
  pullRequests: WorkLogPr[];
  /** Whether a search is under way. */
  fetching: boolean;
  /** Why the last search failed; null when it did not. The saved work log still shows. */
  error: GitHubFailure | null;
};
