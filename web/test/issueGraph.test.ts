import { describe, expect, it } from "vitest";
import type { FamilyMember, GraphIssue, IssueFamily } from "../../src/domain/issue-graph.js";
import type { IssueBoardState } from "../src/api.js";
import { familyChanged, familyGraph, graphMermaid, graphNodeAt, graphSummary, hasDependencies, hiddenNote, nodeInSnapshot } from "../src/issueGraph.js";
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

/** GitHub's blocker counts for a family whose issue's blockers are all seen or none. */
const NO_TOTALS = { blockedBy: 0, blocking: 0 };

/** The family of parent #1: sub-issue #2 blocks #3, which is the open sheet's issue, and #4 is on its own. */
function family(overrides: Partial<IssueFamily> = {}): IssueFamily {
  const members = [member(2, { blocking: [gi(3)] }), member(3, { blockedBy: [gi(2)] }), member(4)];
  return { issue: members[1]!, head: gi(1), members, totals: NO_TOTALS, ...overrides };
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
    const graph = familyGraph({ issue: members[1]!, head: gi(1), members, totals: NO_TOTALS });

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
    const graph = familyGraph({ issue: member(1, { subIssues: { total: 3, completed: 1 } }), head: gi(1), members, totals: NO_TOTALS });

    expect(graph.nodes.map((node) => node.marks)).toEqual([["current"], ["completed"], [], ["not_planned"]]);
    expect(graph.edges).toHaveLength(1);
  });

  it("draws the open issue's neighbours outside the family, and not the other members'", () => {
    const members = [member(2, { blockedBy: [gi(40)] }), member(3, { blockedBy: [gi(2), gi(41, { repo: "my-org/repo-b" })], blocking: [gi(42)] })];
    const graph = familyGraph({ issue: members[1]!, head: gi(1), members, totals: NO_TOTALS });
    const number = (id: string) => graph.nodes.find((node) => node.id === id)!.issue.number;

    expect(graph.nodes.map((node) => [node.issue.number, node.marks])).toEqual([
      [2, ["blocked"]],
      [3, ["current", "blocked"]],
      [41, ["external"]],
      [42, ["external"]],
    ]);
    expect(graph.edges.map(({ from, to }) => [number(from), number(to)])).toEqual([
      [2, 3],
      [41, 3],
      [3, 42],
    ]);
  });

  it("draws an issue with no family with its blockers and what it blocks, one step out, as outside it", () => {
    const issue = member(7, { blockedBy: [gi(5)], blocking: [gi(8), gi(9, { state: "completed" })] });
    const graph = familyGraph({ issue, head: null, members: [], totals: NO_TOTALS });
    const number = (id: string) => graph.nodes.find((node) => node.id === id)!.issue.number;

    expect(graph.nodes.map((node) => [node.issue.number, node.marks])).toEqual([
      [7, ["current", "blocked"]],
      [5, ["external"]],
      [8, ["external"]],
      [9, ["external", "completed"]],
    ]);
    expect(graph.edges.map(({ from, to }) => [number(from), number(to)])).toEqual([
      [5, 7],
      [7, 8],
      [7, 9],
    ]);
  });

  it("draws the family's head as the open issue when its own sheet is open, with its blockers in and out of the family", () => {
    // Head #1: its sub-issue #2 blocks it, it blocks its sub-issue #3; #50 outside blocks it, it blocks #51 outside.
    const issue = member(1, { blockedBy: [gi(2), gi(50)], blocking: [gi(3), gi(51)], subIssues: { total: 2, completed: 0 } });
    const members = [member(2, { blocking: [gi(1)] }), member(3, { blockedBy: [gi(1)] })];
    const graph = familyGraph({ issue, head: gi(1, { subIssues: { total: 2, completed: 0 } }), members, totals: NO_TOTALS });
    const number = (id: string) => graph.nodes.find((node) => node.id === id)!.issue.number;

    expect(graph.nodes.map((node) => [node.issue.number, node.marks])).toEqual([
      [1, ["current", "blocked"]],
      [2, []],
      [3, ["blocked"]],
      [50, ["external"]],
      [51, ["external"]],
    ]);
    expect(graph.edges.map(({ from, to }) => [number(from), number(to)])).toEqual([
      [2, 1],
      [50, 1],
      [1, 3],
      [1, 51],
    ]);
  });

  it("draws an issue with no family on its own", () => {
    const graph = familyGraph({ issue: member(7), head: null, members: [], totals: NO_TOTALS });

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

describe("hiddenNote", () => {
  it("says nothing when the graph holds all GitHub counts", () => {
    const issue = member(3, { blockedBy: [gi(2)], blocking: [gi(9)] });

    expect(hiddenNote({ issue, head: gi(1, { subIssues: { total: 2, completed: 0 } }), members: [member(2), issue], totals: { blockedBy: 1, blocking: 1 } })).toBeNull();
    expect(hiddenNote({ issue: member(7), head: null, members: [], totals: NO_TOTALS })).toBeNull();
  });

  it("says how many more sub-issues and blockers GitHub counts than the graph holds, in the right plural", () => {
    const issue = member(3, { blockedBy: [gi(2)] });

    expect(hiddenNote({ issue, head: gi(1, { subIssues: { total: 3, completed: 0 } }), members: [member(2), issue], totals: { blockedBy: 1, blocking: 0 } })).toBe("още 1 issue");
    expect(hiddenNote({ issue, head: null, members: [], totals: { blockedBy: 2, blocking: 2 } })).toBe("още 3 issues");
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

  it("says how many of the head's sub-issues are completed, by the graph once it has come", () => {
    expect(graphSummary(issue({ number: 3, parent }), null, family({ head: gi(1, { subIssues: { total: 9, completed: 3 } }) }))).toBe("3/9 завършени");
  });

  it("says it by the open repo's issues while the graph loads: the parent's, or the issue's own", () => {
    const board = state([issue({ number: 1, subIssues: { total: 4, completed: 1 } })]);

    expect(graphSummary(issue({ number: 3, parent }), board, null)).toBe("1/4 завършени");
    expect(graphSummary(issue({ number: 1, subIssues: { total: 4, completed: 1 } }), board, null)).toBe("1/4 завършени");
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
    const code = lines(graphMermaid(familyGraph({ issue: members[0]!, head: gi(1), members, totals: NO_TOTALS })));

    expect(code).toContain('n0["#35;2 Issue 2 · 3/5"]');
  });

  it("puts the nodes in classes by state, and the open issue in its own", () => {
    const members = [member(2, { state: "completed" }), member(3, { blockedBy: [gi(9)] }), member(4, { state: "not_planned" }), member(5, { state: "completed" })];
    const code = lines(graphMermaid(familyGraph({ issue: members[1]!, head: gi(1), members, totals: NO_TOTALS })));

    expect(code).toEqual(expect.arrayContaining(["class n1 dep-current", "class n1 dep-blocked", "class n0,n3 dep-completed", "class n2 dep-not_planned"]));
  });

  it("puts the neighbours outside the family in their own class, one from another repo labelled owner/name#n", () => {
    const issue = member(7, { blockedBy: [gi(5)], blocking: [gi(8, { repo: "My-Org/repo-a" }), gi(9, { repo: "other-org/repo-c", title: "Elsewhere" })] });
    const code = lines(graphMermaid(familyGraph({ issue, head: null, members: [], totals: NO_TOTALS })));

    expect(code).toEqual(expect.arrayContaining(["class n0 dep-current", "class n1,n2,n3 dep-external"]));
    expect(code).toContain('n2["#35;8 Issue 8"]');
    expect(code).toContain('n3["other-org/repo-c#35;9 Elsewhere"]');
  });

  it("escapes what mermaid reads in a label and shortens a long title", () => {
    const title = 'Fix "quotes": a#b; <tag> and a title that goes on far longer than a node should be wide';
    const members = [member(2, { title })];
    const [label] = lines(graphMermaid(familyGraph({ issue: members[0]!, head: gi(1), members, totals: NO_TOTALS }))).filter((line) => line.startsWith("n0["));

    expect(label).toBe('n0["#35;2 Fix #quot;quotes#quot;#58; a#35;b#59; #lt;tag#gt; and a title…"]');
  });
});

describe("graphNodeAt", () => {
  it("finds the node mermaid drew under an SVG id, by the node id it ends in", () => {
    const graph = familyGraph(family());

    expect(graphNodeAt(graph, "graph-3-flowchart-n1-7")?.issue.number).toBe(3);
    expect(graphNodeAt(graph, "graph-3-flowchart-n12-0")).toBeUndefined();
    expect(graphNodeAt(graph, "graph-3-flowchart-n1-7-label")).toBeUndefined();
  });
});

describe("nodeInSnapshot", () => {
  const board: IssueBoardState = {
    repo: "my-org/repo-a",
    fetchedAt: "2026-11-01T10:00:00Z",
    stages: [],
    issues: [{ ...issue({ number: 2 }), stage: null }],
    totalCount: 1,
    closed: [closedIssue({ number: 4 })],
    polling: false,
    error: null,
  };

  it("finds a node's issue among the open repo's open and recently closed issues, whatever the case of GitHub's repo name", () => {
    expect(nodeInSnapshot(gi(2, { repo: "My-Org/Repo-A" }), board)?.number).toBe(2);
    expect(nodeInSnapshot(gi(4, { state: "completed" }), board)?.number).toBe(4);
  });

  it("finds nothing for an issue closed before the window, one of another repo, or before the repo's issues come", () => {
    expect(nodeInSnapshot(gi(9, { state: "completed" }), board)).toBeUndefined();
    expect(nodeInSnapshot(gi(2, { repo: "my-org/repo-b" }), board)).toBeUndefined();
    expect(nodeInSnapshot(gi(2), null)).toBeUndefined();
  });
});
