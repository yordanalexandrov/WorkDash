import { describe, expect, it } from "vitest";
import { type Filter, filterItems, matchesQuery, repoChips, toggleRepo } from "../src/filter.js";

describe("matchesQuery", () => {
  const texts = ["Add the toolbar", "colleague1", "my-org/repo-a", "12", "#12"];

  it("lets everything through when the query is empty or only spaces", () => {
    expect(matchesQuery(texts, "")).toBe(true);
    expect(matchesQuery(texts, "   ")).toBe(true);
  });

  it("finds a substring whatever the case, after trimming", () => {
    expect(matchesQuery(texts, "  TOOLbar ")).toBe(true);
    expect(matchesQuery(texts, "repo-a")).toBe(true);
    expect(matchesQuery(texts, "board")).toBe(false);
  });

  it("finds the number with and without #", () => {
    expect(matchesQuery(texts, "12")).toBe(true);
    expect(matchesQuery(texts, "#12")).toBe(true);
    expect(matchesQuery(texts, "#13")).toBe(false);
  });
});

describe("filterItems", () => {
  type Item = { repo: string; author: string; title: string };
  const items: Item[] = [
    { repo: "my-org/repo-a", author: "Me", title: "Fix login" },
    { repo: "my-org/repo-a", author: "colleague1", title: "Add toolbar" },
    { repo: "my-org/repo-b", author: "me", title: "Add board" },
    { repo: "my-org/repo-c", author: "colleague2", title: "Fix board" },
  ];
  const fields = (item: Item) => ({ repo: item.repo, author: item.author, texts: [item.title] });
  const none: Filter = { repos: [], mine: false, query: "" };
  const titles = (filter: Filter, viewer: string | null = "me") => filterItems(items, filter, fields, viewer).map((item) => item.title);

  it("keeps everything when no repo is picked", () => {
    expect(titles(none)).toEqual(["Fix login", "Add toolbar", "Add board", "Fix board"]);
  });

  it("keeps only the picked repos, one or several", () => {
    expect(titles({ ...none, repos: ["my-org/repo-b"] })).toEqual(["Add board"]);
    expect(titles({ ...none, repos: ["my-org/repo-b", "my-org/repo-c"] })).toEqual(["Add board", "Fix board"]);
  });

  it("keeps only the viewer's own with only mine, whatever the case", () => {
    expect(titles({ ...none, mine: true }, "ME")).toEqual(["Fix login", "Add board"]);
  });

  it("keeps nothing with only mine before the viewer is known", () => {
    expect(titles({ ...none, mine: true }, null)).toEqual([]);
  });

  it("combines the three with and", () => {
    expect(titles({ repos: ["my-org/repo-a", "my-org/repo-b"], mine: true, query: "fix" })).toEqual(["Fix login"]);
  });
});

describe("toggleRepo", () => {
  const filter: Filter = { repos: ["my-org/repo-a"], mine: true, query: "fix" };

  it("adds a repo that is not picked, keeping the rest of the filter", () => {
    expect(toggleRepo(filter, "my-org/repo-b")).toEqual({ repos: ["my-org/repo-a", "my-org/repo-b"], mine: true, query: "fix" });
  });

  it("takes out a picked repo, and the last one out leaves every repo", () => {
    expect(toggleRepo(filter, "my-org/repo-a")).toEqual({ repos: [], mine: true, query: "fix" });
  });
});

describe("repoChips", () => {
  it("lists every repo once in name order with its open count, ignoring the filter", () => {
    const open = ["my-org/repo-b", "my-org/repo-a", "my-org/repo-b"];
    const closed = ["my-org/repo-c", "my-org/repo-a"];
    expect(repoChips(open, closed)).toEqual([
      { repo: "my-org/repo-a", count: 1 },
      { repo: "my-org/repo-b", count: 2 },
      { repo: "my-org/repo-c", count: 0 },
    ]);
  });
});
