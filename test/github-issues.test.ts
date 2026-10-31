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
    body: "",
    createdAt: "2026-10-29T10:00:00Z",
    updatedAt: "2026-10-30T10:00:00Z",
    closedAt: null,
    author: { login: "colleague1" },
    labels: { nodes: [] },
    assignees: { nodes: [] },
    comments: { totalCount: 0 },
    milestone: null,
    closedByPullRequestsReferences: { nodes: [] },
    parent: null,
    subIssuesSummary: { total: 0, completed: 0 },
    issueDependenciesSummary: { blockedBy: 0, blocking: 0, totalBlockedBy: 0, totalBlocking: 0 },
    ...overrides,
  };
}

function repository(nodes: unknown[], totalCount = nodes.length, closed: unknown[] = []) {
  return { data: { repository: { nameWithOwner: "my-org/repo-a", issues: { totalCount, nodes }, closed: { nodes: closed } } } };
}

type CommentNode = { id: string; author: { __typename: string; login: string } | null; createdAt: string; body: string };

function commentNode(id: string, createdAt: string, overrides: Partial<CommentNode> = {}): CommentNode {
  return { id, author: { __typename: "User", login: "colleague2" }, createdAt, body: `comment ${id}`, ...overrides };
}

/**
 * A stand-in for api.github.com that answers the issues query with `nodes`, and the comments query (by its operation name)
 * with `comments` of every issue it asks for by `iN: issue(number: N)`, recording the numbers each comments query asked for.
 */
