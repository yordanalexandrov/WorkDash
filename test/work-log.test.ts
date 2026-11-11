import { describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import { servedItems, type WorkSource, workItem } from "../src/domain/work-log.js";
import { buildServer } from "../src/server.js";
import { createWorkLogs } from "../src/work-log.js";

const SINCE = new Date("2026-10-28T00:00:00Z");

/** A PR as the search reads it, opened by `author` on 10-30, with nothing done on it unless told otherwise. */
function source(overrides: Partial<WorkSource> = {}): WorkSource {
  return {
    repo: "my-org/repo-a",
    number: 7,
    title: "Retry failed uploads",
    url: "https://github.com/my-org/repo-a/pull/7",
    author: "me",
    headRefName: "ABC-123-retry",
    body: "",
    createdAt: "2026-10-30T09:00:00Z",
    mergedAt: null,
    closedAt: null,
    commits: [],
    reviews: [],
    comments: [],
    ...overrides,
  };
}

describe("workItem", () => {
  it("on my PR: its opening, my commits by their author date, my comments and its merge, oldest first", () => {
    const item = workItem(
      source({
        mergedAt: "2026-11-02T15:00:00Z",
        commits: [
          { author: "me", authoredAt: "2026-10-30T10:00:00Z" },
          { author: "colleague1", authoredAt: "2026-10-31T10:00:00Z" },
          { author: "Me", authoredAt: "2026-10-29T18:00:00Z" },
        ],
        comments: [
          { author: "me", createdAt: "2026-11-01T08:00:00Z" },
          { author: "colleague1", createdAt: "2026-11-01T09:00:00Z" },
        ],
      }),
      "me",
      SINCE,
    );

    expect(item?.role).toBe("author");
    expect(item?.events).toEqual([
      { kind: "commit", at: "2026-10-29T18:00:00Z" },
      { kind: "opened", at: "2026-10-30T09:00:00Z" },
      { kind: "commit", at: "2026-10-30T10:00:00Z" },
      { kind: "comment", at: "2026-11-01T08:00:00Z" },
      { kind: "merged", at: "2026-11-02T15:00:00Z" },
    ]);
  });

  it("counts my reply in a review of my own PR as comments, not as a review", () => {
    const item = workItem(source({ reviews: [{ author: "me", state: "COMMENTED", submittedAt: "2026-10-31T10:00:00Z", comments: 2 }] }), "me", SINCE);

    expect(item?.events.filter((event) => event.kind !== "opened")).toEqual([
      { kind: "comment", at: "2026-10-31T10:00:00Z" },
      { kind: "comment", at: "2026-10-31T10:00:00Z" },
    ]);
  });

  it("on someone else's PR: my reviews by verdict and their inline comments, and my general comments", () => {
    const item = workItem(
      source({
        author: "colleague1",
        reviews: [
          { author: "me", state: "CHANGES_REQUESTED", submittedAt: "2026-10-31T10:00:00Z", comments: 1 },
          { author: "me", state: "DISMISSED", submittedAt: "2026-10-31T11:00:00Z", comments: 0 },
          { author: "me", state: "APPROVED", submittedAt: "2026-11-01T10:00:00Z", comments: 0 },
          { author: "colleague2", state: "APPROVED", submittedAt: "2026-11-01T11:00:00Z", comments: 0 },
        ],
        comments: [{ author: "me", createdAt: "2026-10-31T12:00:00Z" }],
      }),
      "me",
      SINCE,
    );

    expect(item?.role).toBe("review");
    expect(item?.events).toEqual([
      { kind: "review", at: "2026-10-31T10:00:00Z", verdict: "changes" },
      { kind: "comment", at: "2026-10-31T10:00:00Z" },
      { kind: "review", at: "2026-10-31T11:00:00Z", verdict: "commented" },
      { kind: "comment", at: "2026-10-31T12:00:00Z" },
      { kind: "review", at: "2026-11-01T10:00:00Z", verdict: "approved" },
    ]);
  });

  it("tells a PR closed without a merge, and leaves out what was before the search began", () => {
    const item = workItem(source({ createdAt: "2026-10-20T09:00:00Z", closedAt: "2026-10-29T09:00:00Z" }), "me", SINCE);

    expect(item?.events).toEqual([{ kind: "closed", at: "2026-10-29T09:00:00Z" }]);
  });

  it("is null for a PR I did nothing on since the search began", () => {
    expect(workItem(source({ author: "colleague1", comments: [{ author: "colleague2", createdAt: "2026-10-30T10:00:00Z" }] }), "me", SINCE)).toBeNull();
    expect(workItem(source({ createdAt: "2026-10-01T09:00:00Z" }), "me", SINCE)).toBeNull();
  });
});

describe("servedItems", () => {
  it("links the Jira tickets the branch, title or description name, and drops those texts", () => {
    const item = workItem(source({ body: "Also ABC-124." }), "me", SINCE)!;

    expect(servedItems([item], { baseUrl: "https://example.atlassian.net/browse/", projectKeys: [] })).toEqual([
      {
        repo: "my-org/repo-a",
        number: 7,
        title: "Retry failed uploads",
        url: "https://github.com/my-org/repo-a/pull/7",
        role: "author",
        events: item.events,
        jira: [
          { key: "ABC-123", url: "https://example.atlassian.net/browse/ABC-123" },
          { key: "ABC-124", url: "https://example.atlassian.net/browse/ABC-124" },
        ],
      },
    ]);
  });
});

/** A stand-in for GitHub that answers the viewer query, then every search with one PR of `repo`; it counts the searches. */
function fakeGitHub(options: { repo?: string; fail?: () => boolean } = {}) {
  const searches: string[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query: string; variables: { q?: string } };
    if (options.fail?.()) return Response.json({ message: "Bad credentials" }, { status: 401 });
    if (body.query.includes("viewer")) return Response.json({ data: { viewer: { login: "me" } } });
    searches.push(body.variables.q!);
    const node = {
      number: 7,
      title: "Retry failed uploads",
      url: "https://github.com/my-org/repo-a/pull/7",
      headRefName: "ABC-123-retry",
      body: "",
      createdAt: "2026-11-01T09:00:00Z",
      mergedAt: null,
      closedAt: null,
      state: "OPEN",
      repository: { nameWithOwner: options.repo ?? "my-org/repo-a" },
      author: { login: "me" },
      commits: { nodes: [] },
      reviews: { nodes: [] },
      comments: { nodes: [] },
    };
    return Response.json({ data: { search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [node] } } });
  };
  return { fetch, searches };
}

