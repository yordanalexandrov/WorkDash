import { describe, expect, it } from "vitest";
import { assignedToMe, closedAsMark, linkedPrMark, milestoneMark, stageMark } from "../src/issueMarks.js";

const linked = (status: "open" | "draft" | "merged" | "closed", repo = "my-org/repo-a", number = 12) => ({
  repo,
  number,
  url: `https://github.com/${repo}/pull/${number}`,
  status,
});

describe("linkedPrMark", () => {
  it("colours a linked PR by its status, in the status colours", () => {
    expect(linkedPrMark(linked("open"), "my-org/repo-a").kind).toBe("ok");
    expect(linkedPrMark(linked("draft"), "my-org/repo-a").kind).toBe("muted");
    expect(linkedPrMark(linked("merged"), "my-org/repo-a").kind).toBe("merged");
    expect(linkedPrMark(linked("closed"), "my-org/repo-a").kind).toBe("bad");
  });

  it("names a PR of the issue's own repo by its number, and says its status on hover", () => {
    expect(linkedPrMark(linked("merged"), "my-org/repo-a")).toEqual({
      text: "#12",
      kind: "merged",
      title: "PR #12 · merged",
      url: "https://github.com/my-org/repo-a/pull/12",
    });
    expect(linkedPrMark(linked("open"), "My-Org/Repo-A").text).toBe("#12");
  });

  it("names a PR of another repo by the repo's short name too", () => {
    expect(linkedPrMark(linked("closed", "my-org/repo-b", 4), "my-org/repo-a")).toMatchObject({ text: "repo-b#4", title: "PR my-org/repo-b#4 · затворен" });
  });
});

describe("assignedToMe", () => {
  it("is true when the viewer is one of the assignees, whatever the case of the login", () => {
    expect(assignedToMe({ assignees: ["colleague1", "Me"] }, "me")).toBe(true);
    expect(assignedToMe({ assignees: ["colleague1"] }, "me")).toBe(false);
  });

  it("is false before the viewer is known", () => {
    expect(assignedToMe({ assignees: ["me"] }, null)).toBe(false);
  });
});

describe("milestoneMark", () => {
  it("names the milestone and says its due date on hover", () => {
    expect(milestoneMark({ title: "v2.0", dueOn: "2026-11-30T00:00:00Z" })).toEqual({ text: "v2.0", title: "milestone v2.0 · срок 30.11.2026" });
  });

  it("says when a milestone has no due date", () => {
    expect(milestoneMark({ title: "Someday", dueOn: null }).title).toBe("milestone Someday · без срок");
  });
});

describe("stageMark", () => {
  it("draws a stage in --blue with its name, and none in --faint as „без етап“", () => {
    expect(stageMark("in-progress")).toEqual({ accent: "var(--blue)", label: "in-progress", title: "етап in-progress" });
    expect(stageMark(null)).toEqual({ accent: "var(--faint)", label: "без етап", title: "без етап" });
  });
});

describe("closedAsMark", () => {
  it("says a completed issue in --merged and one not planned in --muted", () => {
    expect(closedAsMark("completed")).toEqual({ kind: "merged", text: "🎉 завършен" });
    expect(closedAsMark("not_planned")).toEqual({ kind: "muted", text: "не е планиран" });
  });
});
