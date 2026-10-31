// The Dependency graph (GLOSSARY.md) of an issue's detail sheet: what of its family is drawn, and the mermaid code that
// draws it. No DOM: the sheet's DependencyGraph renders the code and finds each node's issue again by its id.

import type { FamilyMember, GraphIssue, IssueFamily } from "../../src/domain/issue-graph.js";
import type { Issue } from "../../src/domain/issues.js";
import { sameRepo } from "../../src/domain/repos.js";
import type { IssueBoardState } from "./api.js";
import { count } from "./badges.js";
import type { ShownIssue } from "./issueDetail.js";
import { subIssuesMark } from "./issueMarks.js";

/**
 * How a node is drawn, each a class `dep-<mark>` on its SVG node (prefixed, so the page's own `.blocked` and the like do
 * not reach it) that style.css colours from the tokens: the open sheet's issue
 * (`current`, a thick `--blue` border), open with an open blocker (`blocked`, `--pending`), closed as `completed`
 * (`--merged`) or as `not_planned` (`--muted`, dashed), and a neighbour from outside the family (`external`, dotted). An
 * open issue with none is drawn plain.
 */
export type NodeMark = "current" | "blocked" | "completed" | "not_planned" | "external";

/** A node: its mermaid id (`n0`, `n1`, …), the issue, and how it is drawn. */
export type GraphNode = { id: string; issue: GraphIssue; marks: NodeMark[] };

/** An arrow from a blocker to the issue it blocks, by node id. */
export type GraphEdge = { from: string; to: string };

