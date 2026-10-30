import { afterEach, describe, expect, it, vi } from "vitest";
import { openStore } from "../src/db.js";
import { type Poller, startPoller } from "../src/poller.js";
import { pullRequest } from "./fixtures.js";

type Call = { repos: string[]; token: string };

/** A stand-in for GitHub that records which repos each poll asked for, with which token. */
function fakeGitHub() {
  const calls: Call[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const { variables } = JSON.parse(String(init?.body)) as { variables: Record<string, string> };
    const repos = Object.keys(variables)
      .filter((key) => key.startsWith("owner"))
      .map((key) => `${variables[key]}/${variables[key.replace("owner", "name")]}`);
    const token = (init?.headers as Record<string, string>).Authorization!.replace("Bearer ", "");
    calls.push({ repos, token });
    await new Promise((resolve) => setTimeout(resolve, 10));
    inFlight--;
    return Response.json({ data: { viewer: { login: "me" } } });
  };
  return { fetch, calls, maxInFlight: () => maxInFlight };
}

const quietLog = { info() {}, error() {} };

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("startPoller", () => {
  let poller: Poller | undefined;
  afterEach(() => poller?.stop());

  it("polls again right away with the new repos and token after a reconfigure", async () => {
    const github = fakeGitHub();
    poller = startPoller({
      repos: ["my-org/repo-a"],
      token: "t1",
      intervalMs: 3_600_000,
      recentlyClosedWindowMs: 3_600_000,
      store: openStore(":memory:"),
      log: quietLog,
      fetch: github.fetch,
    });
    await waitFor(() => github.calls.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 20));

    poller.reconfigure({ repos: ["my-org/repo-a", "my-org/repo-b"], token: "t2", intervalMs: 3_600_000, recentlyClosedWindowMs: 3_600_000 });

    await waitFor(() => github.calls.length === 2);
    expect(github.calls).toEqual([
      { repos: ["my-org/repo-a"], token: "t1" },
      { repos: ["my-org/repo-a", "my-org/repo-b"], token: "t2" },
    ]);
  });

  it("finishes a poll already under way before polling with the new config", async () => {
    const github = fakeGitHub();
    poller = startPoller({
      repos: ["my-org/repo-a"],
      token: "t1",
      intervalMs: 3_600_000,
      recentlyClosedWindowMs: 3_600_000,
      store: openStore(":memory:"),
      log: quietLog,
      fetch: github.fetch,
    });

    poller.reconfigure({ repos: ["my-org/repo-b"], token: "t1", intervalMs: 3_600_000, recentlyClosedWindowMs: 3_600_000 });

    await waitFor(() => github.calls.length === 2);
    expect(github.calls.map((call) => call.repos)).toEqual([["my-org/repo-a"], ["my-org/repo-b"]]);
    expect(github.maxInFlight()).toBe(1);
  });
});

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
function fakeGitHubWithClosed(open: number[], mergedAt: string) {
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

describe("startPoller recently closed", () => {
  it("looks up a PR that left the open list and keeps it apart as recently closed", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pullRequest({ number: 1 }), pullRequest({ number: 2 })] }, new Date("2026-10-30T10:00:00Z"));
    const github = fakeGitHubWithClosed([2], new Date().toISOString());

    const poller = startPoller({ repos: ["my-org/repo-a"], token: "t", intervalMs: 3_600_000, recentlyClosedWindowMs: 3_600_000, store, log: quietLog, fetch: github.fetch });
    await vi.waitFor(() => expect(store.loadRecentlyClosed()).toHaveLength(1));
    poller.stop();

    expect(store.loadSnapshot()?.pullRequests.map((pr) => pr.number)).toEqual([2]);
    expect(store.loadRecentlyClosed()[0]).toMatchObject({ repo: "my-org/repo-a", number: 1, state: "MERGED" });
    expect(github.queries.filter((query) => query.startsWith("query ClosedPullRequests"))).toHaveLength(1);
  });

  it("does not keep a PR that closed before the window", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pullRequest({ number: 1 })] }, new Date("2026-10-30T10:00:00Z"));
    const github = fakeGitHubWithClosed([], "2020-01-01T00:00:00Z");

    const poller = startPoller({ repos: ["my-org/repo-a"], token: "t", intervalMs: 3_600_000, recentlyClosedWindowMs: 3_600_000, store, log: quietLog, fetch: github.fetch });
    await vi.waitFor(() => expect(github.queries).toHaveLength(2));
    await vi.waitFor(() => expect(store.loadSnapshot()?.pullRequests).toEqual([]));
    poller.stop();

    expect(store.loadRecentlyClosed()).toEqual([]);
  });

  it("fails the whole poll, keeping the last snapshot, when the lookup is rate limited", async () => {
    const store = openStore(":memory:");
    const before = [pullRequest({ number: 1 })];
    store.saveSnapshot({ viewer: "me", pullRequests: before }, new Date("2026-10-30T10:00:00Z"));
    const github = fakeGitHubWithClosed([], new Date().toISOString());
    const fetch = async (url: string | URL | Request, init?: RequestInit) =>
      String(init?.body).includes("ClosedPullRequests")
        ? Response.json({ data: null, errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] })
        : github.fetch(url, init);

    let poller!: Poller;
    const health = await new Promise<ReturnType<Poller["health"]>>((resolve) => {
      poller = startPoller({
        repos: ["my-org/repo-a"],
        token: "t",
        intervalMs: 3_600_000,
        recentlyClosedWindowMs: 3_600_000,
        store,
        log: quietLog,
        fetch,
        onPoll: () => resolve(poller.health()),
      });
    });
    poller.stop();

    expect(health.error?.kind).toBe("rate_limit");
    // Nothing saved, so the next poll sees PR 1 vanish again and retries the lookup.
    expect(store.loadSnapshot()?.pullRequests).toEqual(before);
    expect(store.loadRecentlyClosed()).toEqual([]);
  });
});

