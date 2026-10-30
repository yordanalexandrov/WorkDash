import { describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import type { ClassifyRules } from "../src/domain/classify.js";
import type { PullRequest } from "../src/domain/types.js";
import { buildServer } from "../src/server.js";

const rules: ClassifyRules = { team: ["colleague1"], requiredApprovals: 1 };

const pr: PullRequest = {
  repo: "my-org/repo-a",
  number: 3,
  title: "Add dashboard",
  url: "https://github.com/my-org/repo-a/pull/3",
  author: "me",
  isDraft: false,
  createdAt: "2026-10-29T10:00:00Z",
  updatedAt: "2026-10-30T10:00:00Z",
  mergeable: "MERGEABLE",
  reviewDecision: null,
  requestedReviewers: [],
  reviews: [],
  ci: "FAILURE",
};

const emptySections = [
  { section: "waiting_on_me", pullRequests: [] },
  { section: "free_for_review", pullRequests: [] },
  { section: "ready_to_merge", pullRequests: [] },
  { section: "waiting_on_others", pullRequests: [] },
  { section: "team", pullRequests: [] },
];

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
      sections: [{ section: "waiting_on_me", pullRequests: [{ ...pr, reason: "ci_failed" }] }, ...emptySections.slice(1)],
    });
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
