import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import type { PrEvent } from "../src/domain/events.js";
import type { ClosedPullRequest, PullRequest } from "../src/domain/types.js";
import { pullRequest } from "./fixtures.js";

function pr(repo: string, number: number): PullRequest {
  return pullRequest({ repo, number, author: "colleague1" });
}

function closed(number: number): ClosedPullRequest {
  return {
    repo: "my-org/repo-a",
    number,
    title: `PR ${number}`,
    url: `https://github.com/my-org/repo-a/pull/${number}`,
    author: "colleague1",
    state: "MERGED",
    closedAt: "2026-10-30T09:00:00Z",
  };
}

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("SnapshotStore", () => {
  it("has no snapshot before the first poll", () => {
    const store = openStore(":memory:");

    expect(store.loadSnapshot()).toBeNull();
  });

  it("returns the latest snapshot, replacing the previous one", () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pr("my-org/repo-a", 1), pr("my-org/repo-a", 2)] }, new Date("2026-10-30T10:00:00Z"));
    store.saveSnapshot({ viewer: "me", pullRequests: [pr("my-org/repo-a", 2), pr("my-org/repo-b", 5)] }, new Date("2026-10-30T10:01:00Z"));

    expect(store.loadSnapshot()).toEqual({
      viewer: "me",
      pullRequests: [pr("my-org/repo-a", 2), pr("my-org/repo-b", 5)],
      fetchedAt: "2026-10-30T10:01:00.000Z",
    });
  });

  it("keeps the snapshot across a restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "workdash-"));
    dirs.push(dir);
    const path = join(dir, "workdash.db");

    const first = openStore(path);
    first.saveSnapshot({ viewer: "me", pullRequests: [pr("my-org/repo-a", 1)] }, new Date("2026-10-30T10:00:00Z"));
    first.close();

    expect(openStore(path).loadSnapshot()?.pullRequests).toEqual([pr("my-org/repo-a", 1)]);
  });

  it("keeps recently closed PRs apart from the open ones, replacing the previous list", () => {
    const store = openStore(":memory:");
    store.saveSnapshot({ viewer: "me", pullRequests: [pr("my-org/repo-a", 2)] }, new Date("2026-10-30T10:00:00Z"));
    store.saveRecentlyClosed([closed(1), closed(3)]);
    store.saveRecentlyClosed([closed(3)]);

    expect(store.loadRecentlyClosed()).toEqual([closed(3)]);
    expect(store.loadSnapshot()?.pullRequests).toEqual([pr("my-org/repo-a", 2)]);
  });

  it("keeps the recently closed PRs across a restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "workdash-"));
    dirs.push(dir);
    const path = join(dir, "workdash.db");

    const first = openStore(path);
    first.saveRecentlyClosed([closed(1)]);
    first.close();

    expect(openStore(path).loadRecentlyClosed()).toEqual([closed(1)]);
  });

  it("keeps the repos whose issues are on across a restart, replacing the previous list", () => {
    const dir = mkdtempSync(join(tmpdir(), "workdash-"));
    dirs.push(dir);
    const path = join(dir, "workdash.db");

    const first = openStore(path);
    expect(first.loadIssueRepos()).toEqual([]);
    first.saveIssueRepos(["my-org/repo-a", "my-org/repo-b"]);
    first.saveIssueRepos(["my-org/repo-c", "my-org/repo-a"]);
    first.close();

    expect(openStore(path).loadIssueRepos()).toEqual(["my-org/repo-c", "my-org/repo-a"]);
  });

  it("drops a snapshot saved in an older format, so the next poll replaces it", () => {
    const dir = mkdtempSync(join(tmpdir(), "workdash-"));
    dirs.push(dir);
    const path = join(dir, "workdash.db");

    openStore(path).saveSnapshot({ viewer: "me", pullRequests: [pr("my-org/repo-a", 1)] }, new Date("2026-10-30T10:00:00Z"));
    const db = new Database(path);
    db.pragma("user_version = 0");
    db.close();

    expect(openStore(path).loadSnapshot()).toBeNull();
  });
});

