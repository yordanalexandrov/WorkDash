import { describe, expect, it } from "vitest";
import { classify, groupIntoSections, type ClassifyRules } from "../src/domain/classify.js";
import type { Comment, PullRequest, Review } from "../src/domain/types.js";
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

function comment(author: string, createdAt: string, body = "", thread?: string): Comment {
  return { id: `${author}-${createdAt}`, author, createdAt, body, ...(thread ? { thread } : {}) };
}

describe("classify: unread comments on my PR", () => {
  const comments = [comment("colleague1", "2026-10-30T11:00:00Z"), comment("me", "2026-10-30T12:00:00Z")];

  it("waits on me while someone else's comment is unread", () => {
    expect(classify(pr({ comments }), "me", rules, null)).toEqual({ section: "waiting_on_me", reason: "unread_comments" });
    expect(classify(pr({ comments }), "me", rules, "2026-10-30T10:00:00Z")).toEqual({
      section: "waiting_on_me",
      reason: "unread_comments",
    });
  });

  it("goes back where it was once marked seen", () => {
    expect(classify(pr({ comments, reviewDecision: "APPROVED" }), "me", rules, "2026-10-30T11:30:00Z")).toEqual({
      section: "ready_to_merge",
    });
  });

  it("ranks a merge conflict above unread comments", () => {
    expect(classify(pr({ comments, mergeable: "CONFLICTING" }), "me", rules, null)).toEqual({
      section: "waiting_on_me",
      reason: "conflict",
    });
  });

  it("ignores my own comments", () => {
    expect(classify(pr({ comments: [comment("me", "2026-10-30T12:00:00Z")] }), "me", rules, null)).toEqual({
      section: "waiting_on_others",
    });
  });
});

describe("classify: mentions and re-review on someone else's PR", () => {
  const mention = comment("colleague2", "2026-10-30T11:00:00Z", "@me can you check this?");

  it("waits on me when an unread comment mentions me, even outside the team", () => {
    expect(classify(pr({ author: "stranger", comments: [mention] }), "me", rules, null)).toEqual({
      section: "waiting_on_me",
      reason: "mention",
    });
  });

  it("forgets a mention once the PR is marked seen", () => {
    expect(classify(pr({ author: "stranger", comments: [mention] }), "me", rules, "2026-10-30T11:30:00Z")).toBeNull();
  });

  it("does not wait on me for an unread comment that does not mention me", () => {
    const pullRequest = pr({ author: "colleague1", comments: [comment("colleague2", "2026-10-30T11:00:00Z")] });

    expect(classify(pullRequest, "me", rules, null)).toEqual({ section: "free_for_review" });
  });

  it("ranks a review request above a mention", () => {
    expect(classify(pr({ author: "colleague1", requestedReviewers: ["me"], comments: [mention] }), "me", rules, null)).toEqual({
      section: "waiting_on_me",
      reason: "review_requested",
    });
  });

  const reviewed = pr({
    author: "colleague1",
    reviews: [review("me", "CHANGES_REQUESTED")],
    commits: [{ oid: "a", committedAt: "2026-10-30T10:00:00Z" }],
  });

  it("waits on me for a re-review when commits arrive after my review", () => {
    expect(classify(reviewed, "me", rules, null)).toEqual({ section: "waiting_on_me", reason: "re_review" });
  });

  it("forgets the re-review once the PR is marked seen, until something new arrives", () => {
    expect(classify(reviewed, "me", rules, "2026-10-30T10:30:00Z")).toEqual({ section: "team" });
    const pushedAgain = { ...reviewed, commits: [...reviewed.commits, { oid: "b", committedAt: "2026-10-30T11:00:00Z" }] };
    expect(classify(pushedAgain, "me", rules, "2026-10-30T10:30:00Z")).toEqual({ section: "waiting_on_me", reason: "re_review" });
  });
});

describe("groupIntoSections: seen marks", () => {
  it("adds the unread comment count and the re-review details to every PR", () => {
    const sections = groupIntoSections(
      [
        pr({ number: 1, comments: [comment("colleague1", "2026-10-30T11:00:00Z"), comment("colleague2", "2026-10-30T12:00:00Z")] }),
        pr({
          number: 2,
          author: "colleague1",
          reviews: [review("me", "COMMENTED")],
          commits: [{ oid: "a", committedAt: "2026-10-30T10:00:00Z" }],
          comments: [comment("colleague1", "2026-10-30T10:30:00Z")],
        }),
        pr({ number: 3, author: "colleague1" }),
      ],
      "me",
      rules,
      (p) => (p.number === 1 ? "2026-10-30T11:30:00Z" : null),
    );

    expect(sections[0]?.pullRequests).toEqual([
      expect.objectContaining({ number: 1, reason: "unread_comments", unreadComments: 1 }),
      expect.objectContaining({ number: 2, reason: "re_review", unreadComments: 1, reReview: { newCommits: 1, replies: 1 } }),
    ]);
    expect(sections[1]?.pullRequests).toEqual([expect.objectContaining({ number: 3, unreadComments: 0 })]);
    expect(sections[1]?.pullRequests[0]).not.toHaveProperty("reReview");
  });
});
