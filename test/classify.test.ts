import { describe, expect, it } from "vitest";
import { classify, groupIntoSections, type ClassifyRules } from "../src/domain/classify.js";
import type { PullRequest, Review } from "../src/domain/types.js";
import { pullRequest } from "./fixtures.js";

const rules: ClassifyRules = { team: ["colleague1", "colleague2"], requiredApprovals: 1 };

const pr = pullRequest;

function review(author: string, state: Review["state"]): Review {
  return { author, state, submittedAt: "2026-10-30T09:00:00Z" };
}

describe("classify: my PR", () => {
  it.each(["FAILURE", "ERROR"] as const)("waits on me when CI is %s", (ci) => {
    expect(classify(pr({ ci, reviewDecision: "CHANGES_REQUESTED" }), "me", rules)).toEqual({
      section: "waiting_on_me",
      reason: "ci_failed",
    });
  });

  it("waits on me when the Sonar quality gate fails", () => {
    expect(classify(pr({ sonar: "FAILURE", reviewDecision: "CHANGES_REQUESTED" }), "me", rules)).toEqual({
      section: "waiting_on_me",
      reason: "sonar_failed",
    });
  });

  it("waits on me when changes are requested", () => {
    expect(classify(pr({ reviewDecision: "CHANGES_REQUESTED", mergeable: "CONFLICTING" }), "me", rules)).toEqual({
      section: "waiting_on_me",
      reason: "changes_requested",
    });
  });

  it("waits on me when a reviewer requested changes in a repo without required reviews", () => {
    expect(classify(pr({ reviews: [review("colleague1", "CHANGES_REQUESTED")] }), "me", rules)).toEqual({
      section: "waiting_on_me",
      reason: "changes_requested",
    });
  });

  it("waits on me when it has a merge conflict", () => {
    expect(classify(pr({ mergeable: "CONFLICTING", reviewDecision: "APPROVED" }), "me", rules)).toEqual({
      section: "waiting_on_me",
      reason: "conflict",
    });
  });

  it("is ready to merge when approved, green, without conflict and not a draft", () => {
    expect(classify(pr({ reviewDecision: "APPROVED" }), "me", rules)).toEqual({ section: "ready_to_merge" });
  });

  it("waits on me when it is ready except that the branch is behind its base", () => {
    expect(classify(pr({ reviewDecision: "APPROVED", mergeStateStatus: "BEHIND" }), "me", rules)).toEqual({
      section: "waiting_on_me",
      reason: "needs_rebase",
    });
  });

  it("waits on others, not on a rebase, while it is behind but not yet approved", () => {
    expect(classify(pr({ mergeStateStatus: "BEHIND" }), "me", rules)).toEqual({ section: "waiting_on_others" });
  });

  it("is ready to merge when the repo has no CI and no Sonar", () => {
    expect(classify(pr({ reviewDecision: "APPROVED", ci: null, sonar: null }), "me", rules)).toEqual({ section: "ready_to_merge" });
  });

  it("is ready to merge when Sonar passes", () => {
    expect(classify(pr({ reviewDecision: "APPROVED", sonar: "SUCCESS" }), "me", rules)).toEqual({ section: "ready_to_merge" });
  });

  it.each([
    ["CI is pending", { ci: "PENDING" }],
    ["Sonar is pending", { sonar: "PENDING" }],
    ["it is a draft", { isDraft: true }],
    ["review is still required", { reviewDecision: "REVIEW_REQUIRED" }],
    ["nobody has approved", { reviewDecision: null }],
  ] as const)("waits on others when %s", (_, overrides) => {
    expect(classify(pr({ reviewDecision: "APPROVED", ...overrides }), "me", rules)).toEqual({
      section: "waiting_on_others",
    });
  });

  it("falls back to required_approvals when GitHub has no review decision", () => {
    const approvedOnce = pr({ reviews: [review("colleague1", "APPROVED")] });
    const approvedTwice = pr({ reviews: [review("colleague1", "APPROVED"), review("colleague2", "APPROVED")] });
    const strict = { ...rules, requiredApprovals: 2 };

    expect(classify(approvedOnce, "me", rules)).toEqual({ section: "ready_to_merge" });
    expect(classify(approvedOnce, "me", strict)).toEqual({ section: "waiting_on_others" });
    expect(classify(approvedTwice, "me", strict)).toEqual({ section: "ready_to_merge" });
  });

  it("does not count comments as approvals", () => {
    expect(classify(pr({ reviews: [review("colleague1", "COMMENTED")] }), "me", rules)).toEqual({
      section: "waiting_on_others",
    });
  });

  it("matches my login regardless of case", () => {
    expect(classify(pr({ author: "Me", ci: "FAILURE" }), "me", rules)?.section).toBe("waiting_on_me");
  });
});

describe("classify: someone else's PR", () => {
  it("waits on me when my review is requested, even from outside the team", () => {
    expect(classify(pr({ author: "stranger", requestedReviewers: ["me"], isDraft: true }), "me", rules)).toEqual({
      section: "waiting_on_me",
      reason: "review_requested",
    });
  });

  it("is free for review when a team member's PR is open, unapproved and I have not reviewed it", () => {
    expect(classify(pr({ author: "colleague1", reviews: [review("colleague2", "COMMENTED")] }), "me", rules)).toEqual({
      section: "free_for_review",
    });
  });

  it("matches team members regardless of case", () => {
    expect(classify(pr({ author: "Colleague1" }), "me", rules)).toEqual({ section: "free_for_review" });
  });

  it.each<[string, Partial<PullRequest>]>([
    ["it is a draft", { isDraft: true }],
    ["it is approved", { reviewDecision: "APPROVED" }],
    ["it has enough approvals without a review decision", { reviews: [review("colleague2", "APPROVED")] }],
    ["I have already reviewed it", { reviews: [review("me", "COMMENTED")] }],
  ])("belongs to the team section when %s", (_, overrides) => {
    expect(classify(pr({ author: "colleague1", ...overrides }), "me", rules)).toEqual({ section: "team" });
  });

  it("is not shown when the author is outside the team and nobody asked me", () => {
    expect(classify(pr({ author: "stranger" }), "me", rules)).toBeNull();
  });
});

describe("groupIntoSections", () => {
  it("returns every section in attention order, newest update first, with hidden PRs left out", () => {
    const sections = groupIntoSections(
      [
        pr({ number: 1, author: "colleague1", updatedAt: "2026-10-30T08:00:00Z" }),
        pr({ number: 2, ci: "FAILURE" }),
        pr({ number: 3, author: "colleague2", updatedAt: "2026-10-30T09:00:00Z" }),
        pr({ number: 4, author: "stranger" }),
      ],
      "me",
      rules,
    );

    expect(sections.map((s) => [s.section, s.pullRequests.map((p) => p.number)])).toEqual([
      ["waiting_on_me", [2]],
      ["free_for_review", [3, 1]],
      ["ready_to_merge", []],
      ["waiting_on_others", []],
      ["team", []],
    ]);
    expect(sections[0]?.pullRequests[0]?.reason).toBe("ci_failed");
  });
});
