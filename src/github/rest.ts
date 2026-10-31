/** The few GitHub REST calls the Settings screen makes to check a token, a repo or a login. */

const API = "https://api.github.com";

/** How long a check waits for GitHub. */
const REQUEST_TIMEOUT_MS = 15_000;

export type RateLimit = { remaining: number; limit: number; resetAt: string | null };

export type TokenCheck =
  | {
      ok: true;
      login: string;
      /** The classic token's scopes; null for a fine-grained token, which has none. */
      scopes: string[] | null;
      rateLimit: RateLimit;
    }
  | { ok: false; message: string };

export type NameCheck = { ok: true } | { ok: false; message: string };

export type UserCheck = { ok: true; avatarUrl: string } | { ok: false; message: string };

/** What GitHub says about each repo and login, by name. */
export type NamesCheck = { repos: Record<string, NameCheck>; team: Record<string, UserCheck> };

type Fetch = typeof globalThis.fetch;

/** A GET of `path` with the token; a TypeError or a timeout when GitHub cannot be reached. */
function get(path: string, token: string, fetch: Fetch): Promise<Response> {
  return fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "WorkDash" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function unreachable(error: unknown): { ok: false; message: string } {
  return { ok: false, message: `GitHub е недостъпен: ${(error as Error).message}` };
}

async function githubMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  return body.message ?? response.statusText;
}

/** Whose token it is, its scopes and its rate limit; or why GitHub does not take it. */
export async function checkToken(token: string, fetch: Fetch = globalThis.fetch): Promise<TokenCheck> {
  let response: Response;
  try {
    response = await get("/user", token, fetch);
  } catch (error) {
    return unreachable(error);
  }
  if (response.status === 401 || response.status === 403) return { ok: false, message: `GitHub отказва токена: ${await githubMessage(response)}` };
  if (!response.ok) return { ok: false, message: `GitHub отговори ${response.status}: ${await githubMessage(response)}` };
  const { login } = (await response.json()) as { login: string };
  const scopes = response.headers.get("x-oauth-scopes");
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  return {
    ok: true,
    login,
    scopes: scopes === null ? null : scopes.split(",").map((scope) => scope.trim()).filter(Boolean),
    rateLimit: {
      remaining: Number(response.headers.get("x-ratelimit-remaining")),
      limit: Number(response.headers.get("x-ratelimit-limit")),
      resetAt: reset ? new Date(reset * 1000).toISOString() : null,
    },
  };
}

/** Whether the repo ("owner/name") exists and the token sees it. */
export async function checkRepo(repo: string, token: string, fetch: Fetch = globalThis.fetch): Promise<NameCheck> {
  try {
    const response = await get(`/repos/${repo.split("/").map(encodeURIComponent).join("/")}`, token, fetch);
    if (response.ok) return { ok: true };
    if (response.status === 404) return { ok: false, message: "Не съществува или токенът не го вижда" };
    return { ok: false, message: `GitHub отговори ${response.status}: ${await githubMessage(response)}` };
  } catch (error) {
    return unreachable(error);
  }
}

/** Whether the login exists, with its avatar. */
export async function checkUser(login: string, token: string, fetch: Fetch = globalThis.fetch): Promise<UserCheck> {
  try {
    const response = await get(`/users/${encodeURIComponent(login)}`, token, fetch);
    if (response.ok) return { ok: true, avatarUrl: ((await response.json()) as { avatar_url: string }).avatar_url };
    if (response.status === 404) return { ok: false, message: "Няма такъв login в GitHub" };
    return { ok: false, message: `GitHub отговори ${response.status}: ${await githubMessage(response)}` };
  } catch (error) {
    return unreachable(error);
  }
}

/** Up to 100 repos the token can see, most recently pushed first, as hints for adding one; none when GitHub does not answer. */
export async function accessibleRepos(token: string, fetch: Fetch = globalThis.fetch): Promise<string[]> {
  try {
    const response = await get("/user/repos?per_page=100&sort=pushed", token, fetch);
    if (!response.ok) return [];
    return ((await response.json()) as { full_name: string }[]).map((repo) => repo.full_name);
  } catch {
    return [];
  }
}
