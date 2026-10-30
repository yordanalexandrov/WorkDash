import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import type { PullRequest } from "../src/domain/types.js";

function pr(repo: string, number: number): PullRequest {
  return {
    repo,
    number,
    title: `PR ${number}`,
    url: `https://github.com/${repo}/pull/${number}`,
    author: "colleague1",
    updatedAt: "2026-10-30T10:00:00Z",
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
});
