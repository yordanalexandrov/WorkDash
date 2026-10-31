import { describe, expect, it } from "vitest";
import { pullRequest } from "../../test/fixtures.js";
import { pushedAt } from "../../src/domain/types.js";
import type { DashboardState } from "../src/api.js";
import { cleanBody, findOpen, latest } from "../src/detail.js";

describe("cleanBody", () => {
  it("leaves out an HTML comment", () => {
    expect(cleanBody("Fixes the login.<!-- template hint --> Done.")).toBe("Fixes the login. Done.");
  });

  it("leaves out several comments, also ones over many lines, and trims what is left", () => {
    expect(cleanBody("<!--\n## Checklist\n- [ ] tests\n-->\n\nAdds the sheet.\n<!-- one more -->\n")).toBe("Adds the sheet.");
  });

  it("leaves no comment behind when removing one leaves another, nor an unclosed one, which hides the rest on GitHub", () => {
    expect(cleanBody("a <!<!-- x -->-- y --> b")).toBe("a  b");
    expect(cleanBody("Adds the sheet.\n<!-- unfinished template")).toBe("Adds the sheet.");
  });

  it("keeps a long description whole", () => {
    expect(cleanBody("a".repeat(20_000))).toBe("a".repeat(20_000));
  });

  it("leaves an empty description empty", () => {
    expect(cleanBody("")).toBe("");
    expect(cleanBody("  <!-- only the template -->  ")).toBe("");
  });
});

describe("latest", () => {
  const comment = (id: string, createdAt: string) => ({ id, author: "colleague1", createdAt, body: "ok" });

  it("puts the newest first and keeps at most n", () => {
    const comments = [
      comment("a", "2026-10-28T10:00:00Z"),
      comment("b", "2026-10-30T10:00:00Z"),
      comment("c", "2026-10-29T10:00:00Z"),
      comment("d", "2026-10-31T10:00:00Z"),
    ];
    expect(latest(comments, 3, (c) => c.createdAt).map((c) => c.id)).toEqual(["d", "b", "c"]);
  });

  it("orders commits by when they were pushed, not committed", () => {
    const commits = [
      { oid: "old-rebased", committedAt: "2026-10-20T10:00:00Z", firstSeenAt: "2026-10-31T09:00:00Z" },
      { oid: "recent", committedAt: "2026-10-30T10:00:00Z" },
    ];
    expect(latest(commits, 6, pushedAt).map((c) => c.oid)).toEqual(["old-rebased", "recent"]);
  });
});

describe("findOpen", () => {
  const mine = { ...pullRequest({ number: 1 }), jira: [] };
  const theirs = { ...pullRequest({ repo: "my-org/repo-b", number: 7, author: "colleague1" }), jira: [] };
  const state: DashboardState = {
    viewer: "me",
    fetchedAt: "2026-10-31T10:00:00Z",
    pollIntervalMs: 60_000,
    pollMode: "periodic",
    polling: false,
    error: null,
    problems: [],
    configError: null,
    sections: [
      { section: "waiting_on_others", pullRequests: [mine] },
      { section: "free_for_review", pullRequests: [theirs] },
    ],
    recentlyClosed: [{ repo: "my-org/repo-a", number: 3, title: "Old", url: "", author: "me", state: "MERGED", closedAt: "2026-10-30T10:00:00Z" }],
  };

  it("finds the open PR and its section by key", () => {
    expect(findOpen(state, "my-org/repo-b#7")).toEqual({ pr: theirs, section: "free_for_review" });
    expect(findOpen(state, "my-org/repo-a#1")).toEqual({ pr: mine, section: "waiting_on_others" });
  });

  it("finds nothing for a closed PR or one that is not on the dashboard", () => {
    expect(findOpen(state, "my-org/repo-a#3")).toBeUndefined();
    expect(findOpen(state, "my-org/repo-b#1")).toBeUndefined();
    expect(findOpen(null, "my-org/repo-a#1")).toBeUndefined();
  });
});
