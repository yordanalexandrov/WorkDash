// The Dependency graph's data (GLOSSARY.md): an issue's family as GitHub records it, fetched apart from the poll when its
// detail sheet opens. What is drawn of it is decided on the page (web/src/issueGraph.ts).

import type { SubIssueProgress } from "./issues.js";

/** How an issue in the graph stands: open, or closed as completed or as not planned (a duplicate too). */
export type GraphIssueState = "open" | "completed" | "not_planned";

/** An issue as the graph knows it: enough to draw its node and link to it. */
export type GraphIssue = {
  repo: string;
  number: number;
  title: string;
  url: string;
  state: GraphIssueState;
  /** Its own sub-issues, one level down: the node shows "3/5". */
  subIssues: SubIssueProgress;
};

/** An issue of the family with its blockers both ways, perhaps from outside the family or the repo. */
export type FamilyMember = GraphIssue & {
  /** The issues blocking it, open and closed. */
  blockedBy: GraphIssue[];
  /** The issues it blocks, open and closed. */
  blocking: GraphIssue[];
};

/**
 * What GET /api/issues/graph returns: the issue whose sheet is open, and the family it is drawn in. That is its parent's
 * sub-issues when it is a sub-issue, else its own sub-issues; an issue with neither has no family (`head` null, no members).
 */
export type IssueFamily = {
  issue: FamilyMember;
  /** The parent issue whose sub-issues are drawn: the issue's parent, or the issue itself; null when it has neither. */
  head: GraphIssue | null;
  /** The head's sub-issues, closed ones too, the issue itself among them when it is a sub-issue. */
  members: FamilyMember[];
};
