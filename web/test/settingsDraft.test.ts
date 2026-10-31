import { describe, expect, it } from "vitest";
import { labelHints, missingFrom, moved, onCommonList } from "../src/settingsDraft.js";

describe("moved", () => {
  it("moves an item one place up or down", () => {
    expect(moved(["todo", "doing", "done"], 2, 1)).toEqual(["todo", "done", "doing"]);
    expect(moved(["todo", "doing", "done"], 0, 1)).toEqual(["doing", "todo", "done"]);
  });

  it("leaves the list as it is past either end", () => {
    const list = ["todo", "doing"];

    expect(moved(list, 0, -1)).toBe(list);
    expect(moved(list, 1, 2)).toBe(list);
  });
});

describe("onCommonList", () => {
  it("lists the repos without a list of their own, whatever the case of their names", () => {
    const issues = { columns: ["todo"], repos: { "My-Org/Repo-B": { columns: ["next"] } } };

    expect(onCommonList(issues, ["my-org/repo-a", "my-org/repo-b", "my-org/repo-c"])).toEqual(["my-org/repo-a", "my-org/repo-c"]);
  });
});

const labels = {
  "my-org/repo-a": [
    { name: "todo", color: "ededed" },
    { name: "bug", color: "d73a4a" },
  ],
  "my-org/repo-b": [
    { name: "Todo", color: "ededed" },
    { name: "review", color: "0e8a16" },
  ],
  "my-org/repo-c": null,
};

describe("labelHints", () => {
  it("offers the labels of the repos the list is for, once each, but not those in the list already", () => {
    expect(labelHints(labels, ["my-org/repo-a", "my-org/repo-b", "my-org/repo-c"], ["BUG"])).toEqual(["todo", "review"]);
  });
});

describe("missingFrom", () => {
  it("names the repos whose labels on GitHub do not have it, whatever its case", () => {
    expect(missingFrom("REVIEW", labels, ["my-org/repo-a", "my-org/repo-b"])).toEqual(["my-org/repo-a"]);
  });

  it("doubts no repo GitHub did not answer about", () => {
    expect(missingFrom("doing", labels, ["my-org/repo-c", "my-org/repo-d"])).toEqual([]);
  });
});
