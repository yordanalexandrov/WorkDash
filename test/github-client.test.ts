import { describe, expect, it } from "vitest";
import { fetchClosedPullRequests, fetchSnapshot } from "../src/github/client.js";
import { pullRequest } from "./fixtures.js";

type Call = { url: string; headers: Record<string, string>; query: string; variables: Record<string, string> };

/**
 * Answers a details query (`rI: repository { pJ: pullRequest(number: N) }`) from the PR nodes
 * in `prsByRepo`, looked up by number; a number with no node comes back null.
 */
function answerDetails(query: string, variables: Record<string, string>, prsByRepo: Record<string, unknown[]>) {
  const data: Record<string, Record<string, unknown>> = {};
  let alias = "";
  let repo = "";
  for (const line of query.split("\n")) {
    const repository = line.match(/\b(r(\d+)): repository/);
    if (repository) {
      alias = repository[1]!;
      repo = `${variables[`owner${repository[2]}`]}/${variables[`name${repository[2]}`]}`;
      data[alias] = {};
    }
    const lookup = line.match(/\b(p\d+): pullRequest\(number: (\d+)\)/);
    if (lookup) {
      const node = (prsByRepo[repo] ?? []).find((candidate) => (candidate as { number: number }).number === Number(lookup[2]));
      data[alias]![lookup[1]!] = node ?? null;
    }
  }
  return Response.json({ data });
}

