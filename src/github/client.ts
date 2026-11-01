import type {
  ClosedPullRequest,
  Comment,
  Commit,
  Mergeable,
  MergeStateStatus,
  PullRequest,
  ReviewDecision,
  ReviewState,
  Snapshot,
} from "../domain/types.js";
import type { GitHubResponseFailure } from "../domain/github-error.js";
import { type CheckContext, summarizeChecks } from "./checks.js";
import { buildClosedQuery, buildDetailsQuery, buildSnapshotQuery, PAGE_SIZE } from "./query.js";

const GRAPHQL_URL = "https://api.github.com/graphql";

type PullRequestNode = {
  number: number;
  title: string;
  headRefName: string;
  body: string;
  url: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  mergeable: Mergeable;
  mergeStateStatus: MergeStateStatus;
  reviewDecision: ReviewDecision | null;
  author: { login: string } | null;
  // A team (or a deleted user) matches no fragment field and comes back as {} or null.
  reviewRequests: { nodes: { requestedReviewer: { login?: string } | null }[] };
  latestReviews: { nodes: { author: { login: string } | null; state: ReviewState | "PENDING"; submittedAt: string | null }[] };
  commits: { nodes: { commit: { statusCheckRollup: { contexts: { nodes: CheckContext[] } } | null } }[] };
};

/** The expensive part of a PR, fetched apart and only when the PR changed. */
type DetailsNode = {
  comments: { nodes: CommentNode[] };
  reviewThreads: { nodes: { id: string; comments: { nodes: CommentNode[] } }[] };
  history: { nodes: { commit: { oid: string; committedDate: string } }[] };
} | null;

type CommentNode = {
  id: string;
  author: { __typename: string; login: string } | null;
  createdAt: string;
  body: string;
};

type RepositoryNode = {
  nameWithOwner: string;
  hasIssuesEnabled: boolean;
  pullRequests: { nodes: PullRequestNode[]; pageInfo: { hasNextPage: boolean } };
} | null;

type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLErrors;
};

type GraphQLErrors = { message: string; type?: string }[];

type ClosedPullRequestNode = {
  number: number;
  title: string;
  url: string;
  author: { login: string } | null;
  state: "OPEN" | "MERGED" | "CLOSED";
  closedAt: string | null;
} | null;

/** Headers that say why GitHub refused a request; classifyGitHubError reads them. */
const FAILURE_HEADERS = ["x-ratelimit-remaining", "x-ratelimit-reset", "retry-after"];

/** How long a poll waits for GitHub before treating it as unreachable. */
const REQUEST_TIMEOUT_MS = 30_000;

export class GitHubError extends Error implements GitHubResponseFailure {
  override name = "GitHubError";
  readonly status?: number;
  readonly headers: Record<string, string>;
  readonly errorTypes: string[];

  constructor(message: string, details: { status?: number; headers?: Record<string, string>; errorTypes?: string[] } = {}) {
    super(message);
    this.status = details.status;
    this.headers = details.headers ?? {};
    this.errorTypes = details.errorTypes ?? [];
  }
}

function failureHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of FAILURE_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  return headers;
}

/**
 * A snapshot plus what went wrong with individual repos. One unreachable repo or an
 * overfull page is reported in `problems` instead of failing the whole poll.
 */
export type FetchedSnapshot = Snapshot & {
  problems: string[];
  /** Repos GitHub returned nothing for; their PRs are missing from the snapshot. */
  unreadRepos: string[];
  /** The repos read whose issues are on in GitHub, in the order of the repos asked for; only they get an Issue dashboard tab. */
  issueRepos: string[];
};

