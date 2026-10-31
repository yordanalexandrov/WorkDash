import { createHook } from "node:async_hooks";
import { mkdirSync, mkdtempSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TokenStore } from "../src/token-store.js";
import { openStore } from "../src/db.js";
import { startWorkDash } from "../src/workdash.js";
import { pullRequest } from "./fixtures.js";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

/**
 * Records the timers the dashboard's own code sets from now on, unref'd ones too, and tells which are still pending.
 * Node's and fetch's own timers (the Date header cache, kept-alive sockets) are not the dashboard's to stop.
 */
function watchTimers() {
  const pending = new Map<number, string>();
  const hook = createHook({
    init(id, type) {
      if (type !== "Timeout") return;
      const limit = Error.stackTraceLimit;
      Error.stackTraceLimit = 50;
      const stack = new Error().stack ?? "";
      Error.stackTraceLimit = limit;
      if (stack.includes(SRC)) pending.set(id, stack);
    },
    destroy: (id) => void pending.delete(id),
  }).enable();
  return {
    async pending(): Promise<string[]> {
      await new Promise((resolve) => setImmediate(resolve));
      hook.disable();
      return [...pending.values()];
    },
  };
}

/** The files under `dir` this process holds open, such as the database. */
function openFilesUnder(dir: string): string[] {
  return readdirSync("/proc/self/fd").flatMap((fd) => {
    try {
      const target = readlinkSync(`/proc/self/fd/${fd}`);
      return target.startsWith(dir) ? [target] : [];
    } catch {
      return [];
    }
  });
}

function memoryTokens(token: string | null = null): TokenStore {
  return { get: () => token, set: (next) => void (token = next) };
}

describe("startWorkDash", () => {
  let root: string;
  let dataDir: string;
  let webRoot: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "workdash-start-"));
    dataDir = join(root, "data");
    webRoot = join(root, "web");
    mkdirSync(join(webRoot, "public"), { recursive: true });
    writeFileSync(join(webRoot, "public", "index.html"), "<!doctype html><title>given web root</title>");
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("serves the dashboard on a free port from a fresh data directory, then closes cleanly", async () => {
    const timers = watchTimers();
    const workdash = await startWorkDash({ dataDir, tokens: memoryTokens(), host: "127.0.0.1", port: 0, webRoot, logger: false });

    expect(workdash.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(workdash.url).not.toMatch(/:0$/);
    const response = await fetch(`${workdash.url}/api/prs`);
    expect(response.status).toBe(200);
    expect(openFilesUnder(dataDir)).toContain(join(dataDir, "workdash.db"));
    expect(await response.json()).toMatchObject({ viewer: null, missing: ["token", "repos"] });

    await workdash.close();

    expect(await timers.pending()).toEqual([]);
    expect(openFilesUnder(dataDir)).toEqual([]);
    await expect(fetch(`${workdash.url}/api/prs`)).rejects.toThrow("fetch failed");
  });

  it("serves the page from the web root it is given", async () => {
    const workdash = await startWorkDash({ dataDir, tokens: memoryTokens(), host: "127.0.0.1", port: 0, webRoot, logger: false });
    try {
      const page = await fetch(`${workdash.url}/`);
      expect(await page.text()).toContain("given web root");
    } finally {
      await workdash.close();
    }
  });

  it("reads the token from the store it is given", async () => {
    const workdash = await startWorkDash({ dataDir, tokens: memoryTokens("ghp_given"), host: "127.0.0.1", port: 0, webRoot, logger: false });
    try {
      const response = await fetch(`${workdash.url}/api/prs`);
      expect(await response.json()).toMatchObject({ missing: ["repos"] });
    } finally {
      await workdash.close();
    }
  });

  it("tells how many PRs wait on me, and again once one of them is seen", async () => {
    mkdirSync(dataDir, { recursive: true });
    const seeded = openStore(join(dataDir, "workdash.db"));
    const comment = { id: "c1", author: "colleague1", createdAt: "2026-10-30T09:59:00Z", body: "why?" };
    seeded.saveSnapshot(
      { viewer: "me", pullRequests: [pullRequest({ number: 4, comments: [comment] }), pullRequest({ number: 5, ci: "FAILURE" }), pullRequest({ number: 6, comments: [comment] })] },
      new Date("2026-10-30T10:00:00Z"),
    );
    seeded.close();
    const workdash = await startWorkDash({ dataDir, tokens: memoryTokens(), host: "127.0.0.1", port: 0, webRoot, logger: false });
    try {
      const counts: number[] = [];
      const unsubscribe = workdash.onWaitingOnMe((count) => counts.push(count));
      expect(counts).toEqual([3]);

      const seen = await fetch(`${workdash.url}/api/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: "my-org/repo-a", number: 4, at: "2026-10-30T10:00:00.000Z" }),
      });
      expect(seen.status).toBe(204);
      expect(counts).toEqual([3, 2]);

      unsubscribe();
      await fetch(`${workdash.url}/api/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: "my-org/repo-a", number: 6 }),
      });
      expect(counts).toEqual([3, 2]);
    } finally {
      await workdash.close();
    }
  });

  it("switches the notification pause, which is off again after a restart", async () => {
    const start = () => startWorkDash({ dataDir, tokens: memoryTokens(), host: "127.0.0.1", port: 0, webRoot, logger: false });
    const first = await start();
    expect(first.paused()).toBe(false);
    first.setPaused(true);
    expect(first.paused()).toBe(true);
    await first.close();

    const second = await start();
    try {
      expect(second.paused()).toBe(false);
    } finally {
      await second.close();
    }
  });

  it("refuses a time zone it does not know", async () => {
    await expect(startWorkDash({ dataDir, tokens: memoryTokens(), host: "127.0.0.1", port: 0, timeZone: "Mars/Olympus", webRoot, logger: false })).rejects.toThrow(
      /unknown time zone "Mars\/Olympus"/,
    );
  });
});
