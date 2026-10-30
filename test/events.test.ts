import { describe, expect, it } from "vitest";
import type { ClassifyRules } from "../src/domain/classify.js";
import { diffSnapshots, type PreviousSnapshot } from "../src/domain/events.js";
import type { PullRequest } from "../src/domain/types.js";
import { pullRequest } from "./fixtures.js";

const rules: ClassifyRules = { team: ["colleague1"], requiredApprovals: 1 };

const previous = (pullRequests: PullRequest[], fetchedAt = "2026-10-30T10:00:00.000Z"): PreviousSnapshot => ({ viewer: "me", pullRequests, fetchedAt });
const current = (pullRequests: PullRequest[]) => ({ viewer: "me", pullRequests });

/** Someone else's PR. */
const theirs = (overrides: Partial<PullRequest> = {}) => pullRequest({ author: "colleague1", ...overrides });

describe("diffSnapshots", () => {
  it("gives no events on the first poll, which only records the baseline", () => {
    expect(diffSnapshots(null, current([theirs({ requestedReviewers: ["me"] })]), rules)).toEqual([]);
  });

  it("gives no events when nothing changed", () => {
    const pr = theirs({ requestedReviewers: ["me"] });
    expect(diffSnapshots(previous([pr]), current([pr]), rules)).toEqual([]);
  });

  it("reports a review requested from me", () => {
    const events = diffSnapshots(previous([theirs()]), current([theirs({ requestedReviewers: ["Me"] })]), rules);

    expect(events).toEqual([
      {
        id: "review_requested:my-org/repo-a#1:none",
        type: "review_requested",
        repo: "my-org/repo-a",
        number: 1,
        title: "PR 1",
        url: "https://github.com/my-org/repo-a/pull/1",
        actor: "colleague1",
      },
    ]);
  });

  it("asks again for a review re-requested after my review, but not twice for the same request", () => {
    const reviewed = theirs({ reviews: [{ author: "me", state: "COMMENTED", submittedAt: "2026-10-30T09:00:00Z" }] });
    const rerequested = { ...reviewed, requestedReviewers: ["me"] };

    expect(diffSnapshots(previous([reviewed]), current([rerequested]), rules).map((e) => e.id)).toEqual([
      "review_requested:my-org/repo-a#1:2026-10-30T09:00:00Z",
    ]);
  });

  const comment = (id: string, author: string, body = "looks fine") => ({ id, author, body, createdAt: "2026-10-30T10:30:00Z" });

  it("reports a new comment by someone else on my PR", () => {
    const old = pullRequest({ comments: [comment("c1", "colleague1")] });
    const now = pullRequest({ comments: [comment("c1", "colleague1"), comment("c2", "me"), comment("c3", "colleague2")] });

    expect(diffSnapshots(previous([old]), current([now]), rules)).toEqual([
      expect.objectContaining({ id: "new_comment_on_my_pr:my-org/repo-a#1:c3", type: "new_comment_on_my_pr", actor: "colleague2" }),
    ]);
  });

  it("reports a new comment that mentions me as a mention only, on anyone's PR", () => {
    const mine = pullRequest({ number: 1 });
    const other = theirs({ number: 2, author: "stranger" });
    const now = [
      { ...mine, comments: [comment("c1", "colleague1", "@me what do you think?")] },
      { ...other, comments: [comment("c2", "colleague2", "cc @Me"), comment("c3", "colleague2", "cc @mehmet")] },
    ];

    expect(diffSnapshots(previous([mine, other]), current(now), rules).map((e) => [e.id, e.actor])).toEqual([
      ["mention:my-org/repo-a#1:c1", "colleague1"],
      ["mention:my-org/repo-a#2:c2", "colleague2"],
    ]);
  });

  it("reports a new or changed review by someone else on my PR", () => {
    const old = pullRequest({ reviews: [{ author: "colleague1", state: "COMMENTED", submittedAt: "2026-10-30T09:00:00Z" }] });
    const now = pullRequest({
      reviews: [
        { author: "colleague1", state: "APPROVED", submittedAt: "2026-10-30T10:30:00Z" },
        { author: "colleague2", state: "CHANGES_REQUESTED", submittedAt: "2026-10-30T10:31:00Z" },
        { author: "colleague3", state: "DISMISSED", submittedAt: "2026-10-30T10:32:00Z" },
      ],
    });

    expect(diffSnapshots(previous([old]), current([now]), rules)).toEqual([
      expect.objectContaining({ id: "review_on_my_pr:my-org/repo-a#1:colleague1:2026-10-30T10:30:00Z", actor: "colleague1", review: "APPROVED" }),
      expect.objectContaining({ id: "review_on_my_pr:my-org/repo-a#1:colleague2:2026-10-30T10:31:00Z", actor: "colleague2", review: "CHANGES_REQUESTED" }),
    ]);
  });

  it("reports CI on my PR turning to FAILURE or ERROR, once per head commit", () => {
    const commits = [{ oid: "abc", committedAt: "2026-10-30T09:00:00Z" }];
    const pending = pullRequest({ ci: "PENDING", commits });

    expect(diffSnapshots(previous([pending]), current([{ ...pending, ci: "FAILURE" }]), rules)).toEqual([
      expect.objectContaining({ id: "ci_failed_on_my_pr:my-org/repo-a#1:abc", type: "ci_failed_on_my_pr", actor: "me" }),
    ]);
    expect(diffSnapshots(previous([pending]), current([{ ...pending, ci: "ERROR" }]), rules).map((e) => e.type)).toEqual(["ci_failed_on_my_pr"]);
    expect(diffSnapshots(previous([{ ...pending, ci: "FAILURE" }]), current([{ ...pending, ci: "ERROR" }]), rules)).toEqual([]);
    expect(diffSnapshots(previous([theirs({ ci: "PENDING" })]), current([theirs({ ci: "FAILURE" })]), rules)).toEqual([]);
  });

  it("reports my PR entering ready to merge", () => {
    const commits = [{ oid: "abc", committedAt: "2026-10-30T09:00:00Z" }];
    const waiting = pullRequest({ commits, reviewDecision: "REVIEW_REQUIRED" });
    const ready = { ...waiting, reviewDecision: "APPROVED" as const };

    expect(diffSnapshots(previous([waiting]), current([ready]), rules)).toEqual([
      expect.objectContaining({ id: "my_pr_ready_to_merge:my-org/repo-a#1:abc", type: "my_pr_ready_to_merge" }),
    ]);
    expect(diffSnapshots(previous([ready]), current([ready]), rules)).toEqual([]);
  });

  describe("re-review", () => {
    const myReview = { author: "me", state: "CHANGES_REQUESTED" as const, submittedAt: "2026-10-30T09:00:00Z" };
    const reviewed = theirs({ reviews: [myReview], comments: [{ ...comment("c0", "me"), thread: "t1", createdAt: "2026-10-30T08:59:00Z" }] });

    it("reports new commits after my review", () => {
      const now = { ...reviewed, commits: [{ oid: "def", committedAt: "2026-10-30T10:30:00Z" }] };

      expect(diffSnapshots(previous([reviewed]), current([now]), rules)).toEqual([
        expect.objectContaining({ id: "re_review_needed:my-org/repo-a#1:def", type: "re_review_needed", actor: "colleague1" }),
      ]);
    });

    it("reports a commit made before my review but pushed after it", () => {
      const now = { ...reviewed, commits: [{ oid: "def", committedAt: "2026-10-30T08:00:00Z", firstSeenAt: "2026-10-30T10:00:00Z" }] };

      expect(diffSnapshots(previous([reviewed]), current([now]), rules).map((e) => e.id)).toEqual(["re_review_needed:my-org/repo-a#1:def"]);
    });

    it("reports a reply to me after my review, but not other people's chatter", () => {
      const now = {
        ...reviewed,
        comments: [...reviewed.comments, comment("c1", "colleague2"), { ...comment("c2", "colleague2"), thread: "t1" }],
      };

      expect(diffSnapshots(previous([reviewed]), current([now]), rules).map((e) => [e.id, e.actor])).toEqual([
        ["re_review_needed:my-org/repo-a#1:c2", "colleague2"],
      ]);
    });

    it("gives nothing when my review approved", () => {
      const approved = { ...reviewed, reviews: [{ ...myReview, state: "APPROVED" as const }] };
      const now = { ...approved, commits: [{ oid: "def", committedAt: "2026-10-30T10:30:00Z" }] };

      expect(diffSnapshots(previous([approved]), current([now]), rules)).toEqual([]);
    });
  });

  describe("team PR opened", () => {
    it("reports a new PR by someone in the team", () => {
      const opened = theirs({ number: 7, createdAt: "2026-10-30T10:00:30Z" });

      expect(diffSnapshots(previous([]), current([opened]), rules)).toEqual([
        expect.objectContaining({ id: "team_pr_opened:my-org/repo-a#7", type: "team_pr_opened", actor: "colleague1" }),
      ]);
    });

    it("reports a team PR taken out of draft", () => {
      const draft = theirs({ isDraft: true });

      expect(diffSnapshots(previous([draft]), current([{ ...draft, isDraft: false }]), rules).map((e) => e.type)).toEqual(["team_pr_opened"]);
    });

    it("ignores drafts, people outside the team and my own PRs", () => {
      const at = { createdAt: "2026-10-30T10:00:30Z" };
      const now = [theirs({ number: 2, isDraft: true, ...at }), theirs({ number: 3, author: "stranger", ...at }), pullRequest({ number: 4, ...at })];

      expect(diffSnapshots(previous([]), current(now), { ...rules, team: ["colleague1", "me"] })).toEqual([]);
    });

    it("treats a PR that was open long before the previous poll as baseline, e.g. from a newly added repo", () => {
      const old = theirs({ number: 9, repo: "my-org/repo-b", createdAt: "2026-10-01T10:00:00Z", requestedReviewers: ["me"] });

      expect(diffSnapshots(previous([]), current([old]), rules)).toEqual([]);
    });
  });

  it("reports a review request and comments on a PR opened since the previous poll", () => {
    const opened = theirs({ number: 8, author: "stranger", createdAt: "2026-10-30T10:00:30Z", requestedReviewers: ["me"], comments: [comment("c1", "stranger", "@me please")] });

    expect(diffSnapshots(previous([]), current([opened]), rules).map((e) => e.type)).toEqual(["review_requested", "mention"]);
  });

  it("gives no events when the token now belongs to someone else", () => {
    const now = current([theirs({ requestedReviewers: ["someone"] })]);
    expect(diffSnapshots({ ...previous([theirs()]), viewer: "other" }, { ...now, viewer: "someone" }, rules)).toEqual([]);
  });
});