export type DrawnGraph = {
  /** The open issue's repo: a node of another one is labelled `owner/name#n`. */
  repo: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

/** How long a title may be on its node before it is shortened. */
const TITLE_LENGTH = 40;

const keyOf = (issue: { repo: string; number: number }) => `${issue.repo.toLowerCase()}#${issue.number}`;

const sameIssue = (a: { repo: string; number: number }, b: { repo: string; number: number }) => a.number === b.number && sameRepo(a.repo, b.repo);

/**
 * What is drawn of a family: the head's sub-issues (the head too when it is the open issue; the issue alone when it has no
 * family) and the blockers between them, each arrow once though both its ends record it; and, one step out, the open
 * issue's own blockers and the issues it blocks that are outside the family (`external`). The other members' neighbours
 * outside it are not drawn, but an open blocker still makes its issue blocked.
 */
export function familyGraph(family: IssueFamily): DrawnGraph {
  const isHead = !family.head || sameIssue(family.head, family.issue);
  const members: FamilyMember[] = isHead ? [family.issue, ...family.members] : family.members;
  const nodes: GraphNode[] = members.map((member, index) => ({ id: `n${index}`, issue: member, marks: marksOf(member, family.issue) }));
  const ids = new Map(nodes.map((node) => [keyOf(node.issue), node.id]));
  for (const neighbour of [...family.issue.blockedBy, ...family.issue.blocking]) {
    if (ids.has(keyOf(neighbour))) continue;
    const id = `n${nodes.length}`;
    nodes.push({ id, issue: neighbour, marks: ["external", ...(neighbour.state === "open" ? [] : [neighbour.state])] });
    ids.set(keyOf(neighbour), id);
  }
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const connect = (blocker: GraphIssue, blocked: GraphIssue) => {
    const from = ids.get(keyOf(blocker));
    const to = ids.get(keyOf(blocked));
    if (!from || !to || seen.has(`${from}>${to}`)) return;
    seen.add(`${from}>${to}`);
    edges.push({ from, to });
  };
  for (const member of members) {
    for (const blocker of member.blockedBy) connect(blocker, member);
    for (const blocked of member.blocking) connect(member, blocked);
  }
  return { repo: family.issue.repo, nodes, edges };
}

/**
 * The note under the graph when GitHub counts more than it holds, "още 3 issues": the head's sub-issues and the issue's
 * blockers both ways that the token cannot see (or past a page); null when nothing is missing.
 */
export function hiddenNote(family: IssueFamily): string | null {
  const more = (total: number, drawn: number) => Math.max(0, total - drawn);
  const hidden =
    (family.head ? more(family.head.subIssues.total, family.members.length) : 0) +
    more(family.totals.blockedBy, family.issue.blockedBy.length) +
    more(family.totals.blocking, family.issue.blocking.length);
  return hidden ? `още ${count(hidden, "issue", "issues")}` : null;
}

/** Mermaid's id of a drawn node: `<svg id>-flowchart-<node id>-<n>`. */
const DRAWN_NODE = /-flowchart-(n\d+)-\d+$/;

/** The node mermaid drew as the SVG element with id `domId`, so a click on it finds its issue; undefined for any other. */
export function graphNodeAt(graph: DrawnGraph, domId: string): GraphNode | undefined {
  const id = DRAWN_NODE.exec(domId)?.[1];
  return id ? graph.nodes.find((node) => node.id === id) : undefined;
}

/**
 * A node's issue as the open repo's issues have it (open, or closed within the window), so opening the node switches the
 * sheet to it; undefined when it is not among them (closed before the window, of another repo), and GitHub opens instead.
 */
export function nodeInSnapshot(issue: { repo: string; number: number }, board: IssueBoardState | null): ShownIssue | undefined {
  // GitHub's name of the repo may differ in case from the followed one the state is under.
  return [...(board?.issues ?? []), ...(board?.closed ?? [])].find((shown) => sameIssue(shown, issue));
}

/** Whether the sheet has a "Зависимости" section: the issue has a parent, sub-issues, or blockers either way. */
export function hasDependencies(issue: Pick<Issue, "parent" | "subIssues" | "dependencies">): boolean {
  return issue.parent !== null || issue.subIssues.total > 0 || issue.dependencies.totalBlockedBy > 0 || issue.dependencies.totalBlocking > 0;
}

/**
 * The section's summary line, "3/9 затворени": the head's sub-issues by GitHub's counts. Until the graph comes, by the open
 * repo's issues: the parent's when it is among them, else the issue's own; null when there is nothing to count.
 */
export function graphSummary(issue: Pick<Issue, "repo" | "parent" | "subIssues">, board: IssueBoardState | null, family: IssueFamily | null): string | null {
  const parent = issue.parent;
  const progress = family
    ? family.head?.subIssues
    : parent
      ? nodeInSnapshot(parent, board)?.subIssues
      : issue.subIssues;
  return progress?.total ? `${progress.completed}/${progress.total} затворени` : null;
}

/**
 * Whether a poll changed the family drawn, so the graph is fetched again: the issue, the head or a member as the open
 * repo's issues have it (`before` and `after` the poll) was updated, closed, first showed or left, or its parent, sub-issues
 * or blockers changed by GitHub's counts. Issues of another repo, or not among the repo's, are not seen to change.
 */
export function familyChanged(family: IssueFamily, before: IssueBoardState | null, after: IssueBoardState): boolean {
  const drawn = [family.issue, ...(family.head ? [family.head] : []), ...family.members];
  const fingerprint = (state: IssueBoardState | null, issue: GraphIssue) => {
    const found = nodeInSnapshot(issue, state);
    return found ? JSON.stringify([found.updatedAt, found.closedAt, found.parent, found.subIssues, found.dependencies]) : "";
  };
  return drawn.some((issue) => fingerprint(before, issue) !== fingerprint(after, issue));
}

function marksOf(member: FamilyMember, current: GraphIssue): NodeMark[] {
  const marks: NodeMark[] = sameIssue(member, current) ? ["current"] : [];
  if (member.state !== "open") marks.push(member.state);
  else if (member.blockedBy.some((blocker) => blocker.state === "open")) marks.push("blocked");
  return marks;
}

/**
 * The mermaid code of a graph: a flowchart left to right (the order work goes in), a node per issue with its `#n`, its
 * title shortened and its own sub-issues' progress, an arrow per blocker, and the nodes' classes. No `click` lines: mermaid
 * draws in its strict mode, so the page itself handles a node being opened.
 */
export function graphMermaid(graph: DrawnGraph): string {
  const out = ["flowchart LR"];
  for (const { id, issue } of graph.nodes) out.push(`  ${id}["${escape(nodeLabel(issue, graph.repo))}"]`);
  for (const { from, to } of graph.edges) out.push(`  ${from} --> ${to}`);
  // One line per class, apart from the nodes: mermaid mangles a line that looks like a style with an entity in it.
  const MARKS: NodeMark[] = ["current", "blocked", "completed", "not_planned", "external"];
  for (const mark of MARKS) {
    const ids = graph.nodes.filter((node) => node.marks.includes(mark)).map((node) => node.id);
    if (ids.length) out.push(`  class ${ids.join(",")} dep-${mark}`);
  }
  return out.join("\n");
}

/** A node's text: `#n`, or `owner/name#n` for an issue of another repo than `repo`, then the title shortened and its own sub-issues' progress. */
export function nodeLabel(issue: GraphIssue, repo: string): string {
  const progress = subIssuesMark(issue.subIssues);
  const ref = `${sameRepo(issue.repo, repo) ? "" : issue.repo}#${issue.number}`;
  return `${ref} ${shorten(issue.title)}${progress ? ` · ${progress.text}` : ""}`;
}

/** A title cut to TITLE_LENGTH at a word's end, with "…". */
function shorten(title: string): string {
  if (title.length <= TITLE_LENGTH) return title;
  const cut = title.slice(0, TITLE_LENGTH);
  const space = cut.lastIndexOf(" ");
  return `${(space > TITLE_LENGTH / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Mermaid's entity codes for what it would read in a label as syntax. */
const ENTITIES: Record<string, string> = { "#": "#35;", '"': "#quot;", ":": "#58;", ";": "#59;", "<": "#lt;", ">": "#gt;" };

const escape = (label: string) => label.replace(/[#":;<>]/g, (char) => ENTITIES[char]!);
