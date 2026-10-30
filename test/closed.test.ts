import { describe, expect, it } from "vitest";
import { updateRecentlyClosed, vanishedPullRequests, withinWindow } from "../src/domain/closed.js";
import type { ClosedPullRequest } from "../src/domain/types.js";
import { pullRequest } from "./fixtures.js";

const DAY = 24 * 3_600_000;
const now = new Date("2026-10-30T12:00:00Z");

function closed(number: number, closedAt: string, overrides: Partial<ClosedPullRequest> = {}): ClosedPullRequest {
  return {
    repo: "my-org/repo-a",
    number,
    title: `PR ${number}`,
    url: `https://github.com/my-org/repo-a/pull/${number}`,
    author: "me",
    state: "MERGED",
    closedAt,
    ...overrides,
  };
}

const keys = (prs: { repo: string; number: number }[]) => prs.map((pr) => `${pr.repo}#${pr.number}`);

describe("vanishedPullRequests", () => {
  it("lists the PRs that were open last poll and are not open now", () => {
    const previous = [pullRequest({ number: 1 }), pullRequest({ number: 2 }), pullRequest({ repo: "my-org/repo-b", number: 1 })];
    const current = [pullRequest({ number: 2 }), pullRequest({ number: 3 })];

    expect(keys(vanishedPullRequests(previous, current, []))).toEqual(["my-org/repo-a#1", "my-org/repo-b#1"]);
  });

  it("ignores the PRs of a repo this poll could not read, since they did not really disappear", () => {
    const previous = [pullRequest({ number: 1 }), pullRequest({ repo: "my-org/repo-b", number: 1 })];

    expect(keys(vanishedPullRequests(previous, [], ["my-org/repo-b"]))).toEqual(["my-org/repo-a#1"]);
  });
});

describe("updateRecentlyClosed", () => {
  it("adds the newly closed PRs, most recently closed first", () => {
    const known = [closed(1, "2026-10-30T08:00:00Z")];
    const newlyClosed = [closed(2, "2026-10-30T11:00:00Z", { state: "CLOSED" })];

    expect(updateRecentlyClosed({ known, newlyClosed, open: [], now, windowMs: DAY })).toEqual([
      closed(2, "2026-10-30T11:00:00Z", { state: "CLOSED" }),
      closed(1, "2026-10-30T08:00:00Z"),
    ]);
  });

  it("drops PRs closed longer ago than the window", () => {
    const known = [closed(1, "2026-10-29T11:59:00Z"), closed(2, "2026-10-29T12:01:00Z")];

    expect(updateRecentlyClosed({ known, newlyClosed: [], open: [], now, windowMs: DAY })).toEqual([
      closed(2, "2026-10-29T12:01:00Z"),
    ]);
  });

  it("drops a PR that was reopened", () => {
    const known = [closed(1, "2026-10-30T08:00:00Z")];
    const open = [pullRequest({ number: 1 })];

    expect(updateRecentlyClosed({ known, newlyClosed: [], open, now, windowMs: DAY })).toEqual([]);
  });

  it("keeps one entry per PR, the latest closing", () => {
    const known = [closed(1, "2026-10-30T08:00:00Z", { state: "CLOSED" })];
    const newlyClosed = [closed(1, "2026-10-30T11:00:00Z")];

    expect(updateRecentlyClosed({ known, newlyClosed, open: [], now, windowMs: DAY })).toEqual([
      closed(1, "2026-10-30T11:00:00Z"),
    ]);
  });
});

describe("withinWindow", () => {
  it("keeps only the PRs closed within the window", () => {
    const list = [closed(2, "2026-10-30T11:00:00Z"), closed(1, "2026-10-29T11:00:00Z")];

    expect(withinWindow(list, now, DAY)).toEqual([closed(2, "2026-10-30T11:00:00Z")]);
  });
});
