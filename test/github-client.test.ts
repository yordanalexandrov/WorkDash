import { describe, expect, it } from "vitest";
import { fetchSnapshot } from "../src/github/client.js";
import { pullRequest } from "./fixtures.js";

type Call = { url: string; headers: Record<string, string>; query: string; variables: Record<string, string> };

/** A stand-in for api.github.com that answers each aliased repository from `prsByRepo`. */
function fakeGitHub(prsByRepo: Record<string, unknown[]>, options: { truncated?: string[] } = {}) {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body));
    calls.push({ url: String(url), headers: init?.headers as Record<string, string>, query, variables });

    const data: Record<string, unknown> = { viewer: { login: "me" } };
    for (const [, alias, index] of (query as string).matchAll(/\b(r(\d+)): repository/g)) {
      const repo = `${variables[`owner${index}`]}/${variables[`name${index}`]}`;
      data[alias!] = {
        nameWithOwner: repo,
        pullRequests: {
          nodes: prsByRepo[repo] ?? [],
          pageInfo: { hasNextPage: options.truncated?.includes(repo) ?? false },
        },
      };
    }
    return Response.json({ data });
  };
  return { fetch, calls };
}

function prNode(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/x/y/pull/${number}`,
    isDraft: false,
    createdAt: "2026-10-29T10:00:00Z",
    updatedAt: "2026-10-30T10:00:00Z",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    author: { login: "colleague1" },
    reviewRequests: { nodes: [] },
    latestReviews: { nodes: [] },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
    ...overrides,
  };
}

describe("fetchSnapshot", () => {
  it("fetches the viewer and every repo's open PRs in a single GraphQL request", async () => {
    const github = fakeGitHub({
      "my-org/repo-a": [prNode(1)],
      "my-org/repo-b": [prNode(7, { title: "Fix login", author: { login: "colleague2" } })],
    });

    const snapshot = await fetchSnapshot({ repos: ["my-org/repo-a", "my-org/repo-b"], token: "t0ken", fetch: github.fetch });

    expect(github.calls).toHaveLength(1);
    expect(github.calls[0]?.url).toBe("https://api.github.com/graphql");
    expect(github.calls[0]?.headers.Authorization).toBe("Bearer t0ken");
    expect(snapshot.viewer).toBe("me");
    expect(snapshot.pullRequests).toEqual([
      pullRequest({ url: "https://github.com/x/y/pull/1", author: "colleague1" }),
      pullRequest({
        repo: "my-org/repo-b",
        number: 7,
        title: "Fix login",
        url: "https://github.com/x/y/pull/7",
        author: "colleague2",
      }),
    ]);
  });

  it("maps status fields, requested reviewers and the latest reviews", async () => {
    const github = fakeGitHub({
      "my-org/repo-a": [
        prNode(1, {
          isDraft: true,
          mergeable: "CONFLICTING",
          mergeStateStatus: "DIRTY",
          reviewDecision: "CHANGES_REQUESTED",
          reviewRequests: {
            nodes: [{ requestedReviewer: { login: "me" } }, { requestedReviewer: {} }, { requestedReviewer: null }],
          },
          latestReviews: {
            nodes: [
              { author: { login: "colleague2" }, state: "CHANGES_REQUESTED", submittedAt: "2026-10-30T09:00:00Z" },
              { author: { login: "me" }, state: "PENDING", submittedAt: null },
              { author: null, state: "APPROVED", submittedAt: "2026-10-30T08:00:00Z" },
            ],
          },
          commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }] },
        }),
      ],
    });

    const [pr] = (await fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch: github.fetch })).pullRequests;

    expect(pr).toMatchObject({
      isDraft: true,
      mergeable: "CONFLICTING",
      mergeStateStatus: "DIRTY",
      reviewDecision: "CHANGES_REQUESTED",
      requestedReviewers: ["me"],
      reviews: [
        { author: "colleague2", state: "CHANGES_REQUESTED", submittedAt: "2026-10-30T09:00:00Z" },
        { author: "ghost", state: "APPROVED", submittedAt: "2026-10-30T08:00:00Z" },
      ],
      ci: "FAILURE",
    });
  });

  it("has no CI state when the head commit has no checks", async () => {
    const github = fakeGitHub({
      "my-org/repo-a": [prNode(1, { commits: { nodes: [{ commit: { statusCheckRollup: null } }] } })],
    });

    const snapshot = await fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch: github.fetch });

    expect(snapshot.pullRequests[0]?.ci).toBeNull();
  });

  it("shows a deleted account's PR as authored by ghost", async () => {
    const github = fakeGitHub({ "my-org/repo-a": [prNode(1, { author: null })] });

    const snapshot = await fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch: github.fetch });

    expect(snapshot.pullRequests[0]?.author).toBe("ghost");
  });

  it("fails with GitHub's message when the token is rejected", async () => {
    const fetch = async () => Response.json({ message: "Bad credentials" }, { status: 401 });

    await expect(fetchSnapshot({ repos: ["my-org/repo-a"], token: "bad", fetch })).rejects.toThrow(/401.*Bad credentials/);
  });

  it("keeps the other repos and reports the one GitHub cannot resolve", async () => {
    const fetch = async () =>
      Response.json({
        data: {
          viewer: { login: "me" },
          r0: null,
          r1: { nameWithOwner: "my-org/repo-a", pullRequests: { nodes: [prNode(1)], pageInfo: { hasNextPage: false } } },
        },
        errors: [{ message: "Could not resolve to a Repository with the name 'my-org/nope'." }],
      });

    const snapshot = await fetchSnapshot({ repos: ["my-org/nope", "my-org/repo-a"], token: "t", fetch });

    expect(snapshot.pullRequests.map((pr) => `${pr.repo}#${pr.number}`)).toEqual(["my-org/repo-a#1"]);
    expect(snapshot.problems).toEqual(["Could not resolve to a Repository with the name 'my-org/nope'."]);
  });

  it("reports a repo whose open PRs do not fit in one page", async () => {
    const github = fakeGitHub({ "my-org/repo-a": [prNode(1)] }, { truncated: ["my-org/repo-a"] });

    const snapshot = await fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch: github.fetch });

    expect(snapshot.problems).toEqual(["my-org/repo-a has more than 100 open PRs; showing the 100 most recently updated"]);
  });

  it("reports no problems when every repo came back whole", async () => {
    const github = fakeGitHub({ "my-org/repo-a": [prNode(1)] });

    const snapshot = await fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch: github.fetch });

    expect(snapshot.problems).toEqual([]);
  });

  it("fails when GitHub returns errors and no data", async () => {
    const fetch = async () => Response.json({ errors: [{ message: "Something went wrong" }] });

    await expect(fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch })).rejects.toThrow(/Something went wrong/);
  });
});
