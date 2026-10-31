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
    milestone: null,
    closedByPullRequestsReferences: { nodes: [] },
    ...overrides,
  };
}

function repository(nodes: unknown[], totalCount = nodes.length) {
  return { data: { repository: { nameWithOwner: "my-org/repo-a", issues: { totalCount, nodes } } } };
}

describe("fetchIssues", () => {
  it("asks for the open issues of the one repo, most recently updated first", async () => {
    const github = fakeGitHub(() => repository([]));

    await fetchIssues({ repo: "my-org/repo-a", token: "t", fetch: github.fetch });

    expect(github.calls).toHaveLength(1);
    expect(github.calls[0]!.query).toMatch(/^query RepositoryIssues/);
    expect(github.calls[0]!.query).toMatch(/issues\(states: OPEN, first: 100, orderBy: \{ field: UPDATED_AT, direction: DESC \}\)/);
    expect(github.calls[0]!.variables).toEqual({ owner: "my-org", name: "repo-a" });
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

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", fetch: github.fetch });

    expect(snapshot).toEqual({
      repo: "my-org/repo-a",
      totalCount: 1,
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

  it("reads the milestone with its due date, and none when the issue has none", async () => {
    const github = fakeGitHub(() =>
      repository([issueNode(1, { milestone: { title: "v2.0", dueOn: "2026-11-30T00:00:00Z" } }), issueNode(2, { milestone: { title: "Someday", dueOn: null } }), issueNode(3)]),
    );

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", fetch: github.fetch });

    expect(snapshot.issues.map((i) => i.milestone)).toEqual([{ title: "v2.0", dueOn: "2026-11-30T00:00:00Z" }, { title: "Someday", dueOn: null }, null]);
  });

  it("reads the linked PRs, each with its repo and whether it is open, a draft, merged or closed", async () => {
    const pr = (number: number, state: string, isDraft = false, repo = "my-org/repo-a") => ({
      number,
      url: `https://github.com/${repo}/pull/${number}`,
      state,
      isDraft,
      repository: { nameWithOwner: repo },
    });
    const github = fakeGitHub(() =>
      repository([issueNode(1, { closedByPullRequestsReferences: { nodes: [pr(10, "OPEN"), pr(11, "OPEN", true), pr(12, "MERGED"), pr(13, "CLOSED"), pr(4, "OPEN", false, "my-org/repo-b")] } })]),
    );

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", fetch: github.fetch });

    expect(snapshot.issues[0]!.linkedPullRequests).toEqual([
      { repo: "my-org/repo-a", number: 10, url: "https://github.com/my-org/repo-a/pull/10", status: "open" },
      { repo: "my-org/repo-a", number: 11, url: "https://github.com/my-org/repo-a/pull/11", status: "draft" },
      { repo: "my-org/repo-a", number: 12, url: "https://github.com/my-org/repo-a/pull/12", status: "merged" },
      { repo: "my-org/repo-a", number: 13, url: "https://github.com/my-org/repo-a/pull/13", status: "closed" },
      { repo: "my-org/repo-b", number: 4, url: "https://github.com/my-org/repo-b/pull/4", status: "open" },
    ]);
  });

  it("says how many are open in all when there are more than one page", async () => {
    const github = fakeGitHub(() => repository([issueNode(1)], 240));

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", fetch: github.fetch });

    expect(snapshot.totalCount).toBe(240);
  });

  it("names a deleted author ghost", async () => {
    const github = fakeGitHub(() => repository([issueNode(1, { author: null })]));

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", fetch: github.fetch });

    expect(snapshot.issues[0]!.author).toBe("ghost");
  });

  it("fails when GitHub returns no repository, so nothing is saved", async () => {
    const github = fakeGitHub(() => ({ data: { repository: null }, errors: [{ type: "NOT_FOUND", message: "Could not resolve to a Repository" }] }));

    await expect(fetchIssues({ repo: "my-org/repo-a", token: "t", fetch: github.fetch })).rejects.toThrow(/Could not resolve/);
  });

  it("fails with the error types of a rate limit, for classifyPollError", async () => {
    const github = fakeGitHub(() => ({ errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] }));

    await expect(fetchIssues({ repo: "my-org/repo-a", token: "t", fetch: github.fetch })).rejects.toMatchObject({ errorTypes: ["RATE_LIMITED"] });
  });
});
