import { describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import { createIssuePoller } from "../src/issue-poller.js";

/** A stand-in for GitHub that answers the issues query of any repo with one issue, and records which repos it was asked for. */
function fakeGitHub(options: { fail?: boolean; rateLimited?: boolean } = {}) {
  const calls: string[] = [];
  /** Since when each request asked for the closed issues. */
  const sinces: string[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const { variables } = JSON.parse(String(init?.body)) as { variables: { owner: string; name: string; since: string } };
    const repo = `${variables.owner}/${variables.name}`;
    calls.push(repo);
    sinces.push(variables.since);
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
      createdAt: "2026-10-29T10:00:00Z",
      updatedAt: "2026-10-30T10:00:00Z",
      author: { login: "colleague1" },
      labels: { nodes: [] },
      assignees: { nodes: [] },
      comments: { totalCount: 0 },
    };
    return Response.json({ data: { repository: { nameWithOwner: repo, issues: { totalCount: 1, nodes: [node] }, closed: { nodes: [] } } } });
  };
  return { fetch, calls, sinces };
}

const quietLog = { info() {}, error() {} };

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function setUp(options: { fail?: boolean; rateLimited?: boolean; token?: string | null } = {}) {
  const github = fakeGitHub(options);
  const store = openStore(":memory:");
  const changes: { repo: string; polling: boolean }[] = [];
  const poller = createIssuePoller({
    store,
    token: () => (options.token === undefined ? "t" : options.token),
    log: quietLog,
    recentlyClosedWindowMs: () => 2 * 3_600_000,
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

  it("asks for the issues closed within recently_closed_window", async () => {
    const { github, poller, changes } = setUp();
    const before = Date.now();

    poller.demand("my-org/repo-a", "open");

    await waitFor(() => changes.length === 2);
    const since = Date.parse(github.sinces[0]!);
    expect(since).toBeGreaterThanOrEqual(before - 2 * 3_600_000);
    expect(since).toBeLessThanOrEqual(Date.now() - 2 * 3_600_000);
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

  it("does not poll a repo saved less than a minute ago, after a restart", async () => {
    const { github, store } = setUp();
    store.saveIssues({ repo: "my-org/repo-a", issues: [], totalCount: 0, closed: [] }, new Date());
    const poller = createIssuePoller({ store, token: () => "t", log: quietLog, recentlyClosedWindowMs: () => 3_600_000, fetch: github.fetch, onChange: () => {} });

    expect(poller.demand("my-org/repo-a", "open")).toBe("skip");
  });

  it("keeps the saved issues and says why when a poll fails, for that repo only", async () => {
    const { store, poller, changes } = setUp({ fail: true });
    store.saveIssues({ repo: "my-org/repo-a", issues: [], totalCount: 7, closed: [] }, new Date("2026-10-30T10:00:00Z"));

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
