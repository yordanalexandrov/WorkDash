import { describe, expect, it } from "vitest";
import { pullRequest } from "../../test/fixtures.js";
import type { ClosedPullRequest, DashboardPullRequest, DashboardState } from "../src/api.js";
import { boardColumns } from "../src/board.js";

const open = (number: number): DashboardPullRequest => ({ ...pullRequest({ number }), jira: [] });

const closed = (number: number): ClosedPullRequest => ({
  repo: "my-org/repo-a",
  number,
  title: `PR ${number}`,
  url: `https://github.com/my-org/repo-a/pull/${number}`,
  author: "me",
  state: "MERGED",
  closedAt: "2026-10-30T10:00:00Z",
});

function dashboard(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    viewer: "me",
    fetchedAt: "2026-10-31T10:00:00Z",
    pollIntervalMs: 60_000,
    pollMode: "periodic",
    polling: false,
    error: null,
    problems: [],
    configError: null,
    missing: [],
    sections: [
      { section: "waiting_on_me", pullRequests: [open(1), open(2)] },
      { section: "free_for_review", pullRequests: [] },
      { section: "ready_to_merge", pullRequests: [open(3)] },
      { section: "waiting_on_others", pullRequests: [] },
      { section: "team", pullRequests: [open(4)] },
    ],
    recentlyClosed: [closed(5)],
    ...overrides,
  };
}

describe("boardColumns", () => {
  it("gives one column per section in order, then the closed PRs, each with its title, accent and count", () => {
    expect(boardColumns(dashboard()).map(({ id, title, accent, count }) => ({ id, title, accent, count }))).toEqual([
      { id: "waiting_on_me", title: "Чака теб", accent: "var(--bad)", count: 2 },
      { id: "free_for_review", title: "Свободни за review", accent: "var(--blue)", count: 0 },
      { id: "ready_to_merge", title: "Готови за merge", accent: "var(--ok)", count: 1 },
      { id: "waiting_on_others", title: "Чакат други", accent: "var(--pending)", count: 0 },
      { id: "team", title: "Екипът", accent: "var(--faint)", count: 1 },
      { id: "closed", title: "Затворени", accent: "var(--merged)", count: 1 },
    ]);
  });

  it("puts each section's PRs in its column and the recently closed in the last", () => {
    const columns = boardColumns(dashboard());
    expect(columns[0]!.items.map((pr) => pr.number)).toEqual([1, 2]);
    expect(columns[5]!.items.map((pr) => pr.number)).toEqual([5]);
  });

  it("makes \"Чака теб\" hot while it holds a PR, and no other column", () => {
    expect(boardColumns(dashboard()).filter((column) => column.hot).map((column) => column.id)).toEqual(["waiting_on_me"]);
    const quiet = dashboard({ sections: dashboard().sections.map((group) => ({ ...group, pullRequests: [] })) });
    expect(boardColumns(quiet).some((column) => column.hot)).toBe(false);
  });
});
