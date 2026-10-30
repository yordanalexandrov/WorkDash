import { afterEach, describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import { type ClassifyRules, SECTIONS } from "../src/domain/classify.js";
import type { JiraConfig } from "../src/domain/jira.js";
import type { PollHealth } from "../src/domain/poll-error.js";
import { buildServer, dashboardState } from "../src/server.js";
import { createEventHub, type EventHub } from "../src/sse.js";
import { pullRequest } from "./fixtures.js";

const rules: ClassifyRules = { team: ["colleague1"], requiredApprovals: 1 };

const pr = pullRequest({ number: 3, title: "Add dashboard", ci: "FAILURE" });

const DAY = 24 * 3_600_000;

const emptySections = SECTIONS.map((section) => ({ section, pullRequests: [] }));

const healthy: PollHealth = { error: null, problems: [] };

describe("GET /api/prs", () => {
  it("serves the stored snapshot grouped into sections before any poll has run", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pr] }, new Date("2026-10-30T10:00:00Z"));
    const server = buildServer({ store, rules: () => rules, pollIntervalMs: () => 60_000, recentlyClosedWindowMs: () => DAY, pollHealth: () => healthy, configError: () => null });

    const response = await server.inject("/api/prs");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      viewer: "me",
      fetchedAt: "2026-10-30T10:00:00.000Z",
      pollIntervalMs: 60_000,
      error: null,
      problems: [],
      configError: null,
      sections: [
        { section: "waiting_on_me", pullRequests: [{ ...pr, reason: "ci_failed", unreadComments: 0, jira: [] }] },
        ...emptySections.slice(1),
      ],
      recentlyClosed: [],
    });
  });

  it("links each PR to the Jira tickets it names", async () => {
    const store = openStore(":memory:");
    const jiraPr = pullRequest({ headRefName: "feature/ABC-1-login", title: "ABC-1: Add login", body: "See XYZ-9" });
    store.saveSnapshot({ viewer: "me", pullRequests: [jiraPr] }, new Date("2026-10-30T10:00:00Z"));
    const server = buildServer({
      store,
      rules: () => rules,
      jira: () => ({ baseUrl: "https://example.atlassian.net/browse/", projectKeys: ["ABC"] }),
      pollIntervalMs: () => 60_000,
      recentlyClosedWindowMs: () => DAY,
      pollHealth: () => healthy,
      configError: () => null,
    });

    const response = await server.inject("/api/prs");

    const [served] = response.json().sections.flatMap((s: { pullRequests: unknown[] }) => s.pullRequests);
    expect(served.jira).toEqual([{ key: "ABC-1", url: "https://example.atlassian.net/browse/ABC-1" }]);
  });

  it("links PRs with the Jira settings in effect now", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pullRequest({ title: "ABC-1: Add login" })] }, new Date());
    let jira: JiraConfig = { baseUrl: null, projectKeys: [] };
    const server = buildServer({
      store,
      rules: () => rules,
      jira: () => jira,
      pollIntervalMs: () => 60_000,
      recentlyClosedWindowMs: () => DAY,
      pollHealth: () => healthy,
      configError: () => null,
    });
    const servedJira = async () =>
      (await server.inject("/api/prs")).json().sections.flatMap((s: { pullRequests: { jira: unknown }[] }) => s.pullRequests)[0].jira;
    const before = await servedJira();

    jira = { baseUrl: "https://example.atlassian.net/browse/", projectKeys: ["ABC"] };

    expect(before).not.toEqual([{ key: "ABC-1", url: "https://example.atlassian.net/browse/ABC-1" }]);
    expect(await servedJira()).toEqual([{ key: "ABC-1", url: "https://example.atlassian.net/browse/ABC-1" }]);
  });

  it("returns empty sections and the poll error while nothing has been fetched", async () => {
    const error = { kind: "auth", message: "GitHub API responded 401: Bad credentials", resetAt: null } as const;
    const server = buildServer({
      store: openStore(":memory:"),
      rules: () => rules,
      pollIntervalMs: () => 60_000,
      recentlyClosedWindowMs: () => DAY,
      pollHealth: () => ({ error, problems: [] }),
      configError: () => null,
    });

    const response = await server.inject("/api/prs");

    expect(response.json()).toEqual({
      viewer: null,
      fetchedAt: null,
      pollIntervalMs: 60_000,
      error,
      problems: [],
      configError: null,
      sections: emptySections,
      recentlyClosed: [],
    });
  });

  it("serves the rules and poll interval in effect now, and why config.yaml is not in effect", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pullRequest({ author: "colleague2" })] }, new Date());
    let current = { rules, pollIntervalMs: 60_000 };
    const server = buildServer({
      store,
      rules: () => current.rules,
      pollIntervalMs: () => current.pollIntervalMs,
      recentlyClosedWindowMs: () => DAY,
      pollHealth: () => healthy,
      configError: () => "config.yaml: invalid configuration:\n  repos: list at least one repo",
    });

    current = { rules: { team: ["colleague2"], requiredApprovals: 1 }, pollIntervalMs: 30_000 };
    const body = (await server.inject("/api/prs")).json();

    expect(body.pollIntervalMs).toBe(30_000);
    expect(body.configError).toBe("config.yaml: invalid configuration:\n  repos: list at least one repo");
    // colleague2 joined the team, so their PR now shows up.
    expect(body.sections.find((s: { section: string }) => s.section === "free_for_review").pullRequests).toHaveLength(1);
  });
});

