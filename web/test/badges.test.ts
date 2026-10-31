import { describe, expect, it } from "vitest";
import { pullRequest } from "../../test/fixtures.js";
import { statusBadges } from "../src/badges.js";

const pr = pullRequest;

describe("statusBadges", () => {
  it("shows the reason, the draft mark and the merge state", () => {
    expect(statusBadges({ ...pr({ isDraft: true, mergeStateStatus: "BLOCKED" }), reason: "changes_requested" })).toEqual([
      { text: "changes requested", kind: "bad" },
      { text: "draft", kind: "muted" },
      { text: "blocked", kind: "muted", title: "Merge е блокиран от правилата на repo-то (review-та или задължителни проверки)" },
    ]);
  });

  it("shows a conflict when GitHub already says CONFLICTING but has not computed DIRTY yet", () => {
    expect(statusBadges(pr({ mergeable: "CONFLICTING", mergeStateStatus: "UNKNOWN" }))).toEqual([
      { text: "conflict", kind: "bad", title: "Има конфликт с base клона" },
    ]);
  });

  it.each([
    [1, "1 нов коментар"],
    [3, "3 нови коментара"],
  ])("names the number of new comments on my PR (%i)", (unreadComments, text) => {
    expect(statusBadges({ ...pr(), reason: "unread_comments", unreadComments })[0]).toEqual({ text, kind: "bad" });
  });

  it("names a mention", () => {
    expect(statusBadges({ ...pr(), reason: "mention" })[0]).toEqual({ text: "mention", kind: "bad" });
  });

  it.each([
    [{ newCommits: 1, replies: 0 }, "re-review: 1 нов commit"],
    [{ newCommits: 2, replies: 0 }, "re-review: 2 нови commit-а"],
    [{ newCommits: 0, replies: 1 }, "re-review: 1 отговор"],
    [{ newCommits: 3, replies: 2 }, "re-review: 3 нови commit-а, 2 отговора"],
  ])("says what is new for a re-review (%o)", (reReview, text) => {
    expect(statusBadges({ ...pr(), reason: "re_review", reReview })[0]).toEqual({ text, kind: "bad" });
  });

  it("does not repeat a merge state the reason already names", () => {
    expect(statusBadges({ ...pr({ mergeStateStatus: "BEHIND" }), reason: "needs_rebase" })).toEqual([
      { text: "needs rebase", kind: "pending" },
    ]);
  });
});