describe("SnapshotStore: seen marks", () => {
  it("knows when each PR was last marked seen", () => {
    const store = openStore(":memory:");
    store.markSeen("my-org/repo-a", 1, new Date("2026-10-30T10:00:00Z"));
    store.markSeen("my-org/repo-a", 1, new Date("2026-10-30T11:00:00Z"));
    store.markSeen("my-org/repo-b", 1, new Date("2026-10-30T09:00:00Z"));

    const seen = store.loadSeen();

    expect(seen(pr("my-org/repo-a", 1))).toBe("2026-10-30T11:00:00.000Z");
    expect(seen(pr("my-org/repo-b", 1))).toBe("2026-10-30T09:00:00.000Z");
    expect(seen(pr("my-org/repo-a", 2))).toBeNull();
  });

  it("never moves a seen mark back", () => {
    const store = openStore(":memory:");
    store.markSeen("my-org/repo-a", 1, new Date("2026-10-30T11:00:00Z"));
    store.markSeen("my-org/repo-a", 1, new Date("2026-10-30T10:00:00Z"));

    expect(store.loadSeen()(pr("my-org/repo-a", 1))).toBe("2026-10-30T11:00:00.000Z");
  });

  it("gives a first-seen mark only to PRs that have no mark yet", () => {
    const store = openStore(":memory:");
    store.markSeen("my-org/repo-a", 1, new Date("2026-10-30T10:00:00Z"));

    store.markFirstSeen([pr("my-org/repo-a", 1), pr("my-org/repo-a", 2)], new Date("2026-10-30T12:00:00Z"));
    store.markFirstSeen([pr("my-org/repo-a", 2)], new Date("2026-10-30T13:00:00Z"));

    const seen = store.loadSeen();
    expect(seen(pr("my-org/repo-a", 1))).toBe("2026-10-30T10:00:00.000Z");
    expect(seen(pr("my-org/repo-a", 2))).toBe("2026-10-30T12:00:00.000Z");
  });

  it("keeps seen marks across a restart, even when the snapshot format changes", () => {
    const dir = mkdtempSync(join(tmpdir(), "workdash-"));
    dirs.push(dir);
    const path = join(dir, "workdash.db");

    openStore(path).markSeen("my-org/repo-a", 1, new Date("2026-10-30T10:00:00Z"));
    const db = new Database(path);
    db.pragma("user_version = 0");
    db.close();

    expect(openStore(path).loadSeen()(pr("my-org/repo-a", 1))).toBe("2026-10-30T10:00:00.000Z");
  });
});

describe("SnapshotStore: events", () => {
  const event = (id: string, number = 1): PrEvent => ({
    id,
    type: "mention",
    repo: "my-org/repo-a",
    number,
    title: `PR ${number}`,
    url: `https://github.com/my-org/repo-a/pull/${number}`,
    actor: "colleague1",
  });

  it("records each event once and hands back only the ones it had not seen", () => {
    const store = openStore(":memory:");

    expect(store.recordEvents([event("a"), event("b")], new Date("2026-10-30T10:00:00Z"))).toEqual([event("a"), event("b")]);
    expect(store.recordEvents([event("b"), event("c")], new Date("2026-10-30T10:01:00Z"))).toEqual([event("c")]);
  });

  it("keeps undelivered events, oldest first, until they are marked delivered", () => {
    const store = openStore(":memory:");
    store.recordEvents([event("a"), event("b")], new Date("2026-10-30T10:00:00Z"));
    store.recordEvents([event("c")], new Date("2026-10-30T10:01:00Z"));

    expect(store.undeliveredEvents()).toEqual([event("a"), event("b"), event("c")]);
    store.markDelivered(["a", "c"]);
    expect(store.undeliveredEvents()).toEqual([event("b")]);
  });

  it("remembers events across a restart and a snapshot format change, so none is repeated", () => {
    const dir = mkdtempSync(join(tmpdir(), "workdash-"));
    dirs.push(dir);
    const path = join(dir, "workdash.db");
    const first = openStore(path);
    first.recordEvents([event("a"), event("b")], new Date("2026-10-30T10:00:00Z"));
    first.markDelivered(["a"]);
    first.close();
    const db = new Database(path);
    db.pragma("user_version = 0");
    db.close();

    const second = openStore(path);
    expect(second.recordEvents([event("a")], new Date("2026-10-30T10:05:00Z"))).toEqual([]);
    expect(second.undeliveredEvents()).toEqual([event("b")]);
  });
});

describe("SnapshotStore: poll mode", () => {
  it("polls periodically until told otherwise", () => {
    expect(openStore(":memory:").loadPollMode()).toBe("periodic");
  });

  it("keeps the poll mode across a restart, even when the snapshot format changes", () => {
    const dir = mkdtempSync(join(tmpdir(), "workdash-"));
    dirs.push(dir);
    const path = join(dir, "workdash.db");

    openStore(path).savePollMode("on_demand");
    const db = new Database(path);
    db.pragma("user_version = 0");
    db.close();

    expect(openStore(path).loadPollMode()).toBe("on_demand");
  });

  it("takes the last mode saved", () => {
    const store = openStore(":memory:");
    store.savePollMode("on_demand");
    store.savePollMode("periodic");

    expect(store.loadPollMode()).toBe("periodic");
  });
});
