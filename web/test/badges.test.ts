import { describe, expect, it } from "vitest";
import { pullRequest } from "../../test/fixtures.js";
import { checkBadges, reviewBadges, statusBadges } from "../src/badges.js";

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
