import type { ClosedAs, ClosedIssue, Issue, IssueSnapshot, LinkedPullRequest, LinkedPullRequestMerge, LinkedPullRequestStatus, SubIssueProgress } from "../domain/issues.js";
import type { Comment, Mergeable, MergeStateStatus } from "../domain/types.js";
import { postGraphQL } from "./client.js";
import { PAGE_SIZE } from "./query.js";

// One query per poll of the open repo: no comment bodies, so it stays cheap enough to run on every visit. The comments come
// from a second query, and only for the issues that changed since the last poll, as for the PRs.
const LABELS_PAGE_SIZE = 20;
const ASSIGNEES_PAGE_SIZE = 10;
const LINKED_PULL_REQUESTS_PAGE_SIZE = 10;
/** The detail sheet shows the latest few; a few more leave room for the bots' that are left out. */
const COMMENTS_PAGE_SIZE = 10;
/** Issues per comments query, as for the PRs' details: GitHub gives up on a query that takes too long. */
const COMMENTS_BATCH_SIZE = 25;

/**
 * The query for the open issues of one repo, the most recently updated first, and how many are open in all; and the closed
 * ones updated since `$since`, among which are all those closed since then (GitHub filters issues by update, not by close).
 */
const ISSUES_QUERY = `query RepositoryIssues($owner: String!, $name: String!, $since: DateTime!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    issues(states: OPEN, first: ${PAGE_SIZE}, orderBy: { field: UPDATED_AT, direction: DESC }) {
      totalCount
      nodes { ...IssueFields }
    }
    closed: issues(states: CLOSED, first: ${PAGE_SIZE}, orderBy: { field: UPDATED_AT, direction: DESC }, filterBy: { since: $since }) {
      nodes { ...IssueFields stateReason }
    }
  }
}

fragment IssueFields on Issue {
  number
  title
  url
  body
  createdAt
  updatedAt
  closedAt
  author { login }
  labels(first: ${LABELS_PAGE_SIZE}) { nodes { name color } }
  assignees(first: ${ASSIGNEES_PAGE_SIZE}) { nodes { login } }
  comments { totalCount }
  milestone { title dueOn }
  closedByPullRequestsReferences(first: ${LINKED_PULL_REQUESTS_PAGE_SIZE}) {
    nodes { number url state isDraft mergeable mergeStateStatus repository { nameWithOwner } }
  }
  parent { number title repository { nameWithOwner } }
  subIssuesSummary { total completed }
  issueDependenciesSummary { blockedBy blocking totalBlockedBy totalBlocking }
}`;

/** GitHub's counts of an issue's sub-issues, open and closed: `completed` leaves out those closed as not planned. */
export type SubIssuesSummaryNode = { total: number; completed: number };

type IssueNode = {
  number: number;
  title: string;
  url: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  author: { login: string } | null;
  labels: { nodes: { name: string; color: string }[] };
  assignees: { nodes: { login: string }[] };
  comments: { totalCount: number };
  milestone: { title: string; dueOn: string | null } | null;
  closedByPullRequestsReferences: { nodes: LinkedPullRequestNode[] };
  parent: { number: number; title: string; repository: { nameWithOwner: string } } | null;
  subIssuesSummary: SubIssuesSummaryNode;
  issueDependenciesSummary: { blockedBy: number; blocking: number; totalBlockedBy: number; totalBlocking: number };
};

type LinkedPullRequestNode = {
  number: number;
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean;
  mergeable: Mergeable;
  mergeStateStatus: MergeStateStatus;
  repository: { nameWithOwner: string };
};

/** A closed issue: GitHub's state reason is null for issues closed before it had one. */
type ClosedIssueNode = IssueNode & { closedAt: string; stateReason: string | null };

type IssuesData = {
  repository: { nameWithOwner: string; issues: { totalCount: number; nodes: IssueNode[] }; closed: { nodes: ClosedIssueNode[] } } | null;
};

/**
* Fetches the open issues of `repo` and those closed since `closedSince`, the most recently closed first; fails when GitHub
 * returns no repository, so the last saved snapshot stays. The comments of an open issue are fetched only when it is new or
 * updated since `previous`; an unchanged one keeps the comments it had.
 */
export async function fetchIssues(options: {
  repo: string;
  token: string;
  closedSince: Date;
  fetch?: typeof globalThis.fetch;
  /** The open issues of the last saved snapshot of the repo, whose comments are reused while an issue is unchanged. */
  previous?: Issue[];
}): Promise<IssueSnapshot> {
  const { repo, token, closedSince, fetch = globalThis.fetch, previous = [] } = options;
  const [owner, name] = repo.split("/") as [string, string];
  const variables = { owner, name, since: closedSince.toISOString() };
  const { data, failure } = await postGraphQL<IssuesData>({ query: ISSUES_QUERY, variables }, token, fetch);
  const repository = data?.repository;
  if (!repository) throw failure(`no repository ${repo}`);

  const known = new Map(previous.map((issue) => [issue.number, issue]));
  const listed = repository.issues.nodes.map((node) => toIssue(repo, node));
  // An issue without comments has none to fetch.
  const changed = listed.filter((issue) => issue.comments > 0 && known.get(issue.number)?.updatedAt !== issue.updatedAt);
  const fetched = new Map<number, Comment[]>();
  for (let start = 0; start < changed.length; start += COMMENTS_BATCH_SIZE) {
    const numbers = changed.slice(start, start + COMMENTS_BATCH_SIZE).map((issue) => issue.number);
    for (const [number, comments] of await fetchComments(repo, numbers, token, fetch)) fetched.set(number, comments);
  }

  return {
    repo,
    totalCount: repository.issues.totalCount,
    issues: listed.map((issue) => {
      const comments = fetched.get(issue.number);
      if (comments) return { ...issue, latestComments: comments };
      const old = known.get(issue.number);
      return issue.comments > 0 && old ? { ...issue, latestComments: old.latestComments } : issue;
    }),
    closed: repository.closed.nodes
      .filter((node) => Date.parse(node.closedAt) >= closedSince.getTime())
      .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
      .map((node) => toClosedIssue(repo, node)),
  };
}

