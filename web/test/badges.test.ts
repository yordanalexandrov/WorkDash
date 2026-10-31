import { describe, expect, it } from "vitest";
import { pullRequest } from "../../test/fixtures.js";
import { reasonBadge } from "../src/badges.js";

const pr = pullRequest;

describe("reasonBadge", () => {
  it("names the reason", () => {
    expect(reasonBadge({ ...pr(), reason: "changes_requested" })).toEqual({ text: "changes requested", kind: "bad" });
    expect(reasonBadge({ ...pr(), reason: "needs_rebase" })).toEqual({ text: "needs rebase", kind: "pending" });
  });

  it("gives no label to a PR that does not wait on me", () => {
    expect(reasonBadge(pr())).toBeUndefined();
  });

  it.each([
    [1, "1 нов коментар"],
    [3, "3 нови коментара"],
  ])("names the number of new comments on my PR (%i)", (unreadComments, text) => {
    expect(reasonBadge({ ...pr(), reason: "unread_comments", unreadComments })).toEqual({ text, kind: "bad" });
  });

  it("names a mention", () => {
    expect(reasonBadge({ ...pr(), reason: "mention" })).toEqual({ text: "mention", kind: "bad" });
  });

  it.each([
    [{ newCommits: 1, replies: 0 }, "re-review: 1 нов commit"],
    [{ newCommits: 2, replies: 0 }, "re-review: 2 нови commit-а"],
    [{ newCommits: 0, replies: 1 }, "re-review: 1 отговор"],
    [{ newCommits: 3, replies: 2 }, "re-review: 3 нови commit-а, 2 отговора"],
  ])("says what is new for a re-review (%o)", (reReview, text) => {
    expect(reasonBadge({ ...pr(), reason: "re_review", reReview })).toEqual({ text, kind: "bad" });
  });
});
