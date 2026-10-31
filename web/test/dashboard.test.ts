import { describe, expect, it } from "vitest";
import { issueTabs, pickRepo, readDashboard, settledPlace, writeDashboard } from "../src/dashboard.js";

describe("readDashboard", () => {
  it("opens the Issue dashboard for ?dashboard=issues, with the repo it names, and the PR dashboard otherwise", () => {
    expect(readDashboard("?dashboard=issues&repo=my-org/repo-b")).toEqual({ dashboard: "issues", repo: "my-org/repo-b" });
    expect(readDashboard("?view=table&dashboard=issues")).toEqual({ dashboard: "issues", repo: null });
    expect(readDashboard("")).toEqual({ dashboard: "prs", repo: null });
    expect(readDashboard("?dashboard=bugs&repo=my-org/repo-b")).toEqual({ dashboard: "prs", repo: null });
  });
});

describe("writeDashboard", () => {
  it("puts the Issue dashboard and its repo in the URL, keeping the other parameters", () => {
    expect(writeDashboard("http://localhost:3000/?view=table", { dashboard: "issues", repo: "my-org/repo-a" })).toBe(
      "http://localhost:3000/?view=table&dashboard=issues&repo=my-org%2Frepo-a",
    );
    expect(writeDashboard("http://localhost:3000/?dashboard=issues&repo=my-org%2Frepo-a", { dashboard: "issues", repo: null })).toBe(
      "http://localhost:3000/?dashboard=issues",
    );
  });

  it("takes both out for the PR dashboard", () => {
    expect(writeDashboard("http://localhost:3000/?dashboard=issues&repo=my-org%2Frepo-a&view=table#settings", { dashboard: "prs", repo: "my-org/repo-a" })).toBe(
      "http://localhost:3000/?view=table#settings",
    );
  });

  it("reads back what it wrote", () => {
    const url = new URL(writeDashboard("http://localhost:3000/", { dashboard: "issues", repo: "my-org/repo-a" }));
    expect(readDashboard(url.search)).toEqual({ dashboard: "issues", repo: "my-org/repo-a" });
  });
});

describe("issueTabs", () => {
  it("orders the repos by the name a tab shows, then by owner", () => {
    expect(issueTabs(["my-org/repo-c", "other-org/repo-a", "my-org/repo-b", "my-org/repo-a"])).toEqual([
      "my-org/repo-a",
      "other-org/repo-a",
      "my-org/repo-b",
      "my-org/repo-c",
    ]);
  });
});

describe("pickRepo", () => {
  const tabs = ["my-org/repo-a", "my-org/repo-b"];

  it("opens the repo asked for when it has a tab", () => {
    expect(pickRepo(tabs, "my-org/repo-b")).toBe("my-org/repo-b");
  });

  it("opens the first tab when none is asked for, or the one asked for has no tab", () => {
    expect(pickRepo(tabs, null)).toBe("my-org/repo-a");
    expect(pickRepo(tabs, "my-org/issues-off")).toBe("my-org/repo-a");
  });

  it("opens the repo asked for in another case, by the name of its tab", () => {
    expect(pickRepo(tabs, "My-Org/Repo-B")).toBe("my-org/repo-b");
  });

  it("opens nothing when no repo has a tab", () => {
    expect(pickRepo([], "my-org/repo-a")).toBeNull();
  });
});

describe("settledPlace", () => {
  const tabs = ["my-org/repo-a", "my-org/repo-b"];

  it("puts the tab opened in place of the repo asked for, when it is not the one asked for", () => {
    expect(settledPlace({ dashboard: "issues", repo: null }, tabs)).toEqual({ dashboard: "issues", repo: "my-org/repo-a" });
    expect(settledPlace({ dashboard: "issues", repo: "my-org/issues-off" }, tabs)).toEqual({ dashboard: "issues", repo: "my-org/repo-a" });
    expect(settledPlace({ dashboard: "issues", repo: "MY-ORG/repo-b" }, tabs)).toEqual({ dashboard: "issues", repo: "my-org/repo-b" });
  });

  it("is nothing to change when the repo asked for opens as it is, or there is no tab to open", () => {
    expect(settledPlace({ dashboard: "issues", repo: "my-org/repo-b" }, tabs)).toBeNull();
    expect(settledPlace({ dashboard: "issues", repo: "my-org/repo-b" }, [])).toBeNull();
    expect(settledPlace({ dashboard: "prs", repo: null }, tabs)).toBeNull();
  });
});
