import type { ClosedIssue, Issue, IssueSnapshot } from "../domain/issues.js";
import { postGraphQL } from "./client.js";
import { PAGE_SIZE } from "./query.js";

// One query per poll of the open repo: no comment bodies, so it stays cheap enough to run on every visit.
const LABELS_PAGE_SIZE = 20;
const ASSIGNEES_PAGE_SIZE = 10;

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
      nodes { ...IssueFields closedAt stateReason }
    }
  }
}

fragment IssueFields on Issue {
  number
  title
  url
  createdAt
  updatedAt
  author { login }
  labels(first: ${LABELS_PAGE_SIZE}) { nodes { name color } }
  assignees(first: ${ASSIGNEES_PAGE_SIZE}) { nodes { login } }
  comments { totalCount }
}`;

type IssueNode = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  author: { login: string } | null;
  labels: { nodes: { name: string; color: string }[] };
  assignees: { nodes: { login: string }[] };
  comments: { totalCount: number };
};

/** A closed issue: GitHub's state reason is null for issues closed before it had one. */
type ClosedIssueNode = IssueNode & { closedAt: string; stateReason: string | null };

type IssuesData = {
  repository: { nameWithOwner: string; issues: { totalCount: number; nodes: IssueNode[] }; closed: { nodes: ClosedIssueNode[] } } | null;
};

/**
 * Fetches the open issues of `repo` and those closed since `closedSince`, the most recently closed first; fails when GitHub
 * returns no repository, so the last saved snapshot stays.
 */
export async function fetchIssues(options: { repo: string; token: string; closedSince: Date; fetch?: typeof globalThis.fetch }): Promise<IssueSnapshot> {
  const { repo, token, closedSince, fetch = globalThis.fetch } = options;
  const [owner, name] = repo.split("/") as [string, string];
  const variables = { owner, name, since: closedSince.toISOString() };
  const { data, failure } = await postGraphQL<IssuesData>({ query: ISSUES_QUERY, variables }, token, fetch);
  const repository = data?.repository;
  if (!repository) throw failure(`no repository ${repo}`);
  return {
    repo,
    totalCount: repository.issues.totalCount,
    issues: repository.issues.nodes.map((node) => toIssue(repo, node)),
    closed: repository.closed.nodes
      .filter((node) => Date.parse(node.closedAt) >= closedSince.getTime())
      .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
      .map((node) => toClosedIssue(repo, node)),
  };
}

function toClosedIssue(repo: string, node: ClosedIssueNode): ClosedIssue {
  const closedAs = node.stateReason === "NOT_PLANNED" || node.stateReason === "DUPLICATE" ? "not_planned" : "completed";
  return { ...toIssue(repo, node), closedAt: node.closedAt, closedAs };
}

function toIssue(repo: string, node: IssueNode): Issue {
  return {
    repo,
    number: node.number,
    title: node.title,
    url: node.url,
    author: node.author?.login ?? "ghost",
    labels: node.labels.nodes.map(({ name, color }) => ({ name, color })),
    assignees: node.assignees.nodes.map((assignee) => assignee.login),
    comments: node.comments.totalCount,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}
