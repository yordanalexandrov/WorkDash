import type { FamilyMember, GraphIssue, GraphIssueState, IssueFamily } from "../domain/issue-graph.js";
import { postGraphQL } from "./client.js";

// The Dependency graph's own query, apart from the poll's: run when an issue's detail sheet opens, at most once a minute.
/** GitHub's limit for one connection; a family is drawn whole up to it. */
const SUB_ISSUES_PAGE_SIZE = 100;
const BLOCKERS_PAGE_SIZE = 50;

/** The issue, its parent and the parent's sub-issues, its own sub-issues, and each one's blockers both ways. */
const familyQuery = (number: number) => `query IssueGraph($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issue(number: ${number}) {
      ...member
      parent { ...ref subIssues(first: ${SUB_ISSUES_PAGE_SIZE}) { nodes { ...member } } }
      subIssues(first: ${SUB_ISSUES_PAGE_SIZE}) { nodes { ...member } }
    }
  }
}

fragment ref on Issue {
  number
  title
  url
  state
  stateReason
  repository { nameWithOwner }
  subIssuesSummary { total completed }
}

fragment member on Issue {
  ...ref
  blockedBy(first: ${BLOCKERS_PAGE_SIZE}) { nodes { ...ref } }
  blocking(first: ${BLOCKERS_PAGE_SIZE}) { nodes { ...ref } }
}`;

type RefNode = {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED";
  stateReason: string | null;
  repository: { nameWithOwner: string };
  subIssuesSummary: { total: number; completed: number };
};

type MemberNode = RefNode & { blockedBy: { nodes: RefNode[] }; blocking: { nodes: RefNode[] } };

type FamilyData = {
  repository: {
    issue: (MemberNode & { parent: (RefNode & { subIssues: { nodes: MemberNode[] } }) | null; subIssues: { nodes: MemberNode[] } }) | null;
  } | null;
};

/**
 * The family of issue `number` of `repo` (`IssueFamily`): a sub-issue's parent and its sub-issues, else the issue's own
 * sub-issues. Fails when GitHub returns no such issue.
 */
export async function fetchIssueFamily(options: { repo: string; number: number; token: string; fetch?: typeof globalThis.fetch }): Promise<IssueFamily> {
  const { repo, number, token, fetch = globalThis.fetch } = options;
  const [owner, name] = repo.split("/") as [string, string];
  const { data, failure } = await postGraphQL<FamilyData>({ query: familyQuery(number), variables: { owner, name } }, token, fetch);
  const issue = data?.repository?.issue;
  if (!issue) throw failure(`no issue ${repo}#${number}`);

  const parent = issue.parent;
  const own = issue.subIssues.nodes;
  const family = parent ? { head: toIssue(parent), members: parent.subIssues.nodes } : own.length ? { head: toIssue(issue), members: own } : { head: null, members: [] };
  return { issue: toMember(issue), head: family.head, members: family.members.map(toMember) };
}

/** A closed issue's reason as the poll reads it (`toClosedIssue`): not planned or a duplicate, else completed. */
function stateOf(node: RefNode): GraphIssueState {
  if (node.state === "OPEN") return "open";
  return node.stateReason === "NOT_PLANNED" || node.stateReason === "DUPLICATE" ? "not_planned" : "completed";
}

function toIssue(node: RefNode): GraphIssue {
  return {
    repo: node.repository.nameWithOwner,
    number: node.number,
    title: node.title,
    url: node.url,
    state: stateOf(node),
    subIssues: { total: node.subIssuesSummary.total, completed: node.subIssuesSummary.completed },
  };
}

function toMember(node: MemberNode): FamilyMember {
  return { ...toIssue(node), blockedBy: node.blockedBy.nodes.map(toIssue), blocking: node.blocking.nodes.map(toIssue) };
}
