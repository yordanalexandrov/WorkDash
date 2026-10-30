import { describe, expect, it } from "vitest";
import { pullRequest } from "../../test/fixtures.js";
import { groupByRepo } from "../src/group.js";

const a1 = pullRequest({ repo: "my-org/repo-a", number: 1 });
const a2 = pullRequest({ repo: "my-org/repo-a", number: 2 });
const b1 = pullRequest({ repo: "my-org/repo-b", number: 1 });
const c1 = pullRequest({ repo: "my-org/repo-c", number: 1 });

describe("groupByRepo", () => {
  it("gives each repo one card holding its PRs by section, most urgent repo first", () => {
    const cards = groupByRepo([
      { section: "waiting_on_me", pullRequests: [b1] },
      { section: "free_for_review", pullRequests: [a1] },
      { section: "ready_to_merge", pullRequests: [] },
      { section: "waiting_on_others", pullRequests: [] },
      { section: "team", pullRequests: [a2, b1] },
    ]);

    expect(cards).toEqual([
      {
        repo: "my-org/repo-b",
        sections: [
          { section: "waiting_on_me", pullRequests: [b1] },
          { section: "team", pullRequests: [b1] },
        ],
      },
      {
        repo: "my-org/repo-a",
        sections: [
          { section: "free_for_review", pullRequests: [a1] },
          { section: "team", pullRequests: [a2] },
        ],
      },
    ]);
  });

  it("orders repos equally urgent by name", () => {
    const cards = groupByRepo([{ section: "team", pullRequests: [c1, b1, a1] }]);

    expect(cards.map((card) => card.repo)).toEqual(["my-org/repo-a", "my-org/repo-b", "my-org/repo-c"]);
  });

  it("has no cards when no section holds a PR", () => {
    expect(groupByRepo([{ section: "team", pullRequests: [] }])).toEqual([]);
  });
});
