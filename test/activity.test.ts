import { describe, expect, it } from "vitest";
import { mentions, reReviewActivity, unreadComments } from "../src/domain/activity.js";
import type { Comment, Commit, Review } from "../src/domain/types.js";
import { pullRequest } from "./fixtures.js";

function comment(id: string, author: string, createdAt: string, extra: Partial<Comment> = {}): Comment {
  return { id, author, createdAt, body: "", ...extra };
}

function commit(oid: string, committedAt: string): Commit {
  return { oid, committedAt };
}

function myReview(state: Review["state"], submittedAt = "2026-10-30T10:00:00Z"): Review {
  return { author: "me", state, submittedAt };
}

describe("unreadComments", () => {
  const comments = [
    comment("c1", "colleague1", "2026-10-30T09:00:00Z"),
    comment("c2", "me", "2026-10-30T11:00:00Z"),
    comment("c3", "colleague2", "2026-10-30T12:00:00Z", { thread: "t1" }),
  ];

  it("counts every comment by someone else when the PR was never marked seen", () => {
    expect(unreadComments(pullRequest({ comments }), "me", null).map((c) => c.id)).toEqual(["c1", "c3"]);
  });

  it("counts only comments by others created after the PR was marked seen", () => {
    expect(unreadComments(pullRequest({ comments }), "Me", "2026-10-30T10:00:00Z").map((c) => c.id)).toEqual(["c3"]);
  });

  it("treats a comment created in the same second as the seen mark as read", () => {
    const pr = pullRequest({ comments: [comment("c1", "colleague1", "2026-10-30T12:00:00Z")] });

    expect(unreadComments(pr, "me", "2026-10-30T12:00:00.000Z")).toEqual([]);
  });
});

describe("mentions", () => {
  it.each([
    ["@me please look", true],
    ["thanks @Me!", true],
    ["(cc @me)", true],
    ["@meow is someone else", false],
    ["mail me@example.com", false],
    ["no mention", false],
  ])("%s → %s", (body, expected) => {
    expect(mentions(body, "me")).toBe(expected);
  });
});

describe("reReviewActivity", () => {
  const otherPr = (overrides: Parameters<typeof pullRequest>[0]) => pullRequest({ author: "colleague1", ...overrides });

  it("is null when I have not reviewed the PR", () => {
    const pr = otherPr({ commits: [commit("a", "2026-10-30T11:00:00Z")] });

    expect(reReviewActivity(pr, "me", null)).toBeNull();
  });

  it("is null when my latest review is an approval", () => {
    const pr = otherPr({ reviews: [myReview("APPROVED")], commits: [commit("a", "2026-10-30T11:00:00Z")] });

    expect(reReviewActivity(pr, "me", null)).toBeNull();
  });

  it.each(["COMMENTED", "CHANGES_REQUESTED"] as const)("counts commits pushed after my %s review", (state) => {
    const pr = otherPr({
      reviews: [myReview(state)],
      commits: [commit("a", "2026-10-30T09:00:00Z"), commit("b", "2026-10-30T11:00:00Z"), commit("c", "2026-10-30T12:00:00Z")],
    });

    expect(reReviewActivity(pr, "me", null)).toEqual({ newCommits: 2, replies: 0 });
  });

  it("counts a commit made before my review but first seen after it, as it was pushed after it", () => {
    const pr = otherPr({
      reviews: [myReview("CHANGES_REQUESTED")],
      commits: [{ oid: "a", committedAt: "2026-10-30T09:00:00Z", firstSeenAt: "2026-10-30T11:00:00Z" }],
    });

    expect(reReviewActivity(pr, "me", null)).toEqual({ newCommits: 1, replies: 0 });
  });

  it("is null when nothing happened after my review", () => {
    const pr = otherPr({
      reviews: [myReview("CHANGES_REQUESTED")],
      commits: [commit("a", "2026-10-30T09:00:00Z")],
      comments: [comment("c1", "colleague2", "2026-10-30T11:00:00Z")],
    });

    expect(reReviewActivity(pr, "me", null)).toBeNull();
  });

  it("counts replies after my review: the author's comments, comments in my threads and mentions of me", () => {
    const pr = otherPr({
      reviews: [myReview("COMMENTED")],
      comments: [
        comment("mine", "me", "2026-10-30T10:00:00Z", { thread: "t1" }),
        comment("before", "colleague1", "2026-10-30T09:30:00Z"),
        comment("author", "colleague1", "2026-10-30T11:00:00Z"),
        comment("in-my-thread", "colleague2", "2026-10-30T11:00:00Z", { thread: "t1" }),
        comment("other-thread", "colleague2", "2026-10-30T11:00:00Z", { thread: "t2" }),
        comment("mention", "colleague2", "2026-10-30T11:00:00Z", { body: "@me what do you think?" }),
        comment("unrelated", "colleague2", "2026-10-30T11:00:00Z"),
        comment("me-again", "me", "2026-10-30T12:00:00Z"),
      ],
    });

    expect(reReviewActivity(pr, "me", null)).toEqual({ newCommits: 0, replies: 3 });
  });

  it("counts only what came after the PR was marked seen, once that is later than my review", () => {
    const pr = otherPr({
      reviews: [myReview("CHANGES_REQUESTED")],
      commits: [commit("a", "2026-10-30T11:00:00Z"), commit("b", "2026-10-30T13:00:00Z")],
      comments: [comment("c1", "colleague1", "2026-10-30T11:30:00Z")],
    });

    expect(reReviewActivity(pr, "me", "2026-10-30T12:00:00Z")).toEqual({ newCommits: 1, replies: 0 });
    expect(reReviewActivity(pr, "me", "2026-10-30T14:00:00Z")).toBeNull();
    expect(reReviewActivity(pr, "me", "2026-10-29T00:00:00Z")).toEqual({ newCommits: 2, replies: 1 });
  });
});