function fakeGitHubWithComments(nodes: unknown[], comments: Record<number, CommentNode[]> = {}) {
  const commentQueries: number[][] = [];
  const github = fakeGitHub(() => repository(nodes));
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const { query } = JSON.parse(String(init?.body)) as Call;
    if (!query.startsWith("query IssueComments")) return github.fetch(url, init);
    const asked = [...query.matchAll(/(i\d+): issue\(number: (\d+)\)/g)].map(([, alias, number]) => [alias!, Number(number)] as const);
    commentQueries.push(asked.map(([, number]) => number));
    const repository = Object.fromEntries(asked.map(([alias, number]) => [alias, { number, comments: { nodes: comments[number] ?? [] } }]));
    return Response.json({ data: { repository } });
  };
  return { fetch, commentQueries };
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
    const github = fakeGitHubWithComments([
      issueNode(7, {
        labels: { nodes: [{ name: "bug", color: "d73a4a" }, { name: "in-progress", color: "0e8a16" }] },
        assignees: { nodes: [{ login: "me" }, { login: "colleague2" }] },
        comments: { totalCount: 3 },
      }),
    ]);

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

  it("reads the milestone with its due date, and none when the issue has none", async () => {
    const github = fakeGitHub(() =>
      repository([issueNode(1, { milestone: { title: "v2.0", dueOn: "2026-11-30T00:00:00Z" } }), issueNode(2, { milestone: { title: "Someday", dueOn: null } }), issueNode(3)]),
    );

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch });

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

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch });

    expect(snapshot.issues[0]!.linkedPullRequests).toEqual([
      { repo: "my-org/repo-a", number: 10, url: "https://github.com/my-org/repo-a/pull/10", status: "open" },
      { repo: "my-org/repo-a", number: 11, url: "https://github.com/my-org/repo-a/pull/11", status: "draft" },
      { repo: "my-org/repo-a", number: 12, url: "https://github.com/my-org/repo-a/pull/12", status: "merged" },
      { repo: "my-org/repo-a", number: 13, url: "https://github.com/my-org/repo-a/pull/13", status: "closed" },
      { repo: "my-org/repo-b", number: 4, url: "https://github.com/my-org/repo-b/pull/4", status: "open" },
    ]);
  });

  it("reads the parent, the progress of the sub-issues and how many blockers there are, open and in all, both ways", async () => {
    const github = fakeGitHub(() =>
      repository([
        issueNode(1, {
          parent: { number: 79, title: "Dependencies", repository: { nameWithOwner: "my-org/repo-a" } },
          subIssuesSummary: { total: 9, completed: 3 },
          issueDependenciesSummary: { blockedBy: 1, blocking: 2, totalBlockedBy: 3, totalBlocking: 4 },
        }),
        issueNode(2),
      ]),
    );

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch });

    expect(github.calls[0]!.query).toMatch(/parent \{ number title repository \{ nameWithOwner \} \}/);
    expect(github.calls[0]!.query).toMatch(/subIssuesSummary \{ total completed \}/);
    expect(github.calls[0]!.query).toMatch(/issueDependenciesSummary \{ blockedBy blocking totalBlockedBy totalBlocking \}/);
    expect(snapshot.issues[0]).toMatchObject({
      parent: { repo: "my-org/repo-a", number: 79, title: "Dependencies" },
      subIssues: { total: 9, completed: 3 },
      dependencies: { blockedBy: 1, blocking: 2, totalBlockedBy: 3, totalBlocking: 4 },
    });
    expect(snapshot.issues[1]).toMatchObject({
      parent: null,
      subIssues: { total: 0, completed: 0 },
      dependencies: { blockedBy: 0, blocking: 0, totalBlockedBy: 0, totalBlocking: 0 },
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

  it("reads the description, and no closing date for an open issue", async () => {
    const github = fakeGitHub(() => repository([issueNode(1, { body: "Steps to reproduce" })]));

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch });

    expect(snapshot.issues[0]).toMatchObject({ body: "Steps to reproduce", closedAt: null });
  });

  it("fetches the latest comments of an issue with comments, oldest first, without the bots'", async () => {
    const github = fakeGitHubWithComments([issueNode(7, { comments: { totalCount: 3 } })], {
      7: [
        commentNode("c2", "2026-10-30T09:00:00Z"),
        commentNode("c1", "2026-10-29T12:00:00Z", { author: null }),
        commentNode("c3", "2026-10-30T10:00:00Z", { author: { __typename: "Bot", login: "ci-bot" } }),
      ],
    });

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch });

    expect(snapshot.issues[0]!.latestComments).toEqual([
      { id: "c1", author: "ghost", createdAt: "2026-10-29T12:00:00Z", body: "comment c1" },
      { id: "c2", author: "colleague2", createdAt: "2026-10-30T09:00:00Z", body: "comment c2" },
    ]);
  });

  it("fetches comments only for the issues that changed since the last poll, and keeps the others' as they were", async () => {
    const kept = { id: "old", author: "colleague1", createdAt: "2026-10-28T10:00:00Z", body: "kept" };
    const previous = [
      issue({ number: 1, comments: 1, latestComments: [kept] }),
      issue({ number: 2, comments: 1, updatedAt: "2026-10-29T10:00:00Z" }),
    ];
    const github = fakeGitHubWithComments(
      [issueNode(1, { comments: { totalCount: 1 } }), issueNode(2, { comments: { totalCount: 2 } }), issueNode(3, { comments: { totalCount: 1 } })],
      { 2: [commentNode("c2", "2026-10-30T09:00:00Z")], 3: [commentNode("c3", "2026-10-30T09:30:00Z")] },
    );

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch, previous });

    expect(github.commentQueries).toEqual([[2, 3]]);
    expect(snapshot.issues.map((i) => i.latestComments.map((c) => c.id))).toEqual([["old"], ["c2"], ["c3"]]);
  });

  it("asks nothing more when no issue changed or the changed ones have no comments", async () => {
    const github = fakeGitHubWithComments([issueNode(1), issueNode(2, { updatedAt: "2026-10-31T10:00:00Z" })]);

    const snapshot = await fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch: github.fetch, previous: [issue({ number: 1 })] });

    expect(github.commentQueries).toEqual([]);
    expect(snapshot.issues.map((i) => i.latestComments)).toEqual([[], []]);
  });

  it("fails when GitHub returns no comments for a changed issue, so the poll is tried again", async () => {
    const github = fakeGitHub(() => repository([issueNode(1, { comments: { totalCount: 1 } })]));
    const fetch = async (url: string | URL | Request, init?: RequestInit) => {
      const { query } = JSON.parse(String(init?.body)) as Call;
      if (query.startsWith("query IssueComments")) return Response.json({ data: { repository: { i0: null } } });
      return github.fetch(url, init);
    };

    await expect(fetchIssues({ repo: "my-org/repo-a", token: "t", closedSince: SINCE, fetch })).rejects.toThrow(/no comments for my-org\/repo-a#1/);
  });
});
