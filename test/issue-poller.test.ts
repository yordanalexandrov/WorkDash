import { describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import { createIssuePoller } from "../src/issue-poller.js";

/**
 * A stand-in for GitHub that answers the issues query of any repo with one issue, and records which repos it was asked for;
 * with `comments`, the issue has one, and the comments queries it answers are recorded apart.
 */
function fakeGitHub(options: { fail?: boolean; rateLimited?: boolean; comments?: boolean } = {}) {
  const calls: string[] = [];
  const commentCalls: string[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body)) as { query: string; variables: { owner: string; name: string } };
    const repo = `${variables.owner}/${variables.name}`;
    if (query.startsWith("query IssueComments")) {
      commentCalls.push(repo);
      const comment = { id: "c1", author: { __typename: "User", login: "colleague2" }, createdAt: "2026-10-30T09:00:00Z", body: "On it" };
      return Response.json({ data: { repository: { i0: { number: 1, comments: { nodes: [comment] } } } } });
    }
    calls.push(repo);
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (options.rateLimited) {
      const reset = String(Math.floor(Date.now() / 1000) + 600);
      return Response.json({ message: "API rate limit exceeded" }, { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset } });
    }
    if (options.fail) return Response.json({ message: "Server Error" }, { status: 502 });
    const node = {
      number: 1,
      title: "Issue 1",
      url: `https://github.com/${repo}/issues/1`,
      body: "",
      createdAt: "2026-10-29T10:00:00Z",
      updatedAt: "2026-10-30T10:00:00Z",
      closedAt: null,
      author: { login: "colleague1" },
      labels: { nodes: [] },
      assignees: { nodes: [] },
      comments: { totalCount: options.comments ? 1 : 0 },
      milestone: null,
      closedByPullRequestsReferences: { nodes: [] },
    };
    return Response.json({ data: { repository: { nameWithOwner: repo, issues: { totalCount: 1, nodes: [node] } } } });
  };
  return { fetch, calls, commentCalls };
}

const quietLog = { info() {}, error() {} };

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function setUp(options: { fail?: boolean; rateLimited?: boolean; comments?: boolean; token?: string | null } = {}) {
  const github = fakeGitHub(options);
  const store = openStore(":memory:");
  const changes: { repo: string; polling: boolean }[] = [];
  const poller = createIssuePoller({
    store,
    token: () => (options.token === undefined ? "t" : options.token),
    log: quietLog,
    fetch: github.fetch,
    onChange: (repo) => changes.push({ repo, polling: poller.polling(repo) }),
  });
  return { github, store, poller, changes };
}

describe("createIssuePoller", () => {
  it("polls a repo when it is opened, saves its issues and tells when the poll starts and ends", async () => {
    const { github, store, poller, changes } = setUp();

    expect(poller.demand("my-org/repo-a", "open")).toBe("poll");

    await waitFor(() => changes.length === 2);
    expect(github.calls).toEqual(["my-org/repo-a"]);
    expect(changes).toEqual([
      { repo: "my-org/repo-a", polling: true },
      { repo: "my-org/repo-a", polling: false },
    ]);
    expect(store.loadIssues("my-org/repo-a")?.issues.map((issue) => issue.number)).toEqual([1]);
  });

  it("makes one request for a repo that two pages open at once", async () => {
    const { github, poller, changes } = setUp();

    expect(poller.demand("my-org/repo-a", "open")).toBe("poll");
    expect(poller.demand("my-org/repo-a", "open")).toBe("join");

    await waitFor(() => changes.length === 2);
    expect(github.calls).toEqual(["my-org/repo-a"]);
  });

  it("polls two repos on their own", async () => {
    const { github, poller, changes } = setUp();

    poller.demand("my-org/repo-a", "open");
    poller.demand("my-org/repo-b", "open");

    await waitFor(() => changes.length === 4);
    expect(github.calls.sort()).toEqual(["my-org/repo-a", "my-org/repo-b"]);
  });

  it("shows what is saved for a repo opened again within a minute, and polls it on the button", async () => {
    const { github, poller, changes } = setUp();
    poller.demand("my-org/repo-a", "open");
    await waitFor(() => changes.length === 2);

    expect(poller.demand("my-org/repo-a", "open")).toBe("skip");
    expect(poller.demand("my-org/repo-a", "button")).toBe("poll");

    await waitFor(() => changes.length === 4);
    expect(github.calls).toEqual(["my-org/repo-a", "my-org/repo-a"]);
  });

  it("fetches the comments of an issue once, and keeps them while it is unchanged", async () => {
    const { github, store, poller, changes } = setUp({ comments: true });
    poller.demand("my-org/repo-a", "open");
    await waitFor(() => changes.length === 2);

    poller.demand("my-org/repo-a", "button");
    await waitFor(() => changes.length === 4);

    expect(github.calls).toEqual(["my-org/repo-a", "my-org/repo-a"]);
    expect(github.commentCalls).toEqual(["my-org/repo-a"]);
    expect(store.loadIssues("my-org/repo-a")?.issues[0]?.latestComments.map((comment) => comment.body)).toEqual(["On it"]);
  });

  it("does not poll a repo saved less than a minute ago, after a restart", async () => {
    const { github, store } = setUp();
    store.saveIssues({ repo: "my-org/repo-a", issues: [], totalCount: 0 }, new Date());
    const poller = createIssuePoller({ store, token: () => "t", log: quietLog, fetch: github.fetch, onChange: () => {} });

    expect(poller.demand("my-org/repo-a", "open")).toBe("skip");
  });

  it("keeps the saved issues and says why when a poll fails, for that repo only", async () => {
    const { store, poller, changes } = setUp({ fail: true });
    store.saveIssues({ repo: "my-org/repo-a", issues: [], totalCount: 7 }, new Date("2026-10-30T10:00:00Z"));

    poller.demand("my-org/repo-a", "button");

    await waitFor(() => changes.length === 2);
    expect(poller.error("my-org/repo-a")).toMatchObject({ kind: "unreachable" });
    expect(poller.error("my-org/repo-b")).toBeNull();
    expect(store.loadIssues("my-org/repo-a")?.totalCount).toBe(7);
  });

  it("holds every repo back, the button included, while GitHub's rate limit lasts", async () => {
    const { github, poller, changes } = setUp({ rateLimited: true });
    poller.demand("my-org/repo-a", "open");
    await waitFor(() => changes.length === 2);

    expect(poller.error("my-org/repo-a")).toMatchObject({ kind: "rate_limit" });
    expect(poller.demand("my-org/repo-b", "button")).toBe("skip");
    expect(github.calls).toEqual(["my-org/repo-a"]);
  });

  it("does not poll without a token", () => {
    const { github, poller } = setUp({ token: null });

    expect(poller.demand("my-org/repo-a", "open")).toBe("skip");
    expect(github.calls).toEqual([]);
  });
});