describe("POST /api/seen", () => {
  const commented = pullRequest({
    number: 4,
    comments: [{ id: "c1", author: "colleague1", createdAt: "2026-10-30T09:59:00Z", body: "why?" }],
  });

  function serverWith(pullRequests: (typeof pr)[], events?: EventHub) {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests }, new Date("2026-10-30T10:00:00Z"));
    return buildServer({
      store,
      rules: () => rules,
      pollIntervalMs: () => 60_000,
      recentlyClosedWindowMs: () => DAY,
      pollHealth: () => healthy,
      configError: () => null,
      events,
    });
  }

  const sectionOf = async (server: ReturnType<typeof buildServer>, number: number) =>
    ((await server.inject("/api/prs")).json() as { sections: { section: string; pullRequests: { number: number }[] }[] }).sections.find(
      (s) => s.pullRequests.some((p) => p.number === number),
    )?.section;

  it("marks a PR seen as of the snapshot the page showed, so its comments stop waiting on me", async () => {
    const server = serverWith([commented]);
    expect(await sectionOf(server, 4)).toBe("waiting_on_me");

    const response = await server.inject({
      method: "POST",
      url: "/api/seen",
      payload: { repo: "my-org/repo-a", number: 4, at: "2026-10-30T10:00:00.000Z" },
    });

    expect(response.statusCode).toBe(204);
    expect(await sectionOf(server, 4)).toBe("waiting_on_others");
  });

  it("does not mark seen what the page could not have shown yet", async () => {
    const server = serverWith([commented]);

    await server.inject({ method: "POST", url: "/api/seen", payload: { repo: "my-org/repo-a", number: 4, at: "2026-10-30T09:00:00.000Z" } });

    expect(await sectionOf(server, 4)).toBe("waiting_on_me");
  });

  it.each([
    ["no repo", { number: 4 }],
    ["no number", { repo: "my-org/repo-a" }],
    ["a bad time", { repo: "my-org/repo-a", number: 4, at: "yesterday" }],
  ])("rejects a request with %s", async (_, payload) => {
    const response = await serverWith([commented]).inject({ method: "POST", url: "/api/seen", payload });

    expect(response.statusCode).toBe(400);
  });

  it("pushes the new dashboard to every open page", async () => {
    const broadcasts: { type: string; data: unknown }[] = [];
    const events: EventHub = { ...createEventHub(), broadcast: (type, data) => broadcasts.push({ type, data }) };
    const server = serverWith([commented], events);

    await server.inject({ method: "POST", url: "/api/seen", payload: { repo: "my-org/repo-a", number: 4 } });

    expect(broadcasts).toEqual([{ type: "dashboard", data: (await server.inject("/api/prs")).json() }]);
    expect((broadcasts[0]?.data as { sections: { pullRequests: unknown[] }[] }).sections[0]?.pullRequests).toEqual([]);
  });
});

