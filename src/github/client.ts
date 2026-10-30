import type {
  ClosedPullRequest,
  Comment,
  Mergeable,
  MergeStateStatus,
  PullRequest,
  ReviewDecision,
  ReviewState,
  Snapshot,
} from "../domain/types.js";
import type { GitHubResponseFailure } from "../domain/poll-error.js";
import { type CheckContext, summarizeChecks } from "./checks.js";
import { buildClosedQuery, buildSnapshotQuery, PAGE_SIZE } from "./query.js";

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
  comments: { nodes: CommentNode[] };
  reviewThreads: { nodes: { id: string; comments: { nodes: CommentNode[] } }[] };
  history: { nodes: { commit: { oid: string; committedDate: string } }[] };
};

type CommentNode = {
  id: string;
  author: { __typename: string; login: string } | null;
  createdAt: string;
  body: string;
};

type RepositoryNode = {
  nameWithOwner: string;
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

/** Headers that say why GitHub refused a request; classifyPollError reads them. */
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
};

async function postGraphQL<T>(
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
  // A GraphQL failure (a rate limit, say) comes back as 200 with errors; keep what classifyPollError needs.
  const failure = (reason: string) =>
    new GitHubError(`GitHub GraphQL error: ${errors.map((e) => e.message).join("; ") || reason}`, {
      status: response.status,
      headers: failureHeaders(response),
      errorTypes: errors.flatMap((e) => e.type ?? []),
    });
  return { data, errors, failure };
}

export async function fetchSnapshot(options: {
  repos: string[];
  token: string;
  fetch?: typeof globalThis.fetch;
}): Promise<FetchedSnapshot> {
  const { repos, token, fetch = globalThis.fetch } = options;
  const { data, errors, failure } = await postGraphQL<{ viewer: { login: string } } & Record<string, RepositoryNode>>(
    buildSnapshotQuery(repos),
    token,
    fetch,
  );
  if (!data?.viewer) throw failure("empty response");

  const repositories = repos.map((_, i) => data[`r${i}`] ?? null);
  const truncated = repositories.filter((repository) => repository?.pullRequests.pageInfo.hasNextPage);
  return {
    viewer: data.viewer.login,
    pullRequests: repositories.flatMap(toPullRequests),
    unreadRepos: repos.filter((_, i) => !repositories[i]),
    problems: [
      ...errors.map((e) => e.message),
      ...truncated.map(
        (repository) =>
          `${repository!.nameWithOwner} has more than ${PAGE_SIZE} open PRs; showing the ${PAGE_SIZE} most recently updated`,
      ),
    ],
  };
}

/**
 * Looks up PRs by number, in one request, to learn whether each was merged or closed.
 * A PR that is still open (one pushed off a full page, say) is left out. Throws a GitHubError,
 * like fetchSnapshot, when GitHub answers with no data.
 */
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

function toPullRequests(repository: RepositoryNode): PullRequest[] {
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
    comments: toComments(node),
    commits: node.history.nodes.map(({ commit }) => ({ oid: commit.oid, committedAt: commit.committedDate })),
  }));
}

/** General and review-thread comments in one list, oldest first. Bots are not people, so their comments are left out. */
function toComments(node: PullRequestNode): Comment[] {
  const toComment = (comment: CommentNode, thread?: string): Comment[] =>
    comment.author?.__typename === "Bot"
      ? []
      : [{ id: comment.id, author: comment.author?.login ?? "ghost", createdAt: comment.createdAt, body: comment.body, ...(thread ? { thread } : {}) }];
  return [
    ...node.comments.nodes.flatMap((comment) => toComment(comment)),
    ...node.reviewThreads.nodes.flatMap((thread) => thread.comments.nodes.flatMap((comment) => toComment(comment, thread.id))),
  ].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
