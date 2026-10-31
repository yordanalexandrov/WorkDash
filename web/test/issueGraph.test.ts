import { describe, expect, it } from "vitest";
import type { FamilyMember, GraphIssue, IssueFamily } from "../../src/domain/issue-graph.js";
import type { IssueBoardState } from "../src/api.js";
import { familyChanged, familyGraph, graphMermaid, graphSummary, hasDependencies } from "../src/issueGraph.js";
import { closedIssue, issue } from "../../test/fixtures.js";

const gi = (number: number, overrides: Partial<GraphIssue> = {}): GraphIssue => ({
  repo: "my-org/repo-a",
  number,
  title: `Issue ${number}`,
  url: `https://github.com/my-org/repo-a/issues/${number}`,
  state: "open",
  subIssues: { total: 0, completed: 0 },
  ...overrides,
});

const member = (number: number, overrides: Partial<FamilyMember> = {}): FamilyMember => ({ ...gi(number), blockedBy: [], blocking: [], ...overrides });

/** The family of parent #1: sub-issue #2 blocks #3, which is the open sheet's issue, and #4 is on its own. */
function family(overrides: Partial<IssueFamily> = {}): IssueFamily {
  const members = [member(2, { blocking: [gi(3)] }), member(3, { blockedBy: [gi(2)] }), member(4)];
  return { issue: members[1]!, head: gi(1), members, ...overrides };
}

/** The mermaid code without its indentation, line by line. */
const lines = (code: string) => code.split("\n").map((line) => line.trim());

describe("familyGraph", () => {
  it("draws the head's sub-issues, the open issue among them marked", () => {
    const graph = familyGraph(family());

    expect(graph.nodes.map((node) => node.issue.number)).toEqual([2, 3, 4]);
    expect(graph.nodes.map((node) => node.marks)).toEqual([[], ["current", "blocked"], []]);
  });

  it("draws an arrow from each blocker to what it blocks, once, though both ends record it", () => {
    const graph = familyGraph(family());

    expect(graph.edges.map(({ from, to }) => [graph.nodes.find((n) => n.id === from)!.issue.number, graph.nodes.find((n) => n.id === to)!.issue.number])).toEqual([[2, 3]]);
  });

  it("draws no arrow to a blocker outside the family, though one still makes its issue blocked", () => {
    const outside = gi(99, { repo: "my-org/repo-b" });
    const members = [member(5, { blockedBy: [outside] }), member(6)];
    const graph = familyGraph({ issue: members[1]!, head: gi(1), members });

    expect(graph.nodes.map((node) => node.issue.number)).toEqual([5, 6]);
    expect(graph.nodes[0]!.marks).toEqual(["blocked"]);
    expect(graph.edges).toEqual([]);
  });

  it("marks closed issues by how they were closed, and a closed blocker blocks nothing", () => {
    const members = [
      member(2, { state: "completed", blocking: [gi(3)] }),
      member(3, { blockedBy: [gi(2, { state: "completed" })] }),
      member(4, { state: "not_planned" }),
    ];
    const graph = familyGraph({ issue: member(1, { subIssues: { total: 3, completed: 1 } }), head: gi(1), members });

    expect(graph.nodes.map((node) => node.marks)).toEqual([["completed"], [], ["not_planned"]]);
    expect(graph.edges).toHaveLength(1);
  });

  it("draws an issue with no family on its own", () => {
    const graph = familyGraph({ issue: member(7), head: null, members: [] });

    expect(graph.nodes.map((node) => [node.issue.number, node.marks])).toEqual([[7, ["current"]]]);
  });
});

describe("familyChanged", () => {
  const board = (issues: ReturnType<typeof issue>[], closed: ReturnType<typeof closedIssue>[] = []): IssueBoardState => ({
    repo: "my-org/repo-a",
    fetchedAt: "2026-11-01T10:00:00Z",
    stages: [],
    issues: issues.map((one) => ({ ...one, stage: null })),
    totalCount: issues.length,
    closed,
    polling: false,
    error: null,
  });
  const before = board([issue({ number: 1 }), issue({ number: 3 }), issue({ number: 50 })]);

  it("sees no change when a poll brings the drawn issues as they were, though others changed", () => {
    const after = board([issue({ number: 1 }), issue({ number: 3 }), issue({ number: 50, updatedAt: "2026-11-01T11:00:00Z" })]);

    expect(familyChanged(family(), before, after)).toBe(false);
  });

  it("sees a change when a drawn issue, or the head, was updated or its sub-issues or blockers changed", () => {
    expect(familyChanged(family(), before, board([issue({ number: 1 }), issue({ number: 3, updatedAt: "2026-11-01T11:00:00Z" })]))).toBe(true);
    expect(familyChanged(family(), before, board([issue({ number: 1, subIssues: { total: 4, completed: 0 } }), issue({ number: 3 })]))).toBe(true);
    expect(familyChanged(family(), before, board([issue({ number: 1 }), issue({ number: 3, dependencies: { blockedBy: 0, totalBlockedBy: 1, blocking: 0, totalBlocking: 0 } })]))).toBe(true);
  });

  it("sees a change when a drawn issue closes or first shows", () => {
    expect(familyChanged(family(), before, board([issue({ number: 1 })], [closedIssue({ number: 3 })]))).toBe(true);
    expect(familyChanged(family(), before, board([issue({ number: 1 }), issue({ number: 3 }), issue({ number: 4 })]))).toBe(true);
  });
});

