import { describe, expect, it } from "vitest";
import { pullRequest } from "../../test/fixtures.js";
import { checkBadges, closedBadge, reviewBadges, statusBadges, unreadBadges } from "../src/badges.js";

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

describe("checkBadges", () => {
  it("shows CI and Sonar results", () => {
    expect(checkBadges(pr({ ci: "PENDING", sonar: "SUCCESS" }))).toEqual([
      { text: "CI …", kind: "pending" },
      { text: "Sonar ✓", kind: "ok" },
    ]);
  });

  it("marks a PR without CI checks and leaves Sonar out when the repo does not run it", () => {
    expect(checkBadges(pr({ ci: null, sonar: null }))).toEqual([{ text: "CI –", kind: "muted", title: "Няма CI проверки" }]);
  });

  it("leaves out a failure the reason badge already names", () => {
    expect(checkBadges({ ...pr({ ci: "FAILURE", sonar: "FAILURE" }), reason: "ci_failed" })).toEqual([
      { text: "Sonar ✗", kind: "bad" },
    ]);
  });
});

describe("unreadBadges", () => {
  it("shows how many comments are unread", () => {
    expect(unreadBadges({ ...pr(), unreadComments: 2 })).toEqual([{ text: "💬 2", kind: "pending", title: "2 непрочетени коментара" }]);
  });

  it("shows nothing when every comment is read", () => {
    expect(unreadBadges({ ...pr(), unreadComments: 0 })).toEqual([]);
    expect(unreadBadges(pr())).toEqual([]);
  });

  it("does not repeat the count the reason already names", () => {
    expect(unreadBadges({ ...pr(), reason: "unread_comments", unreadComments: 2 })).toEqual([]);
  });
});

describe("reviewBadges", () => {
  it("marks each reviewer's latest review and skips dismissed ones", () => {
    const reviews = [
      { author: "colleague1", state: "APPROVED", submittedAt: "2026-10-30T09:00:00Z" },
      { author: "colleague2", state: "DISMISSED", submittedAt: "2026-10-30T09:00:00Z" },
      { author: "colleague3", state: "COMMENTED", submittedAt: "2026-10-30T09:00:00Z" },
    ] as const;

    expect(reviewBadges(pr({ reviews: [...reviews] }))).toEqual([
      { text: "✓ colleague1", kind: "ok" },
      { text: "💬 colleague3", kind: "muted" },
    ]);
  });
});

describe("closedBadge", () => {
  const closed = {
    repo: "my-org/repo-a",
    number: 9,
    title: "Ship it",
    url: "https://github.com/my-org/repo-a/pull/9",
    author: "me",
    closedAt: "2026-10-30T11:00:00Z",
  };

  it("tells a merged PR from one closed without merging", () => {
    expect(closedBadge({ ...closed, state: "MERGED" })).toEqual({ text: "merged", kind: "merged" });
    expect(closedBadge({ ...closed, state: "CLOSED" })).toEqual({ text: "closed", kind: "bad", title: "Затворен без merge" });
  });
});
