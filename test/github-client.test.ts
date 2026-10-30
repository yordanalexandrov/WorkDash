import { describe, expect, it } from "vitest";
import { fetchSnapshot } from "../src/github/client.js";

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
    updatedAt: "2026-10-30T10:00:00Z",
    author: { login: "colleague1" },
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
      {
        repo: "my-org/repo-a",
        number: 1,
        title: "PR 1",
        url: "https://github.com/x/y/pull/1",
        author: "colleague1",
        updatedAt: "2026-10-30T10:00:00Z",
      },
      {
        repo: "my-org/repo-b",
        number: 7,
        title: "Fix login",
        url: "https://github.com/x/y/pull/7",
        author: "colleague2",
        updatedAt: "2026-10-30T10:00:00Z",
      },
    ]);
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
