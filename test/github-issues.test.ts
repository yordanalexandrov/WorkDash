import { describe, expect, it } from "vitest";
import { fetchIssues } from "../src/github/issues.js";
import { issue } from "./fixtures.js";

type Call = { query: string; variables: Record<string, string> };

/** A stand-in for api.github.com that answers the issues query of one repo with `nodes` and `totalCount`. */
function fakeGitHub(answer: (variables: Record<string, string>) => unknown) {
  const calls: Call[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body)) as Call;
    calls.push({ query, variables });
    return Response.json(answer(variables));
  };
  return { fetch, calls };
}

function issueNode(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://github.com/my-org/repo-a/issues/${number}`,
    createdAt: "2026-10-29T10:00:00Z",
    updatedAt: "2026-10-30T10:00:00Z",
    author: { login: "colleague1" },
    labels: { nodes: [] },
    assignees: { nodes: [] },
    comments: { totalCount: 0 },
    ...overrides,
  };
}

function repository(nodes: unknown[], totalCount = nodes.length, closed: unknown[] = []) {
  return { data: { repository: { nameWithOwner: "my-org/repo-a", issues: { totalCount, nodes }, closed: { nodes: closed } } } };
}

const closedNode = (number: number, closedAt: string, stateReason: string | null) => issueNode(number, { closedAt, stateReason });

/** Since when closed issues count as recently closed in these tests. */
const SINCE = new Date("2026-10-30T12:00:00Z");

describe("fetchIssues", () => {
  it("asks for the open issues of the one repo, most recently updated first", async () => {
    const github = fakeGitHub(() => repository([]));

    await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch });

    expect(github.calls).toHaveLength(1);
    expect(github.calls[0]!.query).toMatch(/^query RepositoryIssues/);
    expect(github.calls[0]!.query).toMatch(/issues\(states: OPEN, first: 100, orderBy: \{ field: UPDATED_AT, direction: DESC \}\)/);
    expect(github.calls[0]!.variables).toEqual({ owner: "my-org", name: "repo-a", since: "2026-10-30T12:00:00.000Z" });
  });

  it("asks for the closed issues updated since the window began, so it gets those closed in it", async () => {
    const github = fakeGitHub(() => repository([]));

    await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch });

    expect(github.calls[0]!.query).toMatch(/closed: issues\(states: CLOSED, first: 100, orderBy: \{ field: UPDATED_AT, direction: DESC \}, filterBy: \{ since: \$since \}\)/);
  });

  it("keeps the closed issues closed in the window, newest first, with how they were closed", async () => {
    const github = fakeGitHub(() =>
      repository([], 0, [
        closedNode(4, "2026-10-30T13:00:00Z", "NOT_PLANNED"),
        // Updated in the window, but closed before it: a comment on an old issue.
        closedNode(5, "2026-10-20T09:00:00Z", "COMPLETED"),
        closedNode(6, "2026-10-31T08:00:00Z", "COMPLETED"),
      ]),
    );

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch });

    expect(snapshot.closed).toEqual([
      { ...issue({ number: 6 }), closedAt: "2026-10-31T08:00:00Z", closedAs: "completed" },
      { ...issue({ number: 4 }), closedAt: "2026-10-30T13:00:00Z", closedAs: "not_planned" },
    ]);
  });

  it("counts a duplicate as not planned, and a close without a reason as completed, as GitHub shows it", async () => {
    const github = fakeGitHub(() =>
      repository([], 0, [closedNode(1, "2026-10-31T08:00:00Z", "DUPLICATE"), closedNode(2, "2026-10-31T07:00:00Z", null)]),
    );

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch });

    expect(snapshot.closed.map((closed) => closed.closedAs)).toEqual(["not_planned", "completed"]);
  });

  it("reads each issue with its labels and their colours, assignees, author and comment count", async () => {
    const github = fakeGitHub(() =>
      repository([
        issueNode(7, {
          labels: { nodes: [{ name: "bug", color: "d73a4a" }, { name: "in-progress", color: "0e8a16" }] },
          assignees: { nodes: [{ login: "me" }, { login: "colleague2" }] },
          comments: { totalCount: 3 },
        }),
      ]),
    );

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch });

    expect(snapshot).toEqual({
      repo: "my-org/repo-a",
      totalCount: 1,
      closed: [],
      issues: [
        issue({
          number: 7,
          labels: [
            { name: "bug", color: "d73a4a" },
            { name: "in-progress", color: "0e8a16" },
          ],
          assignees: ["me", "colleague2"],
          comments: 3,
        }),
      ],
    });
  });

  it("says how many are open in all when there are more than one page", async () => {
    const github = fakeGitHub(() => repository([issueNode(1)], 240));

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch });

    expect(snapshot.totalCount).toBe(240);
  });

  it("names a deleted author ghost", async () => {
    const github = fakeGitHub(() => repository([issueNode(1, { author: null })]));

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch });

    expect(snapshot.issues[0]!.author).toBe("ghost");
  });

  it("fails when GitHub returns no repository, so nothing is saved", async () => {
    const github = fakeGitHub(() => ({ data: { repository: null }, errors: [{ type: "NOT_FOUND", message: "Could not resolve to a Repository" }] }));

    await expect(fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch })).rejects.toThrow(/Could not resolve/);
  });

  it("fails with the error types of a rate limit, for classifyPollError", async () => {
    const github = fakeGitHub(() => ({ errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] }));

    await expect(fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch })).rejects.toMatchObject({ errorTypes: ["RATE_LIMITED"] });
  });
});
