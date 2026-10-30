import { afterEach, describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import { type ClassifyRules, SECTIONS } from "../src/domain/classify.js";
import type { PollHealth } from "../src/domain/poll-error.js";
import { buildServer, dashboardState } from "../src/server.js";
import { createEventHub } from "../src/sse.js";
import { pullRequest } from "./fixtures.js";

const rules: ClassifyRules = { team: ["colleague1"], requiredApprovals: 1 };

const pr = pullRequest({ number: 3, title: "Add dashboard", ci: "FAILURE" });

const emptySections = SECTIONS.map((section) => ({ section, pullRequests: [] }));

const healthy: PollHealth = { error: null, problems: [] };

describe("GET /api/prs", () => {
  it("serves the stored snapshot grouped into sections before any poll has run", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pr] }, new Date("2026-10-30T10:00:00Z"));
    const server = buildServer({ store, rules, pollIntervalMs: 60_000, pollHealth: () => healthy });

    const response = await server.inject("/api/prs");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      viewer: "me",
      fetchedAt: "2026-10-30T10:00:00.000Z",
      pollIntervalMs: 60_000,
      error: null,
      problems: [],
      sections: [{ section: "waiting_on_me", pullRequests: [{ ...pr, reason: "ci_failed" }] }, ...emptySections.slice(1)],
    });
  });

  it("returns empty sections and the poll error while nothing has been fetched", async () => {
    const error = { kind: "auth", message: "GitHub API responded 401: Bad credentials", resetAt: null } as const;
    const server = buildServer({
      store: openStore(":memory:"),
      rules,
      pollIntervalMs: 60_000,
      pollHealth: () => ({ error, problems: [] }),
    });

    const response = await server.inject("/api/prs");

    expect(response.json()).toEqual({
      viewer: null,
      fetchedAt: null,
      pollIntervalMs: 60_000,
      error,
      problems: [],
      sections: emptySections,
    });
  });

  it("keeps serving the last good snapshot while polls fail", async () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pr] }, new Date("2026-10-30T10:00:00Z"));
    const error = { kind: "unreachable", message: "fetch failed", resetAt: null } as const;
    const server = buildServer({ store, rules, pollIntervalMs: 60_000, pollHealth: () => ({ error, problems: [] }) });

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
    const options = { store, rules, pollIntervalMs: 60_000, pollHealth: () => healthy };
    const server = buildServer({ ...options, events });
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
    expect(text).toContain(`data: ${JSON.stringify(dashboardState(options))}\n\n`);

    events.broadcast("dashboard", { changed: true });
    await readUntil("event: dashboard\n", 2);
    expect(text).toContain('data: {"changed":true}\n\n');
    await reader.cancel();
  });
});

describe("GET /", () => {
  it("serves the dashboard page", async () => {
    const server = buildServer({ store: openStore(":memory:"), rules, pollIntervalMs: 60_000, pollHealth: () => healthy });

    const response = await server.inject("/");

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
  });
});
