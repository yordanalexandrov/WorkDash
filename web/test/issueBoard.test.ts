import { describe, expect, it } from "vitest";
import { issue } from "../../test/fixtures.js";
import type { StagedIssue } from "../src/api.js";
import { cardLabels, issueColumns } from "../src/issueBoard.js";

const staged = (number: number, stage: string | null, ...labels: string[]): StagedIssue => ({
  ...issue({ number, labels: labels.map((name) => ({ name, color: "ededed" })) }),
  stage,
});

describe("issueColumns", () => {
  it("puts Без етап first, then a column per stage in the configured order, named after its label", () => {
    const columns = issueColumns({ stages: ["ready-for-agent", "in-progress"], issues: [] });

    expect(columns.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: "none", title: "Без етап" },
      { id: "stage:ready-for-agent", title: "ready-for-agent" },
      { id: "stage:in-progress", title: "in-progress" },
    ]);
  });

  it("puts each issue in the column of its stage, in the order given, and counts them", () => {
    const columns = issueColumns({
      stages: ["ready-for-agent", "in-progress"],
      issues: [staged(1, "in-progress"), staged(2, null), staged(3, "in-progress"), staged(4, "ready-for-agent")],
    });

    expect(columns.map(({ count, items }) => ({ count, numbers: items.map((item) => item.number) }))).toEqual([
      { count: 1, numbers: [2] },
      { count: 1, numbers: [4] },
      { count: 2, numbers: [1, 3] },
    ]);
  });

  it("has only Без етап when no stages are configured", () => {
    const columns = issueColumns({ stages: [], issues: [staged(1, null)] });

    expect(columns.map(({ id, count }) => ({ id, count }))).toEqual([{ id: "none", count: 1 }]);
  });

  it("marks no column as needing me now", () => {
    expect(issueColumns({ stages: ["todo"], issues: [staged(1, "todo")] }).some((column) => column.hot)).toBe(false);
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
