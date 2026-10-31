import { describe, expect, it } from "vitest";
import { closedIssue, issue } from "../../test/fixtures.js";
import type { StagedIssue } from "../src/api.js";
import { cardLabels, issueColumns } from "../src/issueBoard.js";

const staged = (number: number, stage: string | null, ...labels: string[]): StagedIssue => ({
  ...issue({ number, labels: labels.map((name) => ({ name, color: "ededed" })) }),
  stage,
});

describe("issueColumns", () => {
  it("puts Без етап first, then a column per stage in the configured order, named after its label, then Затворени", () => {
    const columns = issueColumns({ stages: ["ready-for-agent", "in-progress"], issues: [], closed: [] });

    expect(columns.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: "none", title: "Без етап" },
      { id: "stage:ready-for-agent", title: "ready-for-agent" },
      { id: "stage:in-progress", title: "in-progress" },
      { id: "closed", title: "Затворени" },
    ]);
  });

  it("puts each issue in the column of its stage, in the order given, and counts them", () => {
    const columns = issueColumns({
      stages: ["ready-for-agent", "in-progress"],
      issues: [staged(1, "in-progress"), staged(2, null), staged(3, "in-progress"), staged(4, "ready-for-agent")],
      closed: [],
    });

    expect(columns.map(({ count, items }) => ({ count, numbers: items.map((item) => item.number) }))).toEqual([
      { count: 1, numbers: [2] },
      { count: 1, numbers: [4] },
      { count: 2, numbers: [1, 3] },
      { count: 0, numbers: [] },
    ]);
  });

  it("has only Без етап and Затворени when no stages are configured", () => {
    const columns = issueColumns({ stages: [], issues: [staged(1, null)], closed: [] });

    expect(columns.map(({ id, count }) => ({ id, count }))).toEqual([
      { id: "none", count: 1 },
      { id: "closed", count: 0 },
    ]);
  });

  it("ends with Затворени in the merged accent, holding the closed issues in the order given", () => {
    const columns = issueColumns({
      stages: ["todo"],
      issues: [staged(1, "todo")],
      closed: [closedIssue({ number: 3 }), closedIssue({ number: 2, closedAs: "not_planned" })],
    });

    const last = columns.at(-1)!;
    expect({ id: last.id, title: last.title, accent: last.accent, count: last.count }).toEqual({ id: "closed", title: "Затворени", accent: "var(--merged)", count: 2 });
    expect(last.items.map((item) => item.number)).toEqual([3, 2]);
  });

  it("marks no column as needing me now", () => {
    expect(issueColumns({ stages: ["todo"], issues: [staged(1, "todo")], closed: [closedIssue()] }).some((column) => column.hot)).toBe(false);
  });
});

describe("cardLabels", () => {
  it("leaves out the label the column already says, whatever its case, and keeps the rest in order", () => {
    expect(cardLabels(staged(1, "in-progress", "bug", "In-Progress", "docs")).map((label) => label.name)).toEqual(["bug", "docs"]);
  });

  it("keeps every label of an issue without a stage", () => {
    expect(cardLabels(staged(1, null, "bug", "docs")).map((label) => label.name)).toEqual(["bug", "docs"]);
  });
});
