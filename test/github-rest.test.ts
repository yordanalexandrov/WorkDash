import { describe, expect, it } from "vitest";
import { accessibleRepos, checkRepo, checkToken, checkUser, repoLabels } from "../src/github/rest.js";

type Route = (url: URL, headers: Record<string, string>) => Response;

/** A stand-in for api.github.com: each request goes to `route`, which sees its URL and headers. */
function fakeGitHub(route: Route) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    calls.push({ url: String(input), headers });
    return route(new URL(String(input)), headers);
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const RATE = { "x-ratelimit-remaining": "4990", "x-ratelimit-limit": "5000", "x-ratelimit-reset": "1793440800" };

describe("checkToken", () => {
  it("says whose token it is, its scopes and what is left of the rate limit", async () => {
    const github = fakeGitHub(() => Response.json({ login: "me" }, { headers: { ...RATE, "x-oauth-scopes": "repo, read:org" } }));

    const result = await checkToken("ghp_secret", github.fetch);

    expect(result).toEqual({
      ok: true,
      login: "me",
      scopes: ["repo", "read:org"],
      rateLimit: { remaining: 4990, limit: 5000, resetAt: "2026-10-31T10:00:00.000Z" },
    });
    expect(github.calls[0]?.url).toBe("https://api.github.com/user");
    expect(github.calls[0]?.headers.Authorization).toBe("Bearer ghp_secret");
  });

  it("has no scopes for a fine-grained token, which GitHub sends none for", async () => {
    const github = fakeGitHub(() => Response.json({ login: "me" }, { headers: RATE }));

    expect(await checkToken("github_pat_x", github.fetch)).toMatchObject({ ok: true, scopes: null });
  });

  it("says GitHub refuses a bad token", async () => {
    const github = fakeGitHub(() => Response.json({ message: "Bad credentials" }, { status: 401 }));

    expect(await checkToken("ghp_bad", github.fetch)).toEqual({ ok: false, message: "GitHub отказва токена: Bad credentials" });
  });

  it("says GitHub could not be reached", async () => {
    const fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof globalThis.fetch;

    expect(await checkToken("ghp_x", fetch)).toEqual({ ok: false, message: "GitHub е недостъпен: fetch failed" });
  });
});

describe("checkRepo", () => {
  it("finds a repo the token sees", async () => {
    const github = fakeGitHub((url) => (url.pathname === "/repos/my-org/repo-a" ? Response.json({ full_name: "my-org/repo-a" }) : new Response(null, { status: 404 })));

    expect(await checkRepo("my-org/repo-a", "ghp_x", github.fetch)).toEqual({ ok: true });
  });

  it("warns about a repo that does not exist or the token does not see", async () => {
    const github = fakeGitHub(() => Response.json({ message: "Not Found" }, { status: 404 }));

    expect(await checkRepo("my-org/nope", "ghp_x", github.fetch)).toEqual({ ok: false, message: "Не съществува или токенът не го вижда" });
  });
});

describe("checkUser", () => {
  it("finds a login and its avatar", async () => {
    const github = fakeGitHub((url) =>
      url.pathname === "/users/colleague1" ? Response.json({ login: "colleague1", avatar_url: "https://avatars.example/u/1" }) : new Response(null, { status: 404 }),
    );

    expect(await checkUser("colleague1", "ghp_x", github.fetch)).toEqual({ ok: true, avatarUrl: "https://avatars.example/u/1" });
  });

  it("warns about a login that does not exist", async () => {
    const github = fakeGitHub(() => new Response(null, { status: 404 }));

    expect(await checkUser("nobody", "ghp_x", github.fetch)).toEqual({ ok: false, message: "Няма такъв login в GitHub" });
  });
});

describe("accessibleRepos", () => {
  it("lists the repos the token can see, most recently pushed first", async () => {
    const github = fakeGitHub(() => Response.json([{ full_name: "my-org/repo-b" }, { full_name: "my-org/repo-a" }]));

    expect(await accessibleRepos("ghp_x", github.fetch)).toEqual(["my-org/repo-b", "my-org/repo-a"]);
    expect(github.calls[0]?.url).toBe("https://api.github.com/user/repos?per_page=100&sort=pushed");
  });

  it("lists none when GitHub refuses", async () => {
    const github = fakeGitHub(() => new Response(null, { status: 401 }));

    expect(await accessibleRepos("ghp_x", github.fetch)).toEqual([]);
  });
});

describe("repoLabels", () => {
  it("lists the repo's labels with their colours", async () => {
    const github = fakeGitHub(() => Response.json([{ name: "todo", color: "ededed", id: 1 }, { name: "in-progress", color: "0e8a16" }]));

    expect(await repoLabels("my-org/repo-a", "ghp_x", github.fetch)).toEqual([
      { name: "todo", color: "ededed" },
      { name: "in-progress", color: "0e8a16" },
    ]);
    expect(github.calls[0]?.url).toBe("https://api.github.com/repos/my-org/repo-a/labels?per_page=100");
  });

  it("knows none when GitHub does not answer, so no label gets a warning", async () => {
    const github = fakeGitHub(() => new Response(null, { status: 404 }));

    expect(await repoLabels("my-org/repo-a", "ghp_x", github.fetch)).toBeNull();
  });
});