describe("the work log API", () => {
  function serverWith(github: ReturnType<typeof fakeGitHub>, repos = ["my-org/repo-a"]) {
    let now = new Date("2026-11-02T10:00:00Z");
    const workLog = createWorkLogs({
      store: openStore(":memory:"),
      repos: () => repos,
      token: () => "t",
      jira: () => ({ baseUrl: null, projectKeys: [] }),
      fetch: github.fetch,
      now: () => now,
    });
    const server = buildServer({
      store: openStore(":memory:"),
      rules: () => ({ team: [], requiredApprovals: 1 }),
      pollIntervalMs: () => 60_000,
      recentlyClosedWindowMs: () => 0,
      pollHealth: () => ({ error: null, problems: [] }),
      configError: () => null,
      workLog,
    });
    return { server, later: (ms: number) => (now = new Date(now.getTime() + ms)) };
  }

  it("has nothing saved before the first search", async () => {
    const { server } = serverWith(fakeGitHub());

    expect((await server.inject("/api/work-log")).json()).toEqual({ viewer: null, fetchedAt: null, pullRequests: [], fetching: false, error: null });
  });

  it("searches my PRs, reviews and comments since 15 days back, and saves what it found", async () => {
    const github = fakeGitHub();
    const { server } = serverWith(github);

    const answer = (await server.inject({ method: "POST", url: "/api/work-log/refresh", payload: {} })).json();

    expect(github.searches).toEqual([
      "is:pr author:me updated:>=2026-10-18",
      "is:pr reviewed-by:me updated:>=2026-10-18",
      "is:pr commenter:me updated:>=2026-10-18",
    ]);
    expect(answer).toMatchObject({ viewer: "me", fetchedAt: "2026-11-02T10:00:00.000Z", fetching: false, error: null });
    expect(answer.pullRequests).toEqual([expect.objectContaining({ repo: "my-org/repo-a", number: 7, role: "author", events: [{ kind: "opened", at: "2026-11-01T09:00:00Z" }] })]);
    expect((await server.inject("/api/work-log")).json().pullRequests).toHaveLength(1);
  });

  it("searches again only after a minute", async () => {
    const github = fakeGitHub();
    const { server, later } = serverWith(github);

    await server.inject({ method: "POST", url: "/api/work-log/refresh", payload: {} });
    later(59_000);
    await server.inject({ method: "POST", url: "/api/work-log/refresh", payload: {} });
    later(2_000);
    await server.inject({ method: "POST", url: "/api/work-log/refresh", payload: {} });

    expect(github.searches).toHaveLength(6);
  });

  it("keeps only the followed repos", async () => {
    const { server } = serverWith(fakeGitHub({ repo: "other-org/repo-z" }));

    const answer = (await server.inject({ method: "POST", url: "/api/work-log/refresh", payload: {} })).json();

    expect(answer.pullRequests).toEqual([]);
  });

  it("tells why a search failed, keeps what was saved, and asks again at once next time", async () => {
    let failing = false;
    const github = fakeGitHub({ fail: () => failing });
    const { server, later } = serverWith(github);
    await server.inject({ method: "POST", url: "/api/work-log/refresh", payload: {} });
    later(61_000);

    failing = true;
    const failed = (await server.inject({ method: "POST", url: "/api/work-log/refresh", payload: {} })).json();
    failing = false;
    const again = (await server.inject({ method: "POST", url: "/api/work-log/refresh", payload: {} })).json();

    expect(failed).toMatchObject({ error: { kind: "auth" }, pullRequests: [expect.objectContaining({ number: 7 })] });
    expect(again.error).toBeNull();
  });
});