describe("GET /api/prs while polls fail", () => {
  it("keeps serving the last good snapshot", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pr] }, new Date("2026-10-30T10:00:00Z"));
    const error = { kind: "unreachable", message: "fetch failed", resetAt: null } as const;
    const server = buildServer({
      store,
      rules: () => rules,
      pollIntervalMs: () => 60_000,
      recentlyClosedWindowMs: () => DAY,
      pollHealth: () => ({ error, problems: [] }),
      configError: () => null,
    });

    const body = (await server.inject("/api/prs")).json();

    expect(body).toMatchObject({ fetchedAt: "2026-10-30T10:00:00.000Z", error });
    expect(body.sections[0].pullRequests).toHaveLength(1);
  });
});

describe("GET /api/events", () => {
  let close: () => Promise<unknown> = async () => {};
  afterEach(() => close());

  it("streams the dashboard on connect and again on every broadcast", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [] }, new Date("2026-10-30T10:00:00Z"));
    const events = createEventHub();
    const source = { store, rules: () => rules, pollIntervalMs: () => 60_000, recentlyClosedWindowMs: () => DAY, pollHealth: () => healthy, configError: () => null };
    const server = buildServer({ ...source, events });
    close = () => server.close();
    const address = await server.listen({ host: "127.0.0.1", port: 0 });

    const response = await fetch(`${address}/api/events`);
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let text = "";
    const readUntil = async (needle: string, count: number) => {
      while (text.split(needle).length - 1 < count) text += (await reader.read()).value;
    };

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    await readUntil("event: dashboard\n", 1);
    expect(text).toContain(`data: ${JSON.stringify(dashboardState(source))}\n\n`);

    events.broadcast("dashboard", { changed: true });
    await readUntil("event: dashboard\n", 2);
    expect(text).toContain('data: {"changed":true}\n\n');
    await reader.cancel();
  });
});

describe("recently closed PRs", () => {
  it("lists the PRs closed within the window, apart from the open sections", async () => {
    const store = openStore(":memory:");
    const merged = {
      repo: "my-org/repo-a",
      number: 9,
      title: "Ship it",
      url: "https://github.com/my-org/repo-a/pull/9",
      author: "me",
      state: "MERGED" as const,
      closedAt: "2026-10-30T11:00:00Z",
    };
    const old = { ...merged, number: 8, closedAt: "2026-10-29T11:00:00Z" };
    store.saveRecentlyClosed([merged, old]);
    const source = {
      store,
      rules: () => rules,
      pollIntervalMs: () => 60_000,
      recentlyClosedWindowMs: () => DAY,
      pollHealth: () => healthy,
      configError: () => null,
      now: () => new Date("2026-10-30T12:00:00Z"),
    };
    const server = buildServer(source);

    const response = await server.inject("/api/prs");

    expect(response.json().recentlyClosed).toEqual([merged]);
    expect(response.json().sections).toEqual(emptySections);
    // The SSE `dashboard` event carries the same state.
    expect(dashboardState(source).recentlyClosed).toEqual([merged]);
  });
});

describe("GET /", () => {
  it("serves the dashboard page", async () => {
    const server = buildServer({ store: openStore(":memory:"), rules: () => rules, pollIntervalMs: () => 60_000, recentlyClosedWindowMs: () => DAY, pollHealth: () => healthy, configError: () => null });

    const response = await server.inject("/");

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
  });
});
