import { describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import { type ClassifyRules, SECTIONS } from "../src/domain/classify.js";
import type { JiraConfig } from "../src/domain/jira.js";
import { buildServer } from "../src/server.js";
import { pullRequest } from "./fixtures.js";

const rules: ClassifyRules = { team: ["colleague1"], requiredApprovals: 1 };

const pr = pullRequest({ number: 3, title: "Add dashboard", ci: "FAILURE" });

const emptySections = SECTIONS.map((section) => ({ section, pullRequests: [] }));

describe("GET /api/prs", () => {
  it("serves the stored snapshot grouped into sections before any poll has run", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pr] }, new Date("2026-10-30T10:00:00Z"));
    const server = buildServer({ store, rules: () => rules, pollIntervalMs: () => 60_000, lastPollError: () => null, configError: () => null });

    const response = await server.inject("/api/prs");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      viewer: "me",
      fetchedAt: "2026-10-30T10:00:00.000Z",
      pollIntervalMs: 60_000,
      error: null,
      configError: null,
      sections: [{ section: "waiting_on_me", pullRequests: [{ ...pr, reason: "ci_failed", jira: [] }] }, ...emptySections.slice(1)],
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
      lastPollError: () => null,
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
      lastPollError: () => null,
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
    const server = buildServer({
      store: openStore(":memory:"),
      rules: () => rules,
      pollIntervalMs: () => 60_000,
      lastPollError: () => "GitHub API responded 401: Bad credentials",
      configError: () => null,
    });

    const response = await server.inject("/api/prs");

    expect(response.json()).toEqual({
      viewer: null,
      fetchedAt: null,
      pollIntervalMs: 60_000,
      error: "GitHub API responded 401: Bad credentials",
      configError: null,
      sections: emptySections,
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
      lastPollError: () => null,
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

describe("GET /", () => {
  it("serves the dashboard page", async () => {
    const server = buildServer({ store: openStore(":memory:"), rules: () => rules, pollIntervalMs: () => 60_000, lastPollError: () => null, configError: () => null });

    const response = await server.inject("/");

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
  });
});
