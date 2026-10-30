import type {
  Mergeable,
  MergeStateStatus,
  PullRequest,
  ReviewDecision,
  ReviewState,
  Snapshot,
} from "../domain/types.js";
import { type CheckContext, summarizeChecks } from "./checks.js";
import { buildSnapshotQuery, PAGE_SIZE } from "./query.js";

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

type RepositoryNode = {
  nameWithOwner: string;
  pullRequests: { nodes: PullRequestNode[]; pageInfo: { hasNextPage: boolean } };
} | null;

type GraphQLResponse = {
  data?: { viewer: { login: string } } & Record<string, RepositoryNode>;
  errors?: { message: string }[];
};

export class GitHubError extends Error {
  override name = "GitHubError";
}

/**
 * A snapshot plus what went wrong with individual repos. One unreachable repo or an
 * overfull page is reported in `problems` instead of failing the whole poll.
 */
export type FetchedSnapshot = Snapshot & { problems: string[] };

export async function fetchSnapshot(options: {
  repos: string[];
  token: string;
  fetch?: typeof globalThis.fetch;
}): Promise<FetchedSnapshot> {
  const { repos, token, fetch = globalThis.fetch } = options;
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "WorkDash",
    },
    body: JSON.stringify(buildSnapshotQuery(repos)),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new GitHubError(`GitHub API responded ${response.status}: ${body.message ?? response.statusText}`);
  }

  const { data, errors = [] } = (await response.json()) as GraphQLResponse;
  if (!data?.viewer) {
    const reason = errors.map((e) => e.message).join("; ") || "empty response";
    throw new GitHubError(`GitHub GraphQL error: ${reason}`);
  }

  const repositories = repos.map((_, i) => data[`r${i}`] ?? null);
  const truncated = repositories.filter((repository) => repository?.pullRequests.pageInfo.hasNextPage);
  return {
    viewer: data.viewer.login,
    pullRequests: repositories.flatMap(toPullRequests),
    problems: [
      ...errors.map((e) => e.message),
      ...truncated.map(
        (repository) =>
          `${repository!.nameWithOwner} has more than ${PAGE_SIZE} open PRs; showing the ${PAGE_SIZE} most recently updated`,
      ),
    ],
  };
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
  }));
}
