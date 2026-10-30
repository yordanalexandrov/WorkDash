import { describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import { buildServer } from "../src/server.js";

const pr = {
  repo: "my-org/repo-a",
  number: 3,
  title: "Add dashboard",
  url: "https://github.com/my-org/repo-a/pull/3",
  author: "colleague1",
  updatedAt: "2026-10-30T10:00:00Z",
};

describe("GET /api/prs", () => {
  it("serves the stored snapshot before any poll has run", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pr] }, new Date("2026-10-30T10:00:00Z"));
    const server = buildServer({ store, pollIntervalMs: 60_000, lastPollError: () => null });

    const response = await server.inject("/api/prs");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      viewer: "me",
      fetchedAt: "2026-10-30T10:00:00.000Z",
      pollIntervalMs: 60_000,
      error: null,
      pullRequests: [pr],
    });
  });

  it("returns an empty list and the poll error while nothing has been fetched", async () => {
    const server = buildServer({
      store: openStore(":memory:"),
      pollIntervalMs: 60_000,
      lastPollError: () => "GitHub API responded 401: Bad credentials",
    });

    const response = await server.inject("/api/prs");

    expect(response.json()).toEqual({
      viewer: null,
      fetchedAt: null,
      pollIntervalMs: 60_000,
      error: "GitHub API responded 401: Bad credentials",
      pullRequests: [],
    });
  });
});

describe("GET /", () => {
  it("serves the dashboard page", async () => {
    const server = buildServer({ store: openStore(":memory:"), pollIntervalMs: 60_000, lastPollError: () => null });

    const response = await server.inject("/");

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
  });
});
