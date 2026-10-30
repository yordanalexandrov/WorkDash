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

/** The head commit's checks, as GitHub's statusCheckRollup lists them. */
function checks(...contexts: unknown[]) {
  return { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: contexts } } } }] };
}

function status(context: string, state: string) {
  return { __typename: "StatusContext", context, state };
}

function checkRun(name: string, status: string, conclusion: string | null, app = "github-actions") {
  return { __typename: "CheckRun", name, status, conclusion, checkSuite: { app: { slug: app } } };
}

function prNode(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `PR ${number}`,
    headRefName: `pr-${number}`,
    body: "",
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
    commits: checks(status("ci/build", "SUCCESS")),
    comments: { nodes: [] },
    reviewThreads: { nodes: [] },
    history: { nodes: [] },
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
        headRefName: "pr-7",
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
          commits: checks(status("ci/build", "FAILURE")),
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

  it("merges general and review-thread comments by people, oldest first, and lists the branch's commits", async () => {
    const user = (login: string) => ({ __typename: "User", login });
    const github = fakeGitHub({
      "my-org/repo-a": [
        prNode(1, {
          comments: {
            nodes: [
              { id: "c1", author: user("colleague1"), createdAt: "2026-10-30T09:00:00Z", body: "first" },
              { id: "c2", author: { __typename: "Bot", login: "sonarcloud" }, createdAt: "2026-10-30T09:30:00Z", body: "gate" },
              { id: "c3", author: null, createdAt: "2026-10-30T11:00:00Z", body: "gone" },
            ],
          },
          reviewThreads: {
            nodes: [
              {
                id: "t1",
                comments: {
                  nodes: [
                    { id: "r1", author: user("me"), createdAt: "2026-10-30T08:00:00Z", body: "nit" },
                    { id: "r2", author: user("colleague1"), createdAt: "2026-10-30T10:00:00Z", body: "done" },
                  ],
                },
              },
            ],
          },
          history: {
            nodes: [
              { commit: { oid: "aaa", committedDate: "2026-10-30T07:00:00Z" } },
              { commit: { oid: "bbb", committedDate: "2026-10-30T09:45:00Z" } },
            ],
          },
        }),
      ],
    });

    const [pr] = (await fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch: github.fetch })).pullRequests;

    expect(pr?.comments).toEqual([
      { id: "r1", author: "me", createdAt: "2026-10-30T08:00:00Z", body: "nit", thread: "t1" },
      { id: "c1", author: "colleague1", createdAt: "2026-10-30T09:00:00Z", body: "first" },
      { id: "r2", author: "colleague1", createdAt: "2026-10-30T10:00:00Z", body: "done", thread: "t1" },
      { id: "c3", author: "ghost", createdAt: "2026-10-30T11:00:00Z", body: "gone" },
    ]);
    expect(pr?.commits).toEqual([
      { oid: "aaa", committedAt: "2026-10-30T07:00:00Z" },
      { oid: "bbb", committedAt: "2026-10-30T09:45:00Z" },
    ]);
  });

  it("keeps the branch name and description, where Jira keys are looked for", async () => {
    const github = fakeGitHub({
      "my-org/repo-a": [prNode(1, { headRefName: "feature/ABC-1-login", body: "Fixes ABC-1" })],
    });

    const snapshot = await fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch: github.fetch });

    expect(snapshot.pullRequests[0]).toMatchObject({ headRefName: "feature/ABC-1-login", body: "Fixes ABC-1" });
  });

  it("has no CI or Sonar state when the head commit has no checks", async () => {
    const github = fakeGitHub({
      "my-org/repo-a": [prNode(1, { commits: { nodes: [{ commit: { statusCheckRollup: null } }] } })],
    });

    const snapshot = await fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch: github.fetch });

    expect(snapshot.pullRequests[0]).toMatchObject({ ci: null, sonar: null });
  });

  it.each([
    ["every check passes", [status("ci/build", "SUCCESS"), checkRun("test", "COMPLETED", "SKIPPED")], "SUCCESS"],
    ["a status fails", [status("ci/build", "SUCCESS"), status("ci/lint", "FAILURE")], "FAILURE"],
    ["a status errors", [status("ci/build", "ERROR"), checkRun("test", "IN_PROGRESS", null)], "ERROR"],
    ["a check run fails", [checkRun("test", "COMPLETED", "TIMED_OUT")], "FAILURE"],
    ["a check run is still running", [checkRun("test", "COMPLETED", "SUCCESS"), checkRun("e2e", "QUEUED", null)], "PENDING"],
  ])("rolls the non-Sonar checks up into one CI state when %s", async (_, contexts, ci) => {
    const github = fakeGitHub({ "my-org/repo-a": [prNode(1, { commits: checks(...contexts) })] });

    const [pr] = (await fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch: github.fetch })).pullRequests;

    expect(pr?.ci).toBe(ci);
  });

  it("reports Sonar apart from CI, so a failed quality gate does not read as a broken build", async () => {
    const github = fakeGitHub({
      "my-org/repo-a": [
        prNode(1, {
          commits: checks(
            status("ci/build", "SUCCESS"),
            checkRun("SonarCloud Code Analysis", "COMPLETED", "FAILURE", "sonarqubecloud"),
            checkRun("SonarCloud", "COMPLETED", "SUCCESS", "github-advanced-security"),
          ),
        }),
        prNode(2, { commits: checks(status("ci/build", "SUCCESS")) }),
      ],
    });

    const [withSonar, withoutSonar] = (await fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch: github.fetch })).pullRequests;

    expect(withSonar).toMatchObject({ ci: "SUCCESS", sonar: "FAILURE" });
    expect(withoutSonar).toMatchObject({ ci: "SUCCESS", sonar: null });
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

    expect(snapshot.problems).toEqual(["my-org/repo-a has more than 50 open PRs; showing the 50 most recently updated"]);
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
