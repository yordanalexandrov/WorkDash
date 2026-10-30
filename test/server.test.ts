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
      sections: [{ section: "waiting_on_me", pullRequests: [{ ...pr, reason: "ci_failed", unreadComments: 0 }] }, ...emptySections.slice(1)],
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

describe("POST /api/seen", () => {
  const commented = pullRequest({
    number: 4,
    comments: [{ id: "c1", author: "colleague1", createdAt: "2026-10-30T09:59:00Z", body: "why?" }],
  });

  function serverWith(...pullRequests: (typeof pr)[]) {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests }, new Date("2026-10-30T10:00:00Z"));
    return buildServer({ store, rules, pollIntervalMs: 60_000, lastPollError: () => null });
  }

  const sectionOf = async (server: ReturnType<typeof buildServer>, number: number) =>
    ((await server.inject("/api/prs")).json() as { sections: { section: string; pullRequests: { number: number }[] }[] }).sections.find(
      (s) => s.pullRequests.some((p) => p.number === number),
    )?.section;

  it("marks a PR seen as of the snapshot the page showed, so its comments stop waiting on me", async () => {
    const server = serverWith(commented);
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
    const server = serverWith(commented);

    await server.inject({ method: "POST", url: "/api/seen", payload: { repo: "my-org/repo-a", number: 4, at: "2026-10-30T09:00:00.000Z" } });

    expect(await sectionOf(server, 4)).toBe("waiting_on_me");
  });

  it.each([
    ["no repo", { number: 4 }],
    ["no number", { repo: "my-org/repo-a" }],
    ["a bad time", { repo: "my-org/repo-a", number: 4, at: "yesterday" }],
  ])("rejects a request with %s", async (_, payload) => {
    const response = await serverWith(commented).inject({ method: "POST", url: "/api/seen", payload });

    expect(response.statusCode).toBe(400);
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
