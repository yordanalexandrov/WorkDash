import { describe, expect, it } from "vitest";
import { pullRequest } from "../../test/fixtures.js";
import type { ClosedPullRequest, DashboardPullRequest, DashboardState } from "../src/api.js";
import { matchesQuery } from "../src/filter.js";
import { closedFields, filterDashboard, prFields } from "../src/prFilter.js";

const open: DashboardPullRequest = {
  ...pullRequest({ repo: "my-org/repo-a", number: 12, title: "Add the toolbar", author: "colleague1", headRefName: "feature/toolbar-chips" }),
  jira: [{ key: "ABC-123", url: "https://example.atlassian.net/browse/ABC-123" }],
};

const closed: ClosedPullRequest = {
  repo: "my-org/repo-b",
  number: 7,
  title: "Drop the old cards",
  url: "https://github.com/my-org/repo-b/pull/7",
  author: "colleague2",
  state: "MERGED",
  closedAt: "2026-10-30T10:00:00Z",
};

describe("prFields", () => {
  const finds = (query: string) => matchesQuery(prFields(open).texts, query);

  it("gives the repo and author of an open PR", () => {
    expect(prFields(open)).toMatchObject({ repo: "my-org/repo-a", author: "colleague1" });
  });

  it("lets an open PR be found by title, author, repo, number with and without #, branch and Jira key", () => {
    for (const query of ["toolbar", "colleague1", "repo-a", "12", "#12", "toolbar-chips", "abc-123"]) expect(finds(query), query).toBe(true);
    expect(finds("#13")).toBe(false);
  });
});

describe("closedFields", () => {
  const finds = (query: string) => matchesQuery(closedFields(closed).texts, query);

  it("lets a closed PR be found by title, author, repo and number with and without #", () => {
    expect(closedFields(closed)).toMatchObject({ repo: "my-org/repo-b", author: "colleague2" });
    for (const query of ["old cards", "colleague2", "repo-b", "7", "#7"]) expect(finds(query), query).toBe(true);
  });

  it("gives a closed PR no branch or Jira texts", () => {
    expect(closedFields(closed).texts).toEqual(["Drop the old cards", "colleague2", "my-org/repo-b", "7", "#7"]);
  });
});

describe("filterDashboard", () => {
  const state = {
    viewer: "me",
    sections: [
      { section: "waiting_on_me", pullRequests: [open, { ...open, repo: "my-org/repo-b", number: 13 }] },
      { section: "team", pullRequests: [] },
    ],
    recentlyClosed: [closed, { ...closed, repo: "my-org/repo-a", number: 8 }],
  } as Pick<DashboardState, "viewer" | "sections" | "recentlyClosed">;

  it("filters every section and the closed PRs, keeping the sections and their order", () => {
    const shown = filterDashboard(state, { repos: ["my-org/repo-b"], mine: false, query: "" });
    expect(shown.sections.map(({ section, pullRequests }) => [section, pullRequests.map((pr) => pr.number)])).toEqual([
      ["waiting_on_me", [13]],
      ["team", []],
    ]);
    expect(shown.recentlyClosed.map((pr) => pr.number)).toEqual([7]);
  });
});
