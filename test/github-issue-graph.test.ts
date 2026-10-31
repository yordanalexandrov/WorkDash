import { describe, expect, it } from "vitest";
import { fetchIssueFamily } from "../src/github/issue-graph.js";

type Call = { query: string; variables: Record<string, string> };

/** A stand-in for api.github.com that answers every query with `answer` and records what was asked. */
function fakeGitHub(answer: unknown) {
  const calls: Call[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)) as Call);
    return Response.json(answer);
  };
  return { fetch, calls };
}

/** An issue as the graph query returns it, open and without sub-issues unless told otherwise. */
function ref(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://github.com/my-org/repo-a/issues/${number}`,
    state: "OPEN",
    stateReason: null,
    repository: { nameWithOwner: "my-org/repo-a" },
    subIssuesSummary: { total: 0, completed: 0 },
    ...overrides,
  };
}

/** A family member: an issue with its blockers both ways. */
function member(number: number, overrides: Record<string, unknown> = {}) {
  return { ...ref(number), blockedBy: { nodes: [] }, blocking: { nodes: [] }, ...overrides };
}

/** GitHub's answer for the sheet's issue, with no blockers by its counts unless told otherwise. */
const answer = (issue: object) => ({ data: { repository: { issue: { issueDependenciesSummary: { totalBlockedBy: 0, totalBlocking: 0 }, ...issue } } } });

const asIssue = (number: number, overrides: Record<string, unknown> = {}) => ({
  repo: "my-org/repo-a",
  number,
  title: `Issue ${number}`,
  url: `https://github.com/my-org/repo-a/issues/${number}`,
  state: "open",
  subIssues: { total: 0, completed: 0 },
  ...overrides,
});

describe("fetchIssueFamily", () => {
  it("asks once for the issue of the one repo by its number, by its own operation name", async () => {
    const github = fakeGitHub(answer({ ...member(7), parent: null, subIssues: { nodes: [] } }));

    await fetchIssueFamily({ repo: "my-org/repo-a", number: 7, token: "t", fetch: github.fetch });

    expect(github.calls).toHaveLength(1);
    expect(github.calls[0]!.query).toMatch(/^query IssueGraph/);
    expect(github.calls[0]!.query).toContain("issue(number: 7)");
    expect(github.calls[0]!.variables).toEqual({ owner: "my-org", name: "repo-a" });
  });

  it("draws a sub-issue in its parent's family, the issue itself among the members", async () => {
    const siblings = [member(7, { blockedBy: { nodes: [ref(8)] } }), member(8, { blocking: { nodes: [ref(7)] } })];
    const github = fakeGitHub(answer({ ...member(7, { blockedBy: { nodes: [ref(8)] } }), parent: { ...ref(5), subIssues: { nodes: siblings } }, subIssues: { nodes: [] } }));

    const family = await fetchIssueFamily({ repo: "my-org/repo-a", number: 7, token: "t", fetch: github.fetch });

    expect(family.head).toEqual(asIssue(5));
    expect(family.members.map((m) => m.number)).toEqual([7, 8]);
    expect(family.issue).toEqual({ ...asIssue(7), blockedBy: [asIssue(8)], blocking: [] });
    expect(family.members[1]).toEqual({ ...asIssue(8), blockedBy: [], blocking: [asIssue(7)] });
  });

  it("draws an issue with sub-issues and no parent in its own family", async () => {
    const own = [member(10), member(11)];
    const github = fakeGitHub(answer({ ...member(9, { subIssuesSummary: { total: 2, completed: 0 } }), parent: null, subIssues: { nodes: own } }));

    const family = await fetchIssueFamily({ repo: "my-org/repo-a", number: 9, token: "t", fetch: github.fetch });

    expect(family.head).toEqual(asIssue(9, { subIssues: { total: 2, completed: 0 } }));
    expect(family.members.map((m) => m.number)).toEqual([10, 11]);
  });

  it("gives an issue with neither parent nor sub-issues no family", async () => {
    const github = fakeGitHub(answer({ ...member(3), parent: null, subIssues: { nodes: [] } }));

    const family = await fetchIssueFamily({ repo: "my-org/repo-a", number: 3, token: "t", fetch: github.fetch });

    expect(family).toEqual({ issue: { ...asIssue(3), blockedBy: [], blocking: [] }, head: null, members: [], totals: { blockedBy: 0, blocking: 0 } });
  });

  it("tells completed from not planned as the poll does, and keeps another repo's name and a node's own sub-issues", async () => {
    const closed = [
      member(20, { state: "CLOSED", stateReason: "COMPLETED" }),
      member(21, { state: "CLOSED", stateReason: "NOT_PLANNED" }),
      member(22, { state: "CLOSED", stateReason: "DUPLICATE" }),
      member(23, { state: "CLOSED", stateReason: null }),
      member(24, { repository: { nameWithOwner: "my-org/repo-b" }, subIssuesSummary: { total: 5, completed: 3 } }),
    ];
    const github = fakeGitHub(answer({ ...member(19), parent: null, subIssues: { nodes: closed } }));

    const family = await fetchIssueFamily({ repo: "my-org/repo-a", number: 19, token: "t", fetch: github.fetch });

    expect(family.members.map((m) => m.state)).toEqual(["completed", "not_planned", "not_planned", "completed", "open"]);
    expect(family.members[4]).toMatchObject({ repo: "my-org/repo-b", subIssues: { total: 5, completed: 3 } });
  });

  it("keeps GitHub's counts of the issue's blockers both ways, those it could not see too", async () => {
    const github = fakeGitHub(
      answer({
        ...member(3, { blockedBy: { nodes: [ref(4)] } }),
        issueDependenciesSummary: { totalBlockedBy: 3, totalBlocking: 2 },
        parent: null,
        subIssues: { nodes: [] },
      }),
    );

    const family = await fetchIssueFamily({ repo: "my-org/repo-a", number: 3, token: "t", fetch: github.fetch });

    expect(github.calls[0]!.query).toContain("issueDependenciesSummary { totalBlockedBy totalBlocking }");
    expect(family.totals).toEqual({ blockedBy: 3, blocking: 2 });
  });

  it("fails when GitHub returns no such issue", async () => {
    const github = fakeGitHub({ data: { repository: { issue: null } } });

    await expect(fetchIssueFamily({ repo: "my-org/repo-a", number: 404, token: "t", fetch: github.fetch })).rejects.toThrow(/my-org\/repo-a#404/);
  });
});