type CommentNode = { id: string; author: { __typename: string; login: string } | null; createdAt: string; body: string };

type CommentsData = { repository: Record<string, { comments: { nodes: CommentNode[] } } | null> | null };

/** The latest comments of the issues `numbers` of `repo`, by number; throws when one is missing, so the poll is tried again. */
async function fetchComments(repo: string, numbers: number[], token: string, fetch: typeof globalThis.fetch): Promise<Map<number, Comment[]>> {
  const [owner, name] = repo.split("/") as [string, string];
  const lookups = numbers.map((number, i) => `    i${i}: issue(number: ${number}) { number comments(last: ${COMMENTS_PAGE_SIZE}) { nodes { ...comment } } }`);
  const query = `query IssueComments($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
${lookups.join("\n")}
  }
}

fragment comment on IssueComment {
  id
  author { __typename login }
  createdAt
  body
}`;
  const { data, failure } = await postGraphQL<CommentsData>({ query, variables: { owner, name } }, token, fetch);
  const comments = new Map<number, Comment[]>();
  numbers.forEach((number, i) => {
    const node = data?.repository?.[`i${i}`];
    if (!node) throw failure(`no comments for ${repo}#${number}`);
    comments.set(number, toComments(node.comments.nodes));
  });
  return comments;
}

/** Comments by people, oldest first: a bot is not a person, so its comments are left out. */
function toComments(nodes: CommentNode[]): Comment[] {
  return nodes
    .flatMap((comment) =>
      comment.author?.__typename === "Bot" ? [] : [{ id: comment.id, author: comment.author?.login ?? "ghost", createdAt: comment.createdAt, body: comment.body }],
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** How a closed issue was closed, by GitHub's state reason: not planned or a duplicate, else (null too) completed. */
export function closedAs(stateReason: string | null): ClosedAs {
  return stateReason === "NOT_PLANNED" || stateReason === "DUPLICATE" ? "not_planned" : "completed";
}

/** GitHub's `subIssuesSummary` as an issue's sub-issue progress. */
export function subIssueProgress(summary: SubIssuesSummaryNode): SubIssueProgress {
  return { total: summary.total, completed: summary.completed };
}

function toClosedIssue(repo: string, node: ClosedIssueNode): ClosedIssue {
  return { ...toIssue(repo, node), closedAt: node.closedAt, closedAs: closedAs(node.stateReason) };
}

function toIssue(repo: string, node: IssueNode): Issue {
  return {
    repo,
    number: node.number,
    title: node.title,
    url: node.url,
    body: node.body,
    author: node.author?.login ?? "ghost",
    labels: node.labels.nodes.map(({ name, color }) => ({ name, color })),
    assignees: node.assignees.nodes.map((assignee) => assignee.login),
    comments: node.comments.totalCount,
    latestComments: [],
    milestone: node.milestone && { title: node.milestone.title, dueOn: node.milestone.dueOn },
    linkedPullRequests: node.closedByPullRequestsReferences.nodes.map(toLinkedPullRequest),
    parent: node.parent && { repo: node.parent.repository.nameWithOwner, number: node.parent.number, title: node.parent.title },
    subIssues: subIssueProgress(node.subIssuesSummary),
    dependencies: {
      blockedBy: node.issueDependenciesSummary.blockedBy,
      totalBlockedBy: node.issueDependenciesSummary.totalBlockedBy,
      blocking: node.issueDependenciesSummary.blocking,
      totalBlocking: node.issueDependenciesSummary.totalBlocking,
    },
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    closedAt: node.closedAt,
  };
}

/** An open draft is a draft; otherwise GitHub's state says it. */
function toLinkedPullRequest(pr: LinkedPullRequestNode): LinkedPullRequest {
  const status = linkedStatus(pr);
  const linked: LinkedPullRequest = { repo: pr.repository.nameWithOwner, number: pr.number, url: pr.url, status };
  return status === "open" ? { ...linked, merge: linkedMerge(pr) } : linked;
}

const MERGES: Record<MergeStateStatus, LinkedPullRequestMerge> = {
  CLEAN: "ready",
  HAS_HOOKS: "ready",
  UNSTABLE: "ready",
  BEHIND: "behind",
  DIRTY: "conflict",
  BLOCKED: "blocked",
  DRAFT: "unknown",
  UNKNOWN: "unknown",
};

/** Whether an open PR can go in; `mergeable` may say CONFLICTING while the state is still being computed. */
function linkedMerge(pr: LinkedPullRequestNode): LinkedPullRequestMerge {
  return pr.mergeable === "CONFLICTING" ? "conflict" : MERGES[pr.mergeStateStatus];
}

function linkedStatus(pr: LinkedPullRequestNode): LinkedPullRequestStatus {
  if (pr.state === "OPEN") return pr.isDraft ? "draft" : "open";
  return pr.state === "MERGED" ? "merged" : "closed";
}
