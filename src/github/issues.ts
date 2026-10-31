import type { Issue, IssueSnapshot } from "../domain/issues.js";
import { postGraphQL } from "./client.js";
import { PAGE_SIZE } from "./query.js";

// One query per poll of the open repo: no comment bodies, so it stays cheap enough to run on every visit.
const LABELS_PAGE_SIZE = 20;
const ASSIGNEES_PAGE_SIZE = 10;

/** The query for the open issues of one repo, the most recently updated first, and how many are open in all. */
const ISSUES_QUERY = `query RepositoryIssues($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    issues(states: OPEN, first: ${PAGE_SIZE}, orderBy: { field: UPDATED_AT, direction: DESC }) {
      totalCount
      nodes {
        number
        title
        url
        createdAt
        updatedAt
        author { login }
        labels(first: ${LABELS_PAGE_SIZE}) { nodes { name color } }
        assignees(first: ${ASSIGNEES_PAGE_SIZE}) { nodes { login } }
        comments { totalCount }
      }
    }
  }
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

type IssuesData = {
  repository: { nameWithOwner: string; issues: { totalCount: number; nodes: IssueNode[] } } | null;
};

/** Fetches the open issues of `repo`; fails when GitHub returns no repository, so the last saved snapshot stays. */
export async function fetchIssues(options: { repo: string; token: string; fetch?: typeof globalThis.fetch }): Promise<IssueSnapshot> {
  const { repo, token, fetch = globalThis.fetch } = options;
  const [owner, name] = repo.split("/") as [string, string];
  const { data, failure } = await postGraphQL<IssuesData>({ query: ISSUES_QUERY, variables: { owner, name } }, token, fetch);
  const repository = data?.repository;
  if (!repository) throw failure(`no repository ${repo}`);
  return {
    repo,
    totalCount: repository.issues.totalCount,
    issues: repository.issues.nodes.map((node) => toIssue(repo, node)),
  };
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
