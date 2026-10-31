import { describe, expect, it } from "vitest";
import { pullRequest } from "../../test/fixtures.js";
import { askedReviewers, checkRings, initials, mergeMark, reviewMarks, unreadCount } from "../src/marks.js";

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
