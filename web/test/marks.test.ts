import { describe, expect, it } from "vitest";
import { pullRequest } from "../../test/fixtures.js";
import {
  askedReviewers,
  checkRank,
  checkRings,
  initials,
  mergeMark,
  mergeRank,
  reasonRank,
  reviewMarks,
  reviewRank,
  sectionShort,
  unreadCount,
  urgency,
} from "../src/marks.js";

const pr = pullRequest;

describe("mergeMark", () => {
  it("says whether the PR can be merged", () => {
    expect(mergeMark(pr({ mergeStateStatus: "CLEAN" }))).toEqual({ text: "⇢ merge", kind: "ok", title: "Може да се merge-не" });
    expect(mergeMark(pr({ mergeStateStatus: "BEHIND" }))?.kind).toBe("pending");
    expect(mergeMark(pr({ mergeStateStatus: "UNKNOWN" }))).toBeUndefined();
  });

  it("shows a conflict when GitHub already says CONFLICTING but has not computed DIRTY yet", () => {
    expect(mergeMark(pr({ mergeable: "CONFLICTING", mergeStateStatus: "BLOCKED" }))).toEqual({
      text: "⨯ конфликт",
      kind: "bad",
      title: "Има конфликт с base клона",
    });
  });

  it("does not repeat what the reason already says", () => {
    expect(mergeMark({ ...pr({ mergeStateStatus: "BEHIND" }), reason: "needs_rebase" })).toBeUndefined();
    expect(mergeMark({ ...pr({ mergeable: "CONFLICTING" }), reason: "conflict" })).toBeUndefined();
    expect(mergeMark({ ...pr({ mergeStateStatus: "BEHIND" }), reason: "ci_failed" })?.kind).toBe("pending");
  });
});

describe("askedReviewers", () => {
  it("lists the requested reviewers who have not reviewed yet, whatever the case of their login", () => {
    const reviews = [{ author: "Colleague1", state: "COMMENTED" as const, submittedAt: "2026-10-30T10:00:00Z" }];
    expect(askedReviewers(pr({ requestedReviewers: ["colleague1", "colleague2"], reviews }))).toEqual(["colleague2"]);
  });
});

describe("checkRings", () => {
  it("rings CI and Sonar by their state", () => {
    expect(checkRings(pr({ ci: "PENDING", sonar: "FAILURE" }))).toEqual([
      { label: "CI", state: "PENDING", kind: "pending" },
      { label: "Sonar", state: "FAILURE", kind: "bad" },
    ]);
  });

  it("leaves out a check with no state", () => {
    expect(checkRings(pr({ ci: null, sonar: "SUCCESS" }))).toEqual([{ label: "Sonar", state: "SUCCESS", kind: "ok" }]);
  });

  it("leaves out the ring the reason already names", () => {
    expect(checkRings({ ...pr({ ci: "FAILURE", sonar: "SUCCESS" }), reason: "ci_failed" }).map((ring) => ring.label)).toEqual(["Sonar"]);
    expect(checkRings({ ...pr({ ci: "SUCCESS", sonar: "ERROR" }), reason: "sonar_failed" }).map((ring) => ring.label)).toEqual(["CI"]);
  });
});

describe("initials", () => {
  it.each([
    ["a-b", "AB"],
    ["abc", "AB"],
    ["first_second.third", "FS"],
    ["x", "X"],
  ])("takes %s to %s", (login, expected) => {
    expect(initials(login)).toBe(expected);
  });
});

describe("reviewMarks", () => {
  it("marks each reviewer's latest review and skips dismissed ones", () => {
    const at = "2026-10-30T10:00:00Z";
    const reviews = [
      { author: "colleague1", state: "APPROVED" as const, submittedAt: at },
      { author: "colleague2", state: "CHANGES_REQUESTED" as const, submittedAt: at },
      { author: "colleague3", state: "COMMENTED" as const, submittedAt: at },
      { author: "colleague4", state: "DISMISSED" as const, submittedAt: at },
    ];
    expect(reviewMarks(pr({ reviews }))).toEqual([
      { login: "colleague1", kind: "ok", title: "colleague1 одобри" },
      { login: "colleague2", kind: "bad", title: "colleague2 иска промени" },
      { login: "colleague3", kind: "muted", title: "colleague3 коментира" },
    ]);
  });
});

