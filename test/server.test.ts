import { describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import { type ClassifyRules, SECTIONS } from "../src/domain/classify.js";
import { buildServer } from "../src/server.js";
import { pullRequest } from "./fixtures.js";

const rules: ClassifyRules = { team: ["colleague1"], requiredApprovals: 1 };

const pr = pullRequest({ number: 3, title: "Add dashboard", ci: "FAILURE" });

const DAY = 24 * 3_600_000;

const emptySections = SECTIONS.map((section) => ({ section, pullRequests: [] }));

describe("GET /api/prs", () => {
  it("serves the stored snapshot grouped into sections before any poll has run", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pr] }, new Date("2026-10-30T10:00:00Z"));
    const server = buildServer({ store, rules, pollIntervalMs: 60_000, recentlyClosedWindowMs: DAY, lastPollError: () => null });

    const response = await server.inject("/api/prs");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      viewer: "me",
      fetchedAt: "2026-10-30T10:00:00.000Z",
      pollIntervalMs: 60_000,
      error: null,
      sections: [{ section: "waiting_on_me", pullRequests: [{ ...pr, reason: "ci_failed" }] }, ...emptySections.slice(1)],
      recentlyClosed: [],
    });
  });

  it("returns empty sections and the poll error while nothing has been fetched", async () => {
    const server = buildServer({
      store: openStore(":memory:"),
      rules,
      pollIntervalMs: 60_000,
      recentlyClosedWindowMs: DAY,
      lastPollError: () => "GitHub API responded 401: Bad credentials",
    });

    const response = await server.inject("/api/prs");

    expect(response.json()).toEqual({
      viewer: null,
      fetchedAt: null,
      pollIntervalMs: 60_000,
      error: "GitHub API responded 401: Bad credentials",
      sections: emptySections,
      recentlyClosed: [],
    });
  });
});

describe("GET /api/prs recentlyClosed", () => {
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
    const server = buildServer({
      store,
      rules,
      pollIntervalMs: 60_000,
      recentlyClosedWindowMs: DAY,
      lastPollError: () => null,
      now: () => new Date("2026-10-30T12:00:00Z"),
    });

    const response = await server.inject("/api/prs");

    expect(response.json().recentlyClosed).toEqual([merged]);
    expect(response.json().sections).toEqual(emptySections);
  });
});

describe("GET /", () => {
  it("serves the dashboard page", async () => {
    const server = buildServer({ store: openStore(":memory:"), rules, pollIntervalMs: 60_000, recentlyClosedWindowMs: DAY, lastPollError: () => null });

    const response = await server.inject("/");

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
  });
});
