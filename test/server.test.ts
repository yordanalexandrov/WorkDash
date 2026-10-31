import { afterEach, describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import { type ClassifyRules, SECTIONS } from "../src/domain/classify.js";
import type { JiraConfig } from "../src/domain/jira.js";
import type { PollHealth } from "../src/domain/poll-error.js";
import type { Demand, DemandAnswer, PollMode } from "../src/domain/poll-mode.js";
import { buildServer, dashboardState } from "../src/server.js";
import type { Settings } from "../src/settings.js";
import { settingsForm } from "../src/config.js";
import { createEventHub, type EventHub } from "../src/sse.js";
import type { IssueDemand } from "../src/domain/issue-poll.js";
import type { IssuesConfig } from "../src/domain/issues.js";
import { closedIssue, issue, pullRequest } from "./fixtures.js";

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
      missing: [],
      pollMode: "periodic",
      polling: false,
      sections: [
        { section: "waiting_on_me", pullRequests: [{ ...pr, reason: "ci_failed", unreadComments: 0, jira: [] }] },
        ...emptySections.slice(1),
      ],
      recentlyClosed: [],
      issueRepos: [],
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
      missing: [],
      pollMode: "periodic",
      polling: false,
      sections: emptySections,
      recentlyClosed: [],
      issueRepos: [],
    });
  });

  it("names the repos whose issues are on, as the last poll saved them", async () => {
    const store = openStore(":memory:");
    store.saveIssueRepos(["my-org/repo-b", "my-org/repo-a"]);
    const server = buildServer({ store, rules: () => rules, pollIntervalMs: () => 60_000, recentlyClosedWindowMs: () => DAY, pollHealth: () => healthy, configError: () => null });

    expect((await server.inject("/api/prs")).json().issueRepos).toEqual(["my-org/repo-b", "my-org/repo-a"]);
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

describe("POST /api/notifications/ack", () => {
  const source = () => ({ store: openStore(":memory:"), rules: () => rules, pollIntervalMs: () => 60_000, recentlyClosedWindowMs: () => DAY, pollHealth: () => healthy, configError: () => null });

  it("hands over the ids of the notifications the browser showed", async () => {
    const acknowledged: string[][] = [];
    const server = buildServer({ ...source(), acknowledgeNotifications: (ids) => acknowledged.push(ids) });

    const response = await server.inject({ method: "POST", url: "/api/notifications/ack", payload: { ids: ["mention:my-org/repo-a#1:c1"] } });

    expect(response.statusCode).toBe(204);
    expect(acknowledged).toEqual([["mention:my-org/repo-a#1:c1"]]);
  });

  it("rejects a request without ids", async () => {
    const response = await buildServer(source()).inject({ method: "POST", url: "/api/notifications/ack", payload: { id: "x" } });

    expect(response.statusCode).toBe(400);
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
    expect((broadcasts[0]!.data as { sections: { pullRequests: unknown[] }[] }).sections[0]?.pullRequests).toEqual([]);
  });
});

describe("poll mode", () => {
  /** A poller that answers every demand with `answer` and remembers what it was asked. */
  function fakePoller(answer: DemandAnswer = "poll") {
    const state = { mode: "periodic" as PollMode, polling: false, demands: [] as Demand[] };
    return {
      state,
      poller: {
        mode: () => state.mode,
        polling: () => state.polling,
        setMode: (mode: PollMode) => void (state.mode = mode),
        demand: (demand: Demand) => (state.demands.push(demand), answer),
      },
    };
  }

  function serverWith(poller: ReturnType<typeof fakePoller>["poller"], events?: EventHub) {
    return buildServer({
      store: openStore(":memory:"),
      rules: () => rules,
      pollIntervalMs: () => 60_000,
      recentlyClosedWindowMs: () => DAY,
      pollHealth: () => healthy,
      configError: () => null,
      poller,
      events,
    });
  }

  it("serves the poll mode and whether a poll is under way", async () => {
    const { state, poller } = fakePoller();
    state.mode = "on_demand";
    state.polling = true;

    const body = (await serverWith(poller).inject("/api/prs")).json();

    expect(body).toMatchObject({ pollMode: "on_demand", polling: true });
  });

  it("hands a demand to the poller and says what came of it", async () => {
    const { state, poller } = fakePoller("skip");

    const response = await serverWith(poller).inject({ method: "POST", url: "/api/poll", payload: { demand: "focus" } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ answer: "skip" });
    expect(state.demands).toEqual(["focus"]);
  });

  it("switches the poll mode and pushes the new dashboard to every open page", async () => {
    const broadcasts: { type: string; data: unknown }[] = [];
    const events: EventHub = { ...createEventHub(), broadcast: (type, data) => broadcasts.push({ type, data }) };
    const { state, poller } = fakePoller();

    const response = await serverWith(poller, events).inject({ method: "PUT", url: "/api/poll-mode", payload: { mode: "on_demand" } });

    expect(response.statusCode).toBe(204);
    expect(state.mode).toBe("on_demand");
    expect(broadcasts).toEqual([{ type: "dashboard", data: expect.objectContaining({ pollMode: "on_demand" }) }]);
  });

  it.each([
    ["/api/poll", "POST", { demand: "always" }],
    ["/api/poll-mode", "PUT", { mode: "hourly" }],
  ] as const)("rejects an unknown value on %s", async (url, method, payload) => {
    const response = await serverWith(fakePoller().poller).inject({ method, url, payload });

    expect(response.statusCode).toBe(400);
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

    const changed = { ...dashboardState(source), pollIntervalMs: 1 };
    events.broadcast("dashboard", changed);
    await readUntil("event: dashboard\n", 2);
    expect(text).toContain(`data: ${JSON.stringify(changed)}\n\n`);
    await reader.cancel();
  });

  it("sends a connecting browser the notifications it missed, after the dashboard", async () => {
    const store = openStore(":memory:");
    const source = { store, rules: () => rules, pollIntervalMs: () => 60_000, recentlyClosedWindowMs: () => DAY, pollHealth: () => healthy, configError: () => null };
    const missed = {
      id: "mention:my-org/repo-a#1:c1",
      type: "mention" as const,
      repo: "my-org/repo-a",
      number: 1,
      title: "PR 1",
      url: "https://github.com/my-org/repo-a/pull/1",
      actor: "colleague1",
    };
    const server = buildServer({ ...source, pendingNotifications: () => [{ type: "notification", data: missed }] });
    close = () => server.close();
    const address = await server.listen({ host: "127.0.0.1", port: 0 });

    const response = await fetch(`${address}/api/events`);
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let text = "";
    while (!text.includes("event: notification\n")) text += (await reader.read()).value;
    while (!text.endsWith("\n\n")) text += (await reader.read()).value;

    expect(text.indexOf("event: dashboard\n")).toBeLessThan(text.indexOf("event: notification\n"));
    expect(text).toContain(`event: notification\ndata: ${JSON.stringify(missed)}\n\n`);
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

describe("the dashboard before it is set up", () => {
  it("says what is missing", async () => {
    const server = buildServer({ ...source(), missing: () => ["token", "repos"] });

    expect((await server.inject("/api/prs")).json().missing).toEqual(["token", "repos"]);
  });
});

function source() {
  return { store: openStore(":memory:"), rules: () => rules, pollIntervalMs: () => 60_000, recentlyClosedWindowMs: () => DAY, pollHealth: () => healthy, configError: () => null };
}

const FORM = settingsForm("repos: [my-org/repo-a]\n");

/** Settings that record what the server hands them and answer as told. */
function fakeSettings(overrides: Partial<Settings> = {}) {
  const saves: { form: unknown; hash: string }[] = [];
  const tokens: string[] = [];
  const settings: Settings = {
    read: () => ({ settings: FORM, hash: "h1", invalid: null }),
    save: (form, hash) => {
      saves.push({ form, hash });
      return { ok: true, hash: "h2" };
    },
    token: () => ({ set: true, masked: "ghp_…1234" }),
    saveToken: async (token) => {
      tokens.push(token);
      return { ok: true, login: "me", scopes: ["repo"], rateLimit: { remaining: 1, limit: 5000, resetAt: null } };
    },
    checkToken: async () => ({ ok: false, message: "Няма записан токен" }),
    checkNames: async ({ repos }) => ({ repos: Object.fromEntries(repos.map((repo) => [repo, { ok: true }])), team: {} }),
    suggestions: async () => ["my-org/repo-b"],
    ...overrides,
  };
  return { settings, saves, tokens };
}

describe("the settings API", () => {
  it("serves the settings, their hash, the token only masked and the time zone", async () => {
    const server = buildServer({ ...source(), settings: fakeSettings().settings, timeZone: "Europe/Sofia" });

    const response = await server.inject("/api/config");

    expect(response.json()).toEqual({ settings: FORM, hash: "h1", invalid: null, token: { set: true, masked: "ghp_…1234" }, timeZone: "Europe/Sofia" });
  });

  it("saves the settings with the hash they were read with", async () => {
    const { settings, saves } = fakeSettings();
    const server = buildServer({ ...source(), settings });

    const response = await server.inject({ method: "PUT", url: "/api/config", payload: { settings: FORM, hash: "h1" } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ hash: "h2" });
    expect(saves).toEqual([{ form: FORM, hash: "h1" }]);
  });

  it("answers 409 when the file changed since it was read", async () => {
    const server = buildServer({ ...source(), settings: fakeSettings({ save: () => ({ ok: false, reason: "conflict" }) }).settings });

    const response = await server.inject({ method: "PUT", url: "/api/config", payload: { settings: FORM, hash: "old" } });

    expect(response.statusCode).toBe(409);
  });

  it("answers 422 with the fields that are wrong", async () => {
    const issues = [{ path: "repos[0]", message: 'expected "owner/name"' }];
    const server = buildServer({ ...source(), settings: fakeSettings({ save: () => ({ ok: false, reason: "invalid", issues }) }).settings });

    const response = await server.inject({ method: "PUT", url: "/api/config", payload: { settings: FORM, hash: "h1" } });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ issues });
  });

  it("saves a token and answers with what GitHub said about it, never the token", async () => {
    const { settings, tokens } = fakeSettings();
    const server = buildServer({ ...source(), settings });

    const response = await server.inject({ method: "PUT", url: "/api/token", payload: { token: "ghp_good1234" } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ check: { ok: true, login: "me", scopes: ["repo"], rateLimit: { remaining: 1, limit: 5000, resetAt: null } }, token: { set: true, masked: "ghp_…1234" } });
    expect(response.body).not.toContain("ghp_good1234");
    expect(tokens).toEqual(["ghp_good1234"]);
  });

  it("answers 422 for a token GitHub refuses", async () => {
    const server = buildServer({ ...source(), settings: fakeSettings({ saveToken: async () => ({ ok: false, message: "GitHub отказва токена: Bad credentials" }) }).settings });

    const response = await server.inject({ method: "PUT", url: "/api/token", payload: { token: "ghp_bad" } });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ message: "GitHub отказва токена: Bad credentials" });
  });

  it("checks the saved token, repos and logins, and hints at repos", async () => {
    const server = buildServer({ ...source(), settings: fakeSettings().settings });

    expect((await server.inject({ method: "POST", url: "/api/token/check", payload: {} })).json()).toEqual({ ok: false, message: "Няма записан токен" });
    expect((await server.inject({ method: "POST", url: "/api/config/check", payload: { repos: ["my-org/repo-a"], team: [] } })).json()).toEqual({
      repos: { "my-org/repo-a": { ok: true } },
      team: {},
    });
    expect((await server.inject("/api/config/suggestions")).json()).toEqual({ repos: ["my-org/repo-b"] });
  });
});

describe("requests from other sites", () => {
  it("refuses a write from another origin", async () => {
    const { settings, tokens } = fakeSettings();
    const server = buildServer({ ...source(), settings });

    const response = await server.inject({
      method: "PUT",
      url: "/api/token",
      headers: { host: "127.0.0.1:3000", origin: "http://evil.example" },
      payload: { token: "ghp_theirs" },
    });

    expect(response.statusCode).toBe(403);
    expect(tokens).toEqual([]);
  });

  it("takes a write from the dashboard's own page, on whatever port it is reached", async () => {
    const server = buildServer({ ...source(), settings: fakeSettings().settings });

    const response = await server.inject({ method: "PUT", url: "/api/token", headers: { host: "localhost:8080", origin: "http://localhost:8080" }, payload: { token: "t" } });

    expect(response.statusCode).toBe(200);
  });

  it("refuses any API request under a host name that is not this machine, as after DNS rebinding", async () => {
    const server = buildServer({ ...source(), settings: fakeSettings().settings });

    expect((await server.inject({ url: "/api/config", headers: { host: "evil.example:3000" } })).statusCode).toBe(403);
  });

  it("refuses a write that is not JSON, which a page elsewhere could send without asking", async () => {
    const { settings, tokens } = fakeSettings();
    const server = buildServer({ ...source(), settings });

    const response = await server.inject({ method: "PUT", url: "/api/token", headers: { "content-type": "text/plain" }, payload: '{"token":"ghp_theirs"}' });

    expect(response.statusCode).toBe(403);
    expect(tokens).toEqual([]);
  });

  it("refuses a write with no content type at all", async () => {
    const server = buildServer({ ...source(), settings: fakeSettings().settings });

    const response = await server.inject({ method: "POST", url: "/api/token/check" });

    expect(response.statusCode).toBe(403);
  });
});

describe("the issues API", () => {
  /** An issue poller that answers every demand with `answer` and remembers what it was asked. */
  function fakeIssuePoller(answer: DemandAnswer = "poll") {
    const demands: { repo: string; demand: IssueDemand }[] = [];
    return {
      demands,
      poller: {
        demand: (repo: string, demand: IssueDemand) => (demands.push({ repo, demand }), answer),
        polling: (repo: string) => repo === "my-org/repo-b",
        error: () => null,
      },
    };
  }

  function serverWith(options: { config?: IssuesConfig; poller?: ReturnType<typeof fakeIssuePoller>["poller"] } = {}) {
    const store = openStore(":memory:");
    let config = options.config ?? { columns: ["ready-for-agent", "in-progress"], repos: { "my-org/repo-b": { columns: ["todo"] } } };
    const server = buildServer({
      ...source(),
      store,
      issues: {
        repos: () => ["my-org/repo-a", "my-org/repo-b"],
        config: () => config,
        recentlyClosedWindowMs: () => DAY,
        poller: options.poller ?? fakeIssuePoller().poller,
      },
    });
    return { server, store, reconfigure: (next: IssuesConfig) => (config = next) };
  }

  const labelled = (number: number, ...names: string[]) => issue({ number, labels: names.map((name) => ({ name, color: "ededed" })) });

  it("serves a repo's saved issues with when they were fetched, each in its stage, and the stages in order", async () => {
    const { server, store } = serverWith();
    store.saveIssues({ repo: "my-org/repo-a", issues: [labelled(1, "bug"), labelled(2, "in-progress", "ready-for-agent")], totalCount: 120, closed: [] }, new Date("2026-10-30T10:00:00Z"));

    const response = await server.inject("/api/issues?repo=my-org/repo-a");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      repo: "my-org/repo-a",
      fetchedAt: "2026-10-30T10:00:00.000Z",
      stages: ["ready-for-agent", "in-progress"],
      issues: [
        { ...labelled(1, "bug"), stage: null },
        { ...labelled(2, "in-progress", "ready-for-agent"), stage: "in-progress" },
      ],
      totalCount: 120,
      closed: [],
      polling: false,
      error: null,
    });
  });

  it("serves a repo with a list of its own by that list, and a repo not polled yet as empty", async () => {
    const { server } = serverWith();

    const body = (await server.inject("/api/issues?repo=my-org/repo-b")).json();

    expect(body).toEqual({ repo: "my-org/repo-b", fetchedAt: null, stages: ["todo"], issues: [], totalCount: 0, closed: [], polling: true, error: null });
  });

  it("serves the stages in effect now, so a reloaded config.yaml reorders the board", async () => {
    const { server, store, reconfigure } = serverWith();
    store.saveIssues({ repo: "my-org/repo-a", issues: [labelled(2, "in-progress", "ready-for-agent")], totalCount: 1, closed: [] }, new Date());

    reconfigure({ columns: ["in-progress", "ready-for-agent"], repos: {} });
    const body = (await server.inject("/api/issues?repo=my-org/repo-a")).json();

    expect(body.stages).toEqual(["in-progress", "ready-for-agent"]);
    expect(body.issues[0].stage).toBe("ready-for-agent");
  });

  it("serves the issues closed within recently_closed_window, whatever their labels, and not those closed before", async () => {
    const { server, store } = serverWith();
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
    const done = closedIssue({ number: 3, labels: [{ name: "in-progress", color: "ededed" }], closedAt: hoursAgo(2) });
    const dropped = closedIssue({ number: 4, closedAt: hoursAgo(5), closedAs: "not_planned" });
    // Within the window when it was polled, but the window has moved on since.
    const old = closedIssue({ number: 5, closedAt: hoursAgo(25) });
    store.saveIssues({ repo: "my-org/repo-a", issues: [], totalCount: 0, closed: [done, dropped, old] }, new Date());

    const body = (await server.inject("/api/issues?repo=my-org/repo-a")).json();

    expect(body.closed).toEqual([done, dropped]);
  });

  it("serves each issue's milestone and Linked PRs as the poll saved them", async () => {
    const { server, store } = serverWith();
    const milestone = { title: "v2.0", dueOn: "2026-11-30T00:00:00Z" };
    const linkedPullRequests = [{ repo: "my-org/repo-a", number: 12, url: "https://github.com/my-org/repo-a/pull/12", status: "draft" as const }];
    store.saveIssues({ repo: "my-org/repo-a", issues: [issue({ number: 3, milestone, linkedPullRequests })], totalCount: 1, closed: [] }, new Date());

    const body = (await server.inject("/api/issues?repo=my-org/repo-a")).json();

    expect(body.issues[0]).toMatchObject({ milestone, linkedPullRequests });
  });

  it("serves no repo that is not followed", async () => {
    const { server } = serverWith();

    expect((await server.inject("/api/issues?repo=other-org/repo-z")).statusCode).toBe(404);
    expect((await server.inject("/api/issues?repo=nonsense")).statusCode).toBe(400);
    expect((await server.inject("/api/issues")).statusCode).toBe(400);
  });

  it("hands a demand for a repo's issues to the issue poller and says what came of it", async () => {
    const { demands, poller } = fakeIssuePoller("join");
    const { server } = serverWith({ poller });

    const response = await server.inject({ method: "POST", url: "/api/issues/poll", payload: { repo: "my-org/repo-a", reason: "open" } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ answer: "join" });
    expect(demands).toEqual([{ repo: "my-org/repo-a", demand: "open" }]);
  });

  it("refuses a demand with an unknown reason or for a repo not followed", async () => {
    const { demands, poller } = fakeIssuePoller();
    const { server } = serverWith({ poller });

    const unknownReason = await server.inject({ method: "POST", url: "/api/issues/poll", payload: { repo: "my-org/repo-a", reason: "always" } });
    const unfollowed = await server.inject({ method: "POST", url: "/api/issues/poll", payload: { repo: "other-org/repo-z", reason: "open" } });

    expect(unknownReason.statusCode).toBe(400);
    expect(unfollowed.statusCode).toBe(404);
    expect(demands).toEqual([]);
  });

  it("refuses a demand from another origin, like every write", async () => {
    const { demands, poller } = fakeIssuePoller();
    const { server } = serverWith({ poller });

    const response = await server.inject({
      method: "POST",
      url: "/api/issues/poll",
      headers: { host: "127.0.0.1:3000", origin: "http://evil.example" },
      payload: { repo: "my-org/repo-a", reason: "button" },
    });

    expect(response.statusCode).toBe(403);
    expect(demands).toEqual([]);
  });
});
