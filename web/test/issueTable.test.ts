import { describe, expect, it } from "vitest";
import type { Issue, StagedIssue } from "../../src/domain/issues.js";
import { issue } from "../../test/fixtures.js";
import { sortItems } from "../src/table.js";
import { issueGroups, issueRows, issueTableColumns } from "../src/issueTable.js";

const STAGES = ["ready", "in progress", "review"];
const staged = (overrides: Partial<Issue> & { stage?: string | null } = {}): StagedIssue => ({ ...issue(overrides), stage: overrides.stage ?? null });
const numbers = (issues: StagedIssue[]) => issues.map((i) => i.number);
const sorted = (issues: StagedIssue[], key: string, dir: 1 | -1 = 1) => numbers(sortItems(issues, issueTableColumns(STAGES), { key, dir }, (i) => i.updatedAt));

describe("issueTableColumns", () => {
  it("sorts by milestone due date, a milestone without one after, and issues without a milestone last", () => {
    const issues = [
      staged({ number: 1 }),
      staged({ number: 2, milestone: { title: "v3", dueOn: null } }),
      staged({ number: 3, milestone: { title: "v2", dueOn: "2026-12-15T00:00:00Z" } }),
      staged({ number: 4, milestone: { title: "v1", dueOn: "2026-11-30T00:00:00Z" } }),
    ];
    expect(sorted(issues, "milestone")).toEqual([4, 3, 2, 1]);
  });

  it("sorts by stage in the board's order, \"Без етап\" first, and back the other way", () => {
    const issues = [staged({ number: 1, stage: "review" }), staged({ number: 2 }), staged({ number: 3, stage: "ready" }), staged({ number: 4, stage: "in progress" })];
    expect(sorted(issues, "stage")).toEqual([2, 3, 4, 1]);
    expect(sorted(issues, "stage", -1)).toEqual([1, 4, 3, 2]);
  });

  it("sorts by labels without the stage label, which the stage column already says", () => {
    const label = (name: string) => ({ name, color: "ededed" });
    const issues = [
      staged({ number: 1, stage: "ready", labels: [label("ready"), label("bug")] }),
      staged({ number: 2, labels: [label("api")] }),
      staged({ number: 3, stage: "ready", labels: [label("ready")] }),
    ];
    expect(sorted(issues, "labels")).toEqual([2, 1, 3]);
  });
});

const groupsOf = (issues: StagedIssue[], by: string) => issueGroups(issues, by, STAGES).map((g) => [g.id, numbers(g.items)]);

describe("issueGroups", () => {
  it("makes one group of everything when grouping by nothing", () => {
    expect(groupsOf([staged({ number: 1 }), staged({ number: 2 })], "none")).toEqual([["none:", [1, 2]]]);
  });

  it("groups by stage in the board's order, \"Без етап\" first", () => {
    const issues = [staged({ number: 1, stage: "review" }), staged({ number: 2 }), staged({ number: 3, stage: "ready" })];
    expect(groupsOf(issues, "stage")).toEqual([
      ["stage:", [2]],
      ["stage:ready", [3]],
      ["stage:review", [1]],
    ]);
  });

  it("puts an issue in the group of each of its assignees, by login, and those with none in \"Без assignee\" last", () => {
    const issues = [staged({ number: 1, assignees: ["colleague2", "colleague1"] }), staged({ number: 2 }), staged({ number: 3, assignees: ["colleague2"] })];
    expect(groupsOf(issues, "assignee")).toEqual([
      ["assignee:colleague1", [1]],
      ["assignee:colleague2", [1, 3]],
      ["assignee:", [2]],
    ]);
  });

  it("groups by milestone in the order of their due dates, one without a due date after, and no milestone last", () => {
    const issues = [
      staged({ number: 1 }),
      staged({ number: 2, milestone: { title: "v9", dueOn: null } }),
      staged({ number: 3, milestone: { title: "v2", dueOn: "2026-12-15T00:00:00Z" } }),
      staged({ number: 4, milestone: { title: "v1", dueOn: "2026-11-30T00:00:00Z" } }),
      staged({ number: 5, milestone: { title: "v2", dueOn: "2026-12-15T00:00:00Z" } }),
    ];
    expect(groupsOf(issues, "milestone")).toEqual([
      ["milestone:v1", [4]],
      ["milestone:v2", [3, 5]],
      ["milestone:v9", [2]],
      ["milestone:", [1]],
    ]);
  });
});

describe("issueRows", () => {
  const twice = staged({ number: 7, assignees: ["colleague1", "colleague2"] });
  const once = staged({ number: 8, assignees: ["colleague2"] });
  const keys = (collapsed: string[]) =>
    issueRows(issueGroups([twice, once], "assignee", STAGES), new Set(collapsed)).map((g) => [g.id, g.rows.map((row) => row.flip)]);

  it("gives an issue in two groups a key of its own in each, the first shown keeping the card's so the morph lands on it", () => {
    expect(keys([])).toEqual([
      ["assignee:colleague1", ["issue:my-org/repo-a#7"]],
      ["assignee:colleague2", ["issue:my-org/repo-a#7@assignee:colleague2", "issue:my-org/repo-a#8"]],
    ]);
  });

  it("hands the card's key to the next group shown when the first is folded", () => {
    expect(keys(["assignee:colleague1"])).toEqual([
      ["assignee:colleague1", ["issue:my-org/repo-a#7@assignee:colleague1"]],
      ["assignee:colleague2", ["issue:my-org/repo-a#7", "issue:my-org/repo-a#8"]],
    ]);
  });
});