export async function postGraphQL<T>(
  body: { query: string; variables: Record<string, string> },
  token: string,
  fetch: typeof globalThis.fetch,
): Promise<{ data: T | undefined; errors: GraphQLErrors; failure: (reason: string) => GitHubError }> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "WorkDash",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new GitHubError(`GitHub API responded ${response.status}: ${body.message ?? response.statusText}`, {
      status: response.status,
      headers: failureHeaders(response),
    });
  }

  const { data, errors = [] } = (await response.json()) as GraphQLResponse<T>;
  // A GraphQL failure (a rate limit, say) comes back as 200 with errors; keep what classifyGitHubError needs.
  const failure = (reason: string) =>
    new GitHubError(`GitHub GraphQL error: ${errors.map((e) => e.message).join("; ") || reason}`, {
      status: response.status,
      headers: failureHeaders(response),
      errorTypes: errors.flatMap((e) => e.type ?? []),
    });
  return { data, errors, failure };
}

/** PRs per details request: GitHub gives up after about 10 s, and 100 busy PRs did not come back in time. */
const DETAILS_BATCH_SIZE = 25;

/** Lists the open PRs of every repo, then fetches details only for PRs new or updated since `previous`. */
export async function fetchSnapshot(options: {
  repos: string[];
  token: string;
  fetch?: typeof globalThis.fetch;
  /** The last saved snapshot's PRs, whose comments and commits are reused while a PR is unchanged. */
  previous?: PullRequest[];
  /** The `firstSeenAt` of commits new on a PR seen before. */
  observedAt?: Date;
}): Promise<FetchedSnapshot> {
  const { repos, token, fetch = globalThis.fetch, previous = [], observedAt = new Date() } = options;
  const { data, errors, failure } = await postGraphQL<{ viewer: { login: string } } & Record<string, RepositoryNode>>(
    buildSnapshotQuery(repos),
    token,
    fetch,
  );
  if (!data?.viewer) throw failure("empty response");

  const repositories = repos.map((_, i) => data[`r${i}`] ?? null);
  const truncated = repositories.filter((repository) => repository?.pullRequests.pageInfo.hasNextPage);
  const listed = repositories.flatMap(toPullRequests);

  const key = (pr: { repo: string; number: number }) => `${pr.repo}#${pr.number}`;
  const known = new Map(previous.map((pr) => [key(pr), pr]));
  const changed = listed.filter((pr) => known.get(key(pr))?.updatedAt !== pr.updatedAt);
  const details = new Map<string, Pick<PullRequest, "comments" | "commits">>();
  for (let start = 0; start < changed.length; start += DETAILS_BATCH_SIZE) {
    for (const [prKey, detail] of await fetchDetails(changed.slice(start, start + DETAILS_BATCH_SIZE), token, fetch)) {
      details.set(prKey, detail);
    }
  }

  return {
    viewer: data.viewer.login,
    pullRequests: listed.map((pr) => {
      const old = known.get(key(pr));
      const fetched = details.get(key(pr));
      if (!fetched) return { ...pr, comments: old!.comments, commits: old!.commits };
      return { ...pr, comments: fetched.comments, commits: old ? firstSeen(fetched.commits, old.commits, observedAt) : fetched.commits };
    }),
    unreadRepos: repos.filter((_, i) => !repositories[i]),
    issueRepos: repositories.flatMap((repository) => (repository?.hasIssuesEnabled ? [repository.nameWithOwner] : [])),
    problems: [
      ...errors.map((e) => e.message),
      ...truncated.map(
        (repository) =>
          `${repository!.nameWithOwner} has more than ${PAGE_SIZE} open PRs; showing the ${PAGE_SIZE} most recently updated`,
      ),
    ],
  };
}

/** `commits` with when each was first seen: carried over from `before`, or `at` for a commit new since then. */
function firstSeen(commits: Commit[], before: Commit[], at: Date): Commit[] {
  const seen = new Map(before.map((commit) => [commit.oid, commit]));
  return commits.map((commit) => {
    const old = seen.get(commit.oid);
    if (!old) return { ...commit, firstSeenAt: at.toISOString() };
    return old.firstSeenAt ? { ...commit, firstSeenAt: old.firstSeenAt } : commit;
  });
}

