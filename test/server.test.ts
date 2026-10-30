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
    const server = buildServer({ store, rules: () => rules, pollIntervalMs: () => 60_000, lastPollError: () => null, configError: () => null });

    const response = await server.inject("/api/prs");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      viewer: "me",
      fetchedAt: "2026-10-30T10:00:00.000Z",
      pollIntervalMs: 60_000,
      error: null,
      configError: null,
      sections: [{ section: "waiting_on_me", pullRequests: [{ ...pr, reason: "ci_failed" }] }, ...emptySections.slice(1)],
    });
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
