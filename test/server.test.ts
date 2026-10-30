import { describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import { type ClassifyRules, SECTIONS } from "../src/domain/classify.js";
import { buildServer } from "../src/server.js";
import { pullRequest } from "./fixtures.js";

const rules: ClassifyRules = { team: ["colleague1"], requiredApprovals: 1 };

const pr = pullRequest({ number: 3, title: "Add dashboard", ci: "FAILURE" });

const emptySections = SECTIONS.map((section) => ({ section, pullRequests: [] }));

describe("GET /api/prs", () => {
  it("serves the stored snapshot grouped into sections before any poll has run", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pr] }, new Date("2026-10-30T10:00:00Z"));
    const server = buildServer({ store, rules, pollIntervalMs: 60_000, lastPollError: () => null });

    const response = await server.inject("/api/prs");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      viewer: "me",
      fetchedAt: "2026-10-30T10:00:00.000Z",
      pollIntervalMs: 60_000,
      error: null,
      sections: [{ section: "waiting_on_me", pullRequests: [{ ...pr, reason: "ci_failed", jira: [] }] }, ...emptySections.slice(1)],
    });
  });

  it("links each PR to the Jira tickets it names", async () => {
    const store = openStore(":memory:");
    const jiraPr = pullRequest({ headRefName: "feature/ABC-1-login", title: "ABC-1: Add login", body: "See XYZ-9" });
    store.saveSnapshot({ viewer: "me", pullRequests: [jiraPr] }, new Date("2026-10-30T10:00:00Z"));
    const server = buildServer({
      store,
      rules,
      jira: { baseUrl: "https://example.atlassian.net/browse/", projectKeys: ["ABC"] },
      pollIntervalMs: 60_000,
      lastPollError: () => null,
    });

    const response = await server.inject("/api/prs");

    const [served] = response.json().sections.flatMap((s: { pullRequests: unknown[] }) => s.pullRequests);
    expect(served.jira).toEqual([{ key: "ABC-1", url: "https://example.atlassian.net/browse/ABC-1" }]);
  });

  it("returns empty sections and the poll error while nothing has been fetched", async () => {
    const server = buildServer({
      store: openStore(":memory:"),
      rules,
      pollIntervalMs: 60_000,
      lastPollError: () => "GitHub API responded 401: Bad credentials",
    });

    const response = await server.inject("/api/prs");

    expect(response.json()).toEqual({
      viewer: null,
      fetchedAt: null,
      pollIntervalMs: 60_000,
      error: "GitHub API responded 401: Bad credentials",
      sections: emptySections,
    });
  });
});

describe("GET /", () => {
  it("serves the dashboard page", async () => {
    const server = buildServer({ store: openStore(":memory:"), rules, pollIntervalMs: 60_000, lastPollError: () => null });

    const response = await server.inject("/");

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
  });
});