/** A stand-in for api.github.com that answers each aliased repository from `prsByRepo`. */
function fakeGitHub(prsByRepo: Record<string, unknown[]>, options: { truncated?: string[]; issuesOff?: string[] } = {}) {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body));
    calls.push({ url: String(url), headers: init?.headers as Record<string, string>, query, variables });
    if ((query as string).startsWith("query PullRequestDetails")) return answerDetails(query, variables, prsByRepo);

    const data: Record<string, unknown> = { viewer: { login: "me" } };
    for (const [, alias, index] of (query as string).matchAll(/\b(r(\d+)): repository/g)) {
      const repo = `${variables[`owner${index}`]}/${variables[`name${index}`]}`;
      data[alias!] = {
        nameWithOwner: repo,
        hasIssuesEnabled: !options.issuesOff?.includes(repo),
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
  it("lists every repo's open PRs in one request, then fetches their comments and commits in one more", async () => {
    const github = fakeGitHub({
      "my-org/repo-a": [prNode(1)],
      "my-org/repo-b": [prNode(7, { title: "Fix login", author: { login: "colleague2" } })],
    });

    const snapshot = await fetchSnapshot({ repos: ["my-org/repo-a", "my-org/repo-b"], token: "t0ken", fetch: github.fetch });

    expect(github.calls.map((call) => call.query.split("(")[0])).toEqual(["query Snapshot", "query PullRequestDetails"]);
    expect(github.calls[0]?.query).not.toMatch(/reviewThreads|history/);
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

  describe("comments and commits of PRs seen before", () => {
    const comment = (id: string) => ({ id, author: { __typename: "User", login: "colleague1" }, createdAt: "2026-10-30T09:00:00Z", body: id });
    const stored = (number: number, updatedAt: string) =>
      pullRequest({
        number,
        updatedAt,
        comments: [{ id: `old-${number}`, author: "colleague1", createdAt: "2026-10-30T08:00:00Z", body: "old" }],
        commits: [{ oid: `old-${number}`, committedAt: "2026-10-30T08:00:00Z" }],
      });

    it("reuses them for a PR whose updatedAt has not changed, and refetches only the changed and new PRs", async () => {
      const github = fakeGitHub({
        "my-org/repo-a": [
          prNode(1, { updatedAt: "2026-10-30T10:00:00Z", comments: { nodes: [comment("new-1")] } }),
          prNode(2, { updatedAt: "2026-10-30T11:00:00Z", comments: { nodes: [comment("new-2")] } }),
          prNode(3, { comments: { nodes: [comment("new-3")] } }),
        ],
      });
      const previous = [stored(1, "2026-10-30T10:00:00Z"), stored(2, "2026-10-30T10:00:00Z")];

      const snapshot = await fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch: github.fetch, previous });

      expect(snapshot.pullRequests.map((pr) => [pr.number, pr.comments.map((c) => c.id), pr.commits.map((c) => c.oid)])).toEqual([
        [1, ["old-1"], ["old-1"]],
        [2, ["new-2"], []],
        [3, ["new-3"], []],
      ]);
      expect(github.calls[1]?.query.match(/pullRequest\(number: \d+\)/g)).toEqual(["pullRequest(number: 2)", "pullRequest(number: 3)"]);
    });

    it("dates a commit by when a poll first saw it, so one made before a review but pushed after it counts as new", async () => {
      const history = (...oids: string[]) => ({ history: { nodes: oids.map((oid) => ({ commit: { oid, committedDate: "2026-10-30T07:00:00Z" } })) } });
      const github = fakeGitHub({
        "my-org/repo-a": [
          prNode(1, { updatedAt: "2026-10-30T11:00:00Z", ...history("old-1", "seen", "new") }),
          prNode(2, history("first")),
        ],
      });
      const previous = [
        pullRequest({
          number: 1,
          commits: [
            { oid: "old-1", committedAt: "2026-10-30T07:00:00Z" },
            { oid: "seen", committedAt: "2026-10-30T07:00:00Z", firstSeenAt: "2026-10-30T09:00:00Z" },
          ],
        }),
      ];

      const snapshot = await fetchSnapshot({
        repos: ["my-org/repo-a"],
        token: "t",
        fetch: github.fetch,
        previous,
        observedAt: new Date("2026-10-30T12:00:00Z"),
      });

      expect(snapshot.pullRequests.map((pr) => pr.commits.map((c) => [c.oid, c.firstSeenAt]))).toEqual([
        [
          ["old-1", undefined],
          ["seen", "2026-10-30T09:00:00Z"],
          ["new", "2026-10-30T12:00:00.000Z"],
        ],
        [["first", undefined]],
      ]);
    });

    it("makes no details request when no PR changed", async () => {
      const github = fakeGitHub({ "my-org/repo-a": [prNode(1, { updatedAt: "2026-10-30T10:00:00Z" })] });

      await fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch: github.fetch, previous: [stored(1, "2026-10-30T10:00:00Z")] });

      expect(github.calls).toHaveLength(1);
    });

    it("does not reuse details from a PR with the same number in another repo", async () => {
      const github = fakeGitHub({ "my-org/repo-b": [prNode(1, { updatedAt: "2026-10-30T10:00:00Z" })] });

      const snapshot = await fetchSnapshot({ repos: ["my-org/repo-b"], token: "t", fetch: github.fetch, previous: [stored(1, "2026-10-30T10:00:00Z")] });

      expect(snapshot.pullRequests[0]?.comments).toEqual([]);
      expect(github.calls).toHaveLength(2);
    });

    it("splits the details of many changed PRs into requests small enough for GitHub to answer in time", async () => {
      const numbers = Array.from({ length: 60 }, (_, i) => i + 1);
      const github = fakeGitHub({ "my-org/repo-a": numbers.map((number) => prNode(number)) });

      const snapshot = await fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch: github.fetch });

      const lookups = github.calls.slice(1).map((call) => call.query.match(/pullRequest\(number: \d+\)/g)!.length);
      expect(lookups).toEqual([25, 25, 10]);
      expect(snapshot.pullRequests).toHaveLength(60);
    });

    it("fails the poll when GitHub returns no details for a changed PR, so the next poll asks again", async () => {
      const github = fakeGitHub({ "my-org/repo-a": [prNode(1)] });
      const fetch = async (url: string | URL | Request, init?: RequestInit) =>
        String(init?.body).includes("PullRequestDetails")
          ? Response.json({ data: { r0: { p0: null } }, errors: [{ message: "Something went wrong" }] })
          : github.fetch(url, init);

      await expect(fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch })).rejects.toThrow(/Something went wrong/);
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

  it("keeps the status and rate-limit headers of a refused request, for classifyGitHubError", async () => {
    const fetch = async () =>
      Response.json(
        { message: "API rate limit exceeded" },
        { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1793363400", "x-github-request-id": "1" } },
      );

    await expect(fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch })).rejects.toMatchObject({
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1793363400" },
    });
  });

  it("keeps the type of each GraphQL error when no data comes back", async () => {
    const fetch = async () =>
      Response.json({ errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded for user ID 1." }] });

    await expect(fetchSnapshot({ repos: ["my-org/repo-a"], token: "t", fetch })).rejects.toMatchObject({
      status: 200,
      errorTypes: ["RATE_LIMITED"],
    });
  });

  it("keeps the other repos and reports the one GitHub cannot resolve", async () => {
    const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      const { query, variables } = JSON.parse(String(init?.body));
      if (query.startsWith("query PullRequestDetails")) return answerDetails(query, variables, { "my-org/repo-a": [prNode(1)] });
      return Response.json({
        data: {
          viewer: { login: "me" },
          r0: null,
          r1: { nameWithOwner: "my-org/repo-a", pullRequests: { nodes: [prNode(1)], pageInfo: { hasNextPage: false } } },
        },
        errors: [{ message: "Could not resolve to a Repository with the name 'my-org/nope'." }],
      });
    };

    const snapshot = await fetchSnapshot({ repos: ["my-org/nope", "my-org/repo-a"], token: "t", fetch });

    expect(snapshot.pullRequests.map((pr) => `${pr.repo}#${pr.number}`)).toEqual(["my-org/repo-a#1"]);
    expect(snapshot.problems).toEqual(["Could not resolve to a Repository with the name 'my-org/nope'."]);
    expect(snapshot.unreadRepos).toEqual(["my-org/nope"]);
  });

  it("names the repos whose issues are on in GitHub, in the order of the repos", async () => {
    const github = fakeGitHub({}, { issuesOff: ["my-org/repo-b"] });

    const snapshot = await fetchSnapshot({ repos: ["my-org/repo-c", "my-org/repo-b", "my-org/repo-a"], token: "t", fetch: github.fetch });

    expect(github.calls[0]?.query).toContain("hasIssuesEnabled");
    expect(snapshot.issueRepos).toEqual(["my-org/repo-c", "my-org/repo-a"]);
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