function ok() {
  return Response.json({
    data: { viewer: { login: "me" }, r0: { nameWithOwner: "my-org/repo-a", pullRequests: { nodes: [], pageInfo: { hasNextPage: false } } } },
  });
}

/** Starts a poller whose GitHub answers with `responses` in turn, and resolves after `polls` polls. */
async function run(responses: (() => Response | Promise<Response>)[], polls: number) {
  const store = openStore(":memory:");
  const healths: ReturnType<Poller["health"]>[] = [];
  let poller!: Poller;
  let calls = 0;
  await new Promise<void>((resolve) => {
    poller = startPoller({
      repos: ["my-org/repo-a"],
      token: "t",
      intervalMs: 1,
      recentlyClosedWindowMs: 3_600_000,
      store,
      log: quietLog,
      fetch: async () => responses[Math.min(calls++, responses.length - 1)]!(),
      onPoll: () => {
        healths.push(poller.health());
        if (healths.length === polls) resolve();
      },
    });
  });
  poller.stop();
  return { store, healths };
}

describe("startPoller health", () => {
  it("saves each snapshot and reports a healthy poll", async () => {
    const { store, healths } = await run([ok], 1);

    expect(store.loadSnapshot()?.viewer).toBe("me");
    expect(healths).toEqual([{ error: null, problems: [] }]);
  });

  it("keeps the last good snapshot and goes on trying when GitHub refuses the token", async () => {
    const { store, healths } = await run([ok, () => Response.json({ message: "Bad credentials" }, { status: 401 }), ok], 3);

    expect(store.loadSnapshot()?.viewer).toBe("me");
    expect(healths.map((health) => health.error?.kind ?? null)).toEqual([null, "auth", null]);
  });

  it("tells a GitHub it cannot reach apart from other failures", async () => {
    const { healths } = await run([() => Promise.reject(new TypeError("fetch failed"))], 1);

    expect(healths[0]?.error).toMatchObject({ kind: "unreachable", message: "fetch failed" });
  });
});