/** The comments and commits of `pullRequests`, keyed `repo#number`; throws when one is missing, so the poll is retried. */
async function fetchDetails(
  pullRequests: { repo: string; number: number }[],
  token: string,
  fetch: typeof globalThis.fetch,
): Promise<Map<string, Pick<PullRequest, "comments" | "commits">>> {
  const { query, variables, aliases } = buildDetailsQuery(pullRequests);
  const { data, failure } = await postGraphQL<Record<string, Record<string, DetailsNode> | null>>({ query, variables }, token, fetch);
  const details = new Map<string, Pick<PullRequest, "comments" | "commits">>();
  aliases.forEach(({ repo, numbers }, i) =>
    numbers.forEach((number, j) => {
      const node = data?.[`r${i}`]?.[`p${j}`];
      if (!node) throw failure(`no details for ${repo}#${number}`);
      details.set(`${repo}#${number}`, {
        comments: toComments(node),
        commits: node.history.nodes.map(({ commit }) => ({ oid: commit.oid, committedAt: commit.committedDate })),
      });
    }),
  );
  return details;
}

/** Looks up PRs by number to learn whether each was merged or closed; one still open is left out. */
export async function fetchClosedPullRequests(options: {
  pullRequests: { repo: string; number: number }[];
  token: string;
  fetch?: typeof globalThis.fetch;
}): Promise<{ closed: ClosedPullRequest[]; problems: string[] }> {
  const { pullRequests, token, fetch = globalThis.fetch } = options;
  if (pullRequests.length === 0) return { closed: [], problems: [] };

  const { query, variables, aliases } = buildClosedQuery(pullRequests);
  const { data, errors, failure } = await postGraphQL<Record<string, Record<string, ClosedPullRequestNode> | null>>(
    { query, variables },
    token,
    fetch,
  );
  // No data at all (a rate limit, a revoked token) fails the lookup; a PR GitHub cannot resolve is only a problem.
  if (!data) throw failure("empty response");

  const closed = aliases.flatMap(({ repo }, i) =>
    Object.values(data[`r${i}`] ?? {}).flatMap((node): ClosedPullRequest[] =>
      node && node.state !== "OPEN" && node.closedAt
        ? [
            {
              repo,
              number: node.number,
              title: node.title,
              url: node.url,
              author: node.author?.login ?? "ghost",
              state: node.state,
              closedAt: node.closedAt,
            },
          ]
        : [],
    ),
  );
  return { closed, problems: errors.map((e) => e.message) };
}

/** The listed PRs, without comments and commits; those come from fetchDetails or the previous snapshot. */
function toPullRequests(repository: RepositoryNode): Omit<PullRequest, "comments" | "commits">[] {
  if (!repository) return [];
  return repository.pullRequests.nodes.map((node) => ({
    repo: repository.nameWithOwner,
    number: node.number,
    title: node.title,
    headRefName: node.headRefName,
    body: node.body,
    url: node.url,
    author: node.author?.login ?? "ghost",
    isDraft: node.isDraft,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    mergeable: node.mergeable,
    mergeStateStatus: node.mergeStateStatus,
    reviewDecision: node.reviewDecision,
    requestedReviewers: node.reviewRequests.nodes.flatMap((request) => request.requestedReviewer?.login ?? []),
    reviews: node.latestReviews.nodes.flatMap((review) =>
      // A pending review is a draft that only its author sees.
      review.state === "PENDING" || !review.submittedAt
        ? []
        : [{ author: review.author?.login ?? "ghost", state: review.state, submittedAt: review.submittedAt }],
    ),
    ...summarizeChecks(node.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? []),
  }));
}

/** General and review-thread comments in one list, oldest first. Bots are not people, so their comments are left out. */
function toComments(node: NonNullable<DetailsNode>): Comment[] {
  const toComment = (comment: CommentNode, thread?: string): Comment[] =>
    comment.author?.__typename === "Bot"
      ? []
      : [{ id: comment.id, author: comment.author?.login ?? "ghost", createdAt: comment.createdAt, body: comment.body, ...(thread ? { thread } : {}) }];
  return [
    ...node.comments.nodes.flatMap((comment) => toComment(comment)),
    ...node.reviewThreads.nodes.flatMap((thread) => thread.comments.nodes.flatMap((comment) => toComment(comment, thread.id))),
  ].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