describe("unreadCount", () => {
  it("counts the unread comments, unless the reason already says how many", () => {
    expect(unreadCount({ ...pr(), unreadComments: 2 })).toBe(2);
    expect(unreadCount({ ...pr(), reason: "unread_comments", unreadComments: 2 })).toBe(0);
    expect(unreadCount(pr())).toBe(0);
  });
});

describe("urgency", () => {
  it("pulses hard for failures and for what asks me to act, softly for the other reasons", () => {
    for (const reason of ["ci_failed", "sonar_failed", "review_requested", "changes_requested", "conflict", "mention"] as const) {
      expect(urgency(reason), reason).toBe("u2");
    }
    for (const reason of ["unread_comments", "needs_rebase", "re_review"] as const) expect(urgency(reason), reason).toBe("u1");
  });

  it("does not pulse a PR that does not wait on me", () => {
    expect(urgency(undefined)).toBeUndefined();
  });
});

describe("reasonRank", () => {
  it("ranks the reasons by how urgent they are, with no reason last", () => {
    const order = ["ci_failed", "sonar_failed", "changes_requested", "conflict", "unread_comments", "needs_rebase", "review_requested", "mention", "re_review"] as const;
    const ranks = order.map((reason) => reasonRank(reason));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(order.length);
    expect(reasonRank(undefined)).toBeGreaterThan(reasonRank("re_review"));
  });
});

describe("checkRank", () => {
  it("puts failed first, then running, then passed, then no check", () => {
    expect(checkRank("FAILURE")).toBe(checkRank("ERROR"));
    expect(checkRank("PENDING")).toBe(checkRank("EXPECTED"));
    expect(checkRank("FAILURE")).toBeLessThan(checkRank("PENDING"));
    expect(checkRank("PENDING")).toBeLessThan(checkRank("SUCCESS"));
    expect(checkRank("SUCCESS")).toBeLessThan(checkRank(null));
  });
});

describe("mergeRank", () => {
  const rank = (overrides: Parameters<typeof pr>[0]) => mergeRank(pr(overrides));

  it("goes conflict, behind, blocked, draft, unknown, unstable or hooks, clean", () => {
    const ranks = [
      rank({ mergeStateStatus: "DIRTY" }),
      rank({ mergeStateStatus: "BEHIND" }),
      rank({ mergeStateStatus: "BLOCKED" }),
      rank({ mergeStateStatus: "DRAFT" }),
      rank({ mergeStateStatus: "UNKNOWN" }),
      rank({ mergeStateStatus: "UNSTABLE" }),
      rank({ mergeStateStatus: "CLEAN" }),
    ];
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(rank({ mergeStateStatus: "HAS_HOOKS" })).toBe(rank({ mergeStateStatus: "UNSTABLE" }));
  });

  it("takes a conflict from `mergeable` before the state, and a draft before the state", () => {
    expect(rank({ mergeable: "CONFLICTING", mergeStateStatus: "CLEAN" })).toBe(rank({ mergeStateStatus: "DIRTY" }));
    expect(rank({ mergeable: "CONFLICTING", isDraft: true })).toBe(rank({ mergeStateStatus: "DIRTY" }));
    expect(rank({ isDraft: true, mergeStateStatus: "CLEAN" })).toBe(rank({ mergeStateStatus: "DRAFT" }));
  });
});

describe("reviewRank", () => {
  const review = (state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED") => ({ author: "colleague1", state, submittedAt: "2026-10-30T10:00:00Z" });

  it("counts an approval 10, changes requested -10 and a comment 1", () => {
    expect(reviewRank(pr())).toBe(0);
    expect(reviewRank(pr({ reviews: [review("APPROVED"), review("COMMENTED")] }))).toBe(11);
    expect(reviewRank(pr({ reviews: [review("CHANGES_REQUESTED"), review("APPROVED")] }))).toBe(0);
    expect(reviewRank(pr({ reviews: [review("CHANGES_REQUESTED")] }))).toBe(-10);
  });
});

describe("sectionShort", () => {
  it("names each section in a word", () => {
    expect(["waiting_on_me", "free_for_review", "ready_to_merge", "waiting_on_others", "team"].map((s) => sectionShort(s as never))).toEqual([
      "теб",
      "review",
      "merge",
      "други",
      "екип",
    ]);
  });
});
