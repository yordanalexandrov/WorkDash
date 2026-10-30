import { describe, expect, it } from "vitest";
import { extractJiraKeys, jiraLinks } from "../src/domain/jira.js";
import { pullRequest } from "./fixtures.js";

const anyProject = { baseUrl: "https://example.atlassian.net/browse/", projectKeys: [] };

describe("extractJiraKeys", () => {
  it("finds the key in a prefixed branch name", () => {
    const pr = pullRequest({ headRefName: "feature/ABC-1-x", title: "Add login", body: "" });

    expect(extractJiraKeys(pr, anyProject)).toEqual(["ABC-1"]);
  });

  it("collects keys from branch, title and body, each once", () => {
    const pr = pullRequest({
      headRefName: "ABC-12-login",
      title: "ABC-12: Add login, see XY2-7",
      body: "Fixes ABC-12 and DEF-345.\nRelated: XY2-7",
    });

    expect(extractJiraKeys(pr, anyProject)).toEqual(["ABC-12", "XY2-7", "DEF-345"]);
  });

  it("keeps only the configured projects", () => {
    const pr = pullRequest({ headRefName: "ABC-1-x", title: "DEF-2 and ABCD-3", body: "UTF-8 ABC-4" });

    expect(extractJiraKeys(pr, { ...anyProject, projectKeys: ["ABC", "DEF"] })).toEqual(["ABC-1", "DEF-2", "ABC-4"]);
  });

  it("finds nothing when no text names a key", () => {
    const pr = pullRequest({ headRefName: "main-fix", title: "Bump abc-1 to v2-3", body: "" });

    expect(extractJiraKeys(pr, anyProject)).toEqual([]);
  });
});

describe("jiraLinks", () => {
  it("links each key to the base URL plus the key", () => {
    const pr = pullRequest({ headRefName: "feature/ABC-1-x", title: "ABC-1, DEF-2", body: "" });

    expect(jiraLinks(pr, anyProject)).toEqual([
      { key: "ABC-1", url: "https://example.atlassian.net/browse/ABC-1" },
      { key: "DEF-2", url: "https://example.atlassian.net/browse/DEF-2" },
    ]);
  });

  it("gives no links when no base URL is configured", () => {
    const pr = pullRequest({ headRefName: "feature/ABC-1-x" });

    expect(jiraLinks(pr, { baseUrl: null, projectKeys: [] })).toEqual([]);
  });
});
