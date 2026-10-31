import { describe, expect, it } from "vitest";
import { closedIssue, issue } from "../../test/fixtures.js";
import { matchesQuery } from "../src/filter.js";
import { NO_FILTER } from "../src/filter.js";
import { filterIssueColumns, issueTexts } from "../src/issueFilter.js";
import type { IssueColumn } from "../src/issueBoard.js";

const open = issue({
  number: 42,
  title: "Show the stages on the board",
  labels: [{ name: "ready-for-agent", color: "0e8a16" }],
  assignees: ["colleague2"],
});

describe("issueTexts", () => {
  const finds = (item: Parameters<typeof issueTexts>[0], query: string) => matchesQuery(issueTexts(item), query);

  it("lets an issue be found by number with and without #, title, label and assignee, whatever the case", () => {
    for (const query of ["42", "#42", "STAGES on", "ready-for", "colleague2"]) expect(finds(open, query), query).toBe(true);
    expect(finds(open, "#43")).toBe(false);
  });

  it("does not find an issue by its author or repo", () => {
    expect(finds(open, "colleague1")).toBe(false);
    expect(finds(open, "repo-a")).toBe(false);
  });

  it("lets an issue be found by its milestone, once it has one", () => {
    expect(finds({ ...open, milestone: { title: "Sprint 12" } }, "sprint 1")).toBe(true);
    expect(finds({ ...open, milestone: null }, "sprint")).toBe(false);
  });
});

describe("filterIssueColumns", () => {
  const column = (id: string, ...numbers: number[]): IssueColumn => {
    const items = numbers.map((number) => ({
      ...issue({ number, title: number % 2 ? "Fix the tabs" : "Add the filter", assignees: number > 2 ? ["Me"] : ["colleague2"] }),
      stage: null,
    }));
    return { id, title: id, accent: "var(--blue)", count: items.length, hot: false, closed: false, items };
  };
  const columns = [column("none", 1, 2, 3), column("stage:in-progress", 4, 5)];
  const numbers = (shown: IssueColumn[]) => shown.map(({ id, count, items }) => [id, count, items.map((item) => item.number)]);

  it("keeps the issues assigned to me in only mine, whatever the case of the login", () => {
    expect(numbers(filterIssueColumns(columns, { ...NO_FILTER, mine: true }, "me"))).toEqual([
      ["none", 1, [3]],
      ["stage:in-progress", 2, [4, 5]],
    ]);
  });

  it("combines only mine and the text, keeping every column and counting what is left, so a column left empty folds", () => {
    expect(numbers(filterIssueColumns(columns, { ...NO_FILTER, mine: true, query: "filter" }, "me"))).toEqual([
      ["none", 0, []],
      ["stage:in-progress", 1, [4]],
    ]);
  });

  it("keeps nothing in only mine before it is known who I am", () => {
    expect(numbers(filterIssueColumns(columns, { ...NO_FILTER, mine: true }, null))).toEqual([
      ["none", 0, []],
      ["stage:in-progress", 0, []],
    ]);
  });

  it("narrows Затворени too", () => {
    const closed: IssueColumn = {
      id: "closed",
      title: "Затворени",
      accent: "var(--merged)",
      count: 2,
      hot: false,
      closed: true,
      items: [closedIssue({ number: 6, assignees: ["me"] }), closedIssue({ number: 7 })],
    };

    expect(numbers(filterIssueColumns([closed], { ...NO_FILTER, mine: true }, "me"))).toEqual([["closed", 1, [6]]]);
  });

  it("gives the columns back as they are with no filter", () => {
    expect(filterIssueColumns(columns, NO_FILTER, "me")).toEqual(columns);
  });
});
