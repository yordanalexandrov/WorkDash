import { describe, expect, it } from "vitest";
import { closedIssue, issue } from "../../test/fixtures.js";
import type { IssueBoardState } from "../src/api.js";
import { findIssue, issueDates } from "../src/issueDetail.js";

describe("issueDates", () => {
  const now = new Date("2026-10-31T12:00:00Z");

  it("says when an open issue was opened and last updated", () => {
    expect(issueDates(issue({ createdAt: "2026-10-29T10:00:00Z", updatedAt: "2026-10-31T09:00:00Z" }), now)).toBe("отворен преди 2д · обновен преди 3ч");
  });

  it("says when a closed one was closed, too", () => {
    expect(issueDates(issue({ createdAt: "2026-10-29T10:00:00Z", updatedAt: "2026-10-31T11:30:00Z", closedAt: "2026-10-31T11:30:00Z" }), now)).toBe(
      "отворен преди 2д · обновен преди <1ч · затворен преди <1ч",
    );
  });
});

describe("findIssue", () => {
  const state: IssueBoardState = {
    repo: "my-org/repo-a",
    fetchedAt: "2026-10-31T10:00:00Z",
    stages: ["in-progress"],
    issues: [
      { ...issue({ number: 1 }), stage: null },
      { ...issue({ number: 7 }), stage: "in-progress" },
    ],
    totalCount: 2,
    closed: [closedIssue({ number: 4, closedAs: "not_planned" })],
    polling: false,
    error: null,
  };

  it("finds an issue of the state by its repo and number, with its stage as the state has it now", () => {
    expect(findIssue(state, "my-org/repo-a#7")).toMatchObject({ number: 7, stage: "in-progress" });
  });

  it("finds an issue closed within the window too, as closed", () => {
    expect(findIssue(state, "my-org/repo-a#4")).toMatchObject({ number: 4, closedAs: "not_planned" });
  });

  it("finds an issue that closed while its sheet was open among the closed ones, not as gone", () => {
    const closedSince = { ...state, issues: state.issues.filter((open) => open.number !== 7), closed: [closedIssue({ number: 7 }), ...state.closed] };

    expect(findIssue(closedSince, "my-org/repo-a#7")).toMatchObject({ number: 7, closedAs: "completed" });
  });

  it("finds nothing for an issue no longer in the state, nor before the state has come", () => {
    expect(findIssue(state, "my-org/repo-a#9")).toBeUndefined();
    expect(findIssue(state, "my-org/repo-b#7")).toBeUndefined();
    expect(findIssue(null, "my-org/repo-a#7")).toBeUndefined();
  });
});