describe("hasDependencies", () => {
  it("is so for an issue with a parent, sub-issues or blockers either way, and not for one with none", () => {
    expect(hasDependencies(issue())).toBe(false);
    expect(hasDependencies(issue({ parent: { repo: "my-org/repo-a", number: 1, title: "Parent" } }))).toBe(true);
    expect(hasDependencies(issue({ subIssues: { total: 2, completed: 2 } }))).toBe(true);
    expect(hasDependencies(issue({ dependencies: { blockedBy: 0, totalBlockedBy: 1, blocking: 0, totalBlocking: 0 } }))).toBe(true);
    expect(hasDependencies(issue({ dependencies: { blockedBy: 0, totalBlockedBy: 0, blocking: 0, totalBlocking: 1 } }))).toBe(true);
  });
});

describe("graphSummary", () => {
  const parent = { repo: "my-org/repo-a", number: 1, title: "Parent" };
  const state = (issues: ReturnType<typeof issue>[]): IssueBoardState => ({
    repo: "my-org/repo-a",
    fetchedAt: null,
    stages: [],
    issues: issues.map((one) => ({ ...one, stage: null })),
    totalCount: issues.length,
    closed: [],
    polling: false,
    error: null,
  });

  it("says how many of the head's sub-issues are closed, by the graph once it has come", () => {
    expect(graphSummary(issue({ number: 3, parent }), null, family({ head: gi(1, { subIssues: { total: 9, completed: 3 } }) }))).toBe("3/9 затворени");
  });

  it("says it by the open repo's issues while the graph loads: the parent's, or the issue's own", () => {
    const board = state([issue({ number: 1, subIssues: { total: 4, completed: 1 } })]);

    expect(graphSummary(issue({ number: 3, parent }), board, null)).toBe("1/4 затворени");
    expect(graphSummary(issue({ number: 1, subIssues: { total: 4, completed: 1 } }), board, null)).toBe("1/4 затворени");
    expect(graphSummary(issue({ number: 3, parent: { ...parent, number: 77 } }), board, null)).toBeNull();
    expect(graphSummary(issue({ number: 5 }), board, null)).toBeNull();
  });
});

describe("graphMermaid", () => {
  it("draws a flowchart left to right with an arrow from the blocker to the blocked", () => {
    const code = lines(graphMermaid(familyGraph(family())));

    expect(code[0]).toBe("flowchart LR");
    expect(code).toContain("n0 --> n1");
    expect(code).not.toContain("n1 --> n0");
  });

  it("labels each node with its number and title, and its own sub-issues' progress", () => {
    const members = [member(2, { subIssues: { total: 5, completed: 3 } })];
    const code = lines(graphMermaid(familyGraph({ issue: members[0]!, head: gi(1), members })));

    expect(code).toContain('n0["#35;2 Issue 2 · 3/5"]');
  });

  it("puts the nodes in classes by state, and the open issue in its own", () => {
    const members = [member(2, { state: "completed" }), member(3, { blockedBy: [gi(9)] }), member(4, { state: "not_planned" }), member(5, { state: "completed" })];
    const code = lines(graphMermaid(familyGraph({ issue: members[1]!, head: gi(1), members })));

    expect(code).toEqual(expect.arrayContaining(["class n1 dep-current", "class n1 dep-blocked", "class n0,n3 dep-completed", "class n2 dep-not_planned"]));
  });

  it("escapes what mermaid reads in a label and shortens a long title", () => {
    const title = 'Fix "quotes": a#b; <tag> and a title that goes on far longer than a node should be wide';
    const members = [member(2, { title })];
    const [label] = lines(graphMermaid(familyGraph({ issue: members[0]!, head: gi(1), members }))).filter((line) => line.startsWith("n0["));

    expect(label).toBe('n0["#35;2 Fix #quot;quotes#quot;#58; a#35;b#59; #lt;tag#gt; and a title…"]');
  });
});
