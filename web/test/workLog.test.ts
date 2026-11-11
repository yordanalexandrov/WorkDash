import { describe, expect, it } from "vitest";
import type { WorkEvent, WorkLogPr } from "../src/api.js";
import { dayCells, dayOf, relativeDay, windowDays, workActions, workEntries, workGroups, workMarkdown } from "../src/workLog.js";

/** An instant on a local day of November 2026, at `hour` local time. */
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();

const TODAY = "2026-11-11"; // a Wednesday

function pr(number: number, events: WorkEvent[], overrides: Partial<WorkLogPr> = {}): WorkLogPr {
  return {
    repo: "my-org/repo-a",
    number,
    title: `PR ${number}`,
    url: `https://github.com/my-org/repo-a/pull/${number}`,
    role: "author",
    jira: [],
    events,
    ...overrides,
  };
}

const jira = (key: string) => ({ key, url: `https://example.atlassian.net/browse/${key}` });

describe("days", () => {
  it("takes the local day of an instant, late in the evening too", () => {
    expect(dayOf(at(9, 23))).toBe("2026-11-09");
  });

  it("lists the days of each window, the oldest first", () => {
    expect(windowDays("today", TODAY)).toEqual(["2026-11-11"]);
    expect(windowDays("yesterday", TODAY)).toEqual(["2026-11-10"]);
    expect(windowDays("7", TODAY)).toEqual(["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(windowDays("14", TODAY)).toHaveLength(14);
    expect(windowDays("14", TODAY)[0]).toBe("2026-10-29");
  });

  it("names today and yesterday", () => {
    expect([relativeDay("2026-11-11", TODAY), relativeDay("2026-11-10", TODAY), relativeDay("2026-11-09", TODAY)]).toEqual(["днес", "вчера", ""]);
  });
});

describe("workActions", () => {
  it("says what I did in a few words, with Bulgarian plurals", () => {
    const events: WorkEvent[] = [
      { kind: "opened", at: at(9) },
      { kind: "commit", at: at(9) },
      { kind: "commit", at: at(9) },
      { kind: "comment", at: at(9) },
      { kind: "merged", at: at(9) },
    ];

    expect(workActions(events).map((action) => action.text)).toEqual(["отворен", "2 commit-а", "1 коментар", "merged"]);
  });

  it("marks a day's reviews once, by the last verdict that was not only comments", () => {
    const review = (verdict: "approved" | "changes" | "commented"): WorkEvent => ({ kind: "review", at: at(9), verdict });

    expect(workActions([review("changes"), review("approved"), review("commented")]).map((a) => a.text)).toEqual(["review ✓"]);
    expect(workActions([review("approved"), review("changes")]).map((a) => a.text)).toEqual(["review ✗ промени"]);
    expect(workActions([review("commented")]).map((a) => a.text)).toEqual(["review"]);
  });
});

describe("workGroups", () => {
  const days = windowDays("7", TODAY); // 11-05 (Thu) … 11-11 (Wed)
  const prs = [
    pr(1, [{ kind: "commit", at: at(11) }, { kind: "commit", at: at(9) }], { jira: [jira("ABC-2"), jira("ABC-10")] }),
    pr(2, [{ kind: "review", at: at(9), verdict: "approved" }], { repo: "my-org/repo-b", role: "review" }),
  ];
  const entries = workEntries(prs, days);

  it("by day: the newest first, a PR once a day, an empty working day with no rows, an empty weekend left out", () => {
    const groups = workGroups(entries, days, "day", TODAY);

    expect(groups.map((group) => [group.title, group.rows.map((row) => row.pr.number)])).toEqual([
      ["ср 11.11 · днес", [1]],
      ["вт 10.11 · вчера", []],
      ["пн 09.11", [1, 2]],
      ["пт 06.11", []],
      ["чт 05.11", []],
    ]);
  });

  it("by repo: in name order, each row with its days, the newest first", () => {
    const groups = workGroups(entries, days, "repo", TODAY);

    expect(groups.map((group) => [group.title, group.rows.map((row) => [row.pr.number, row.days.map((d) => d.day)])])).toEqual([
      ["my-org/repo-a", [[1, ["2026-11-11", "2026-11-09"]]]],
      ["my-org/repo-b", [[2, ["2026-11-09"]]]],
    ]);
  });

  it("by ticket: a PR under each ticket it names, in key order, then Без тикет", () => {
    const groups = workGroups(entries, days, "ticket", TODAY);

    expect(groups.map((group) => [group.title, group.rows.map((row) => row.pr.number)])).toEqual([
      ["ABC-2 PR 1", [1]],
      ["ABC-10 PR 1", [1]],
      ["Без тикет", [2]],
    ]);
  });

  it("counts a day's PRs of each kind in the strip and marks an empty working day", () => {
    const cells = dayCells(entries, days);

    expect(cells.find((cell) => cell.day === "2026-11-09")).toEqual({ day: "2026-11-09", author: 1, review: 1, hole: false, weekend: false });
    expect(cells.find((cell) => cell.day === "2026-11-10")?.hole).toBe(true);
    expect(cells.find((cell) => cell.day === "2026-11-08")).toMatchObject({ hole: false, weekend: true });
  });
});

describe("workMarkdown", () => {
  it("lists the working days, the oldest first, the tickets with their PRs under each, then Без тикет", () => {
    const days = windowDays("7", TODAY).slice(-3); // 11-09 … 11-11
    const entries = workEntries(
      [
        pr(1, [{ kind: "opened", at: at(9) }, { kind: "commit", at: at(9) }], { jira: [jira("ABC-1")] }),
        pr(2, [{ kind: "review", at: at(9), verdict: "approved" }], { repo: "my-org/repo-b", role: "review" }),
        pr(1, [{ kind: "merged", at: at(11) }], { jira: [jira("ABC-1")] }),
      ],
      days,
    );

    expect(workMarkdown(entries, days)).toBe(
      [
        "## пн 09.11",
        "ABC-1 PR 1",
        "  - my-org/repo-a#1 (автор): отворен, 1 commit",
        "Без тикет",
        "  - my-org/repo-b#2 (review): review ✓",
        "## вт 10.11",
        "—",
        "## ср 11.11",
        "ABC-1 PR 1",
        "  - my-org/repo-a#1 (автор): merged",
      ].join("\n"),
    );
  });
});
