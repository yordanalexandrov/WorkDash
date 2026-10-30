import { describe, expect, it } from "vitest";
import { fetchClosedPullRequests, fetchSnapshot } from "../src/github/client.js";
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
    expect(snapshot.unreadRepos).toEqual(["my-org/nope"]);
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
    expect(snapshot.unreadRepos).toEqual([]);
  });

  it("fails when GitHub returns errors and no data", async () => {
    const fetch = async () => Response.json({ errors: [{ message: "Something went wrong" }] });

    await expect(fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch })).rejects.toThrow(/Something went wrong/);
  });
});

/** A stand-in for api.github.com that answers each aliased pullRequest(number: N) lookup from `prs`. */
function fakeGitHubByNumber(prs: Record<string, unknown>) {
  const calls: { query: string; variables: Record<string, string> }[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body));
    calls.push({ query, variables });
    const data: Record<string, Record<string, unknown>> = {};
    // Each repository alias owns the pullRequest aliases up to the next repository alias.
    const repoMatches = [...(query as string).matchAll(/\b(r(\d+)): repository\(/g)];
    for (const [i, match] of repoMatches.entries()) {
      const [, alias, index] = match;
      const body = (query as string).slice(match.index, repoMatches[i + 1]?.index);
      const repo = `${variables[`owner${index}`]}/${variables[`name${index}`]}`;
      const repository: Record<string, unknown> = {};
      for (const [, prAlias, number] of body.matchAll(/(p\d+): pullRequest\(number: (\d+)\)/g)) {
        repository[prAlias!] = prs[`${repo}#${number}`] ?? null;
      }
      data[alias!] = repository;
    }
    return Response.json({ data });
  };
  return { fetch, calls };
}

function closedNode(number: number, state: string, closedAt: string | null, repo = "my-org/repo-a") {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/${repo}/pull/${number}`,
    author: { login: "colleague1" },
    state,
    closedAt,
  };
}

function closed(repo: string, number: number, state: string, closedAt: string) {
  return { repo, number, title: `PR ${number}`, url: `https://github.com/${repo}/pull/${number}`, author: "colleague1", state, closedAt };
}

describe("fetchClosedPullRequests", () => {
  it("looks up every vanished PR by number in a single request and reports how it ended", async () => {
    const github = fakeGitHubByNumber({
      "my-org/repo-a#1": closedNode(1, "MERGED", "2026-10-30T11:00:00Z"),
      "my-org/repo-a#2": closedNode(2, "CLOSED", "2026-10-30T11:30:00Z"),
      "my-org/repo-b#5": closedNode(5, "MERGED", "2026-10-30T09:00:00Z", "my-org/repo-b"),
    });

    const result = await fetchClosedPullRequests({
      pullRequests: [
        { repo: "my-org/repo-a", number: 1 },
        { repo: "my-org/repo-b", number: 5 },
        { repo: "my-org/repo-a", number: 2 },
      ],
      token: "t",
      fetch: github.fetch,
    });

    expect(github.calls).toHaveLength(1);
    expect(result.problems).toEqual([]);
    expect(result.closed).toEqual([
      closed("my-org/repo-a", 1, "MERGED", "2026-10-30T11:00:00Z"),
      closed("my-org/repo-a", 2, "CLOSED", "2026-10-30T11:30:00Z"),
      closed("my-org/repo-b", 5, "MERGED", "2026-10-30T09:00:00Z"),
    ]);
  });

  it("leaves out a PR that is still open, such as one pushed off a full page", async () => {
    const github = fakeGitHubByNumber({ "my-org/repo-a#1": closedNode(1, "OPEN", null) });

    const result = await fetchClosedPullRequests({ pullRequests: [{ repo: "my-org/repo-a", number: 1 }], token: "t", fetch: github.fetch });

    expect(result.closed).toEqual([]);
  });

  it("makes no request when nothing vanished", async () => {
    const github = fakeGitHubByNumber({});

    const result = await fetchClosedPullRequests({ pullRequests: [], token: "t", fetch: github.fetch });

    expect(github.calls).toHaveLength(0);
    expect(result).toEqual({ closed: [], problems: [] });
  });

  it("reports the PRs GitHub cannot resolve and keeps the rest", async () => {
    const fetch = async () =>
      Response.json({
        data: { r0: { p0: null, p1: closedNode(2, "MERGED", "2026-10-30T11:00:00Z") } },
        errors: [{ message: "Could not resolve to a PullRequest with the number of 1." }],
      });

    const result = await fetchClosedPullRequests({
      pullRequests: [
        { repo: "my-org/repo-a", number: 1 },
        { repo: "my-org/repo-a", number: 2 },
      ],
      token: "t",
      fetch,
    });

    expect(result.closed.map((pr) => pr.number)).toEqual([2]);
    expect(result.problems).toEqual(["Could not resolve to a PullRequest with the number of 1."]);
  });
});
