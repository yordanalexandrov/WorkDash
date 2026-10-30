import { describe, expect, it, vi } from "vitest";
import { openStore } from "../src/db.js";
import { startPoller } from "../src/poller.js";
import { pullRequest } from "./fixtures.js";

const log = { info() {}, error() {} };

function openNode(number: number) {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/my-org/repo-a/pull/${number}`,
    isDraft: false,
    createdAt: "2026-10-29T10:00:00Z",
    updatedAt: "2026-10-30T10:00:00Z",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    author: { login: "me" },
    reviewRequests: { nodes: [] },
    latestReviews: { nodes: [] },
    commits: { nodes: [] },
  };
}

/** GitHub with repo-a's open PRs, answering a lookup by number with PR 1 merged at `mergedAt`. */
function fakeGitHub(open: number[], mergedAt: string) {
  const queries: string[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const { query } = JSON.parse(String(init?.body)) as { query: string };
    queries.push(query);
    if (query.startsWith("query ClosedPullRequests")) {
      return Response.json({
        data: {
          r0: {
            p0: { number: 1, title: "PR 1", url: "https://github.com/my-org/repo-a/pull/1", author: { login: "me" }, state: "MERGED", closedAt: mergedAt },
          },
        },
      });
    }
    return Response.json({
      data: {
        viewer: { login: "me" },
        r0: { nameWithOwner: "my-org/repo-a", pullRequests: { nodes: open.map(openNode), pageInfo: { hasNextPage: false } } },
      },
    });
  };
  return { fetch, queries };
}

describe("startPoller", () => {
  it("looks up a PR that left the open list and keeps it apart as recently closed", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pullRequest({ number: 1 }), pullRequest({ number: 2 })] }, new Date("2026-10-30T10:00:00Z"));
    const github = fakeGitHub([2], new Date().toISOString());

    const poller = startPoller({ repos: ["my-org/repo-a"], token: "t", intervalMs: 3_600_000, recentlyClosedWindowMs: 3_600_000, store, log, fetch: github.fetch });
    await vi.waitFor(() => expect(store.loadRecentlyClosed()).toHaveLength(1));
    poller.stop();

    expect(store.loadSnapshot()?.pullRequests.map((pr) => pr.number)).toEqual([2]);
    expect(store.loadRecentlyClosed()[0]).toMatchObject({ repo: "my-org/repo-a", number: 1, state: "MERGED" });
    expect(github.queries.filter((query) => query.startsWith("query ClosedPullRequests"))).toHaveLength(1);
  });

  it("does not keep a PR that closed before the window", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pullRequest({ number: 1 })] }, new Date("2026-10-30T10:00:00Z"));
    const github = fakeGitHub([], "2020-01-01T00:00:00Z");

    const poller = startPoller({ repos: ["my-org/repo-a"], token: "t", intervalMs: 3_600_000, recentlyClosedWindowMs: 3_600_000, store, log, fetch: github.fetch });
    await vi.waitFor(() => expect(github.queries).toHaveLength(2));
    await vi.waitFor(() => expect(store.loadSnapshot()?.pullRequests).toEqual([]));
    poller.stop();

    expect(store.loadRecentlyClosed()).toEqual([]);
  });
});
