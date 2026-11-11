import { sameRepo } from "../domain/repos.js";
import type { ReviewState } from "../domain/types.js";
import type { WorkSource } from "../domain/work-log.js";
import { postGraphQL } from "./client.js";

// The work log's own search, apart from the poll's: run when its panel asks, at most once a minute.
const PAGE_SIZE = 50;
/** Enough for weeks of anyone's PRs; past it the oldest are left out rather than the search running on. */
const MAX_PAGES = 5;
const COMMITS = 100;
const REVIEWS = 100;
const COMMENTS = 100;

/** The PRs I opened, reviewed, or commented on: GitHub's search has no single qualifier for all three. */
const QUALIFIERS = ["author", "reviewed-by", "commenter"] as const;

const VIEWER_QUERY = "query WorkLogViewer { viewer { login } }";

const SEARCH_QUERY = `query WorkLog($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: ${PAGE_SIZE}, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number
        title
        url
        headRefName
        body
        createdAt
        mergedAt
        closedAt
        state
        repository { nameWithOwner }
        author { login }
        commits(last: ${COMMITS}) { nodes { commit { authoredDate author { user { login } } } } }
        reviews(last: ${REVIEWS}) { nodes { author { login } state submittedAt comments { totalCount } } }
        comments(last: ${COMMENTS}) { nodes { author { login } createdAt } }
      }
    }
  }
}`;

type PrNode = {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  body: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  state: "OPEN" | "CLOSED" | "MERGED";
  repository: { nameWithOwner: string };
  author: { login: string } | null;
  commits: { nodes: { commit: { authoredDate: string; author: { user: { login: string } | null } | null } }[] };
  reviews: { nodes: { author: { login: string } | null; state: ReviewState | "PENDING"; submittedAt: string | null; comments: { totalCount: number } }[] };
  comments: { nodes: { author: { login: string } | null; createdAt: string }[] };
};

type SearchData = { search: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: (PrNode | { number?: undefined })[] } };

/** The login of the token's user and the PRs of the followed `repos` I opened, reviewed or commented on, updated since `since`. */
export async function fetchWorkLog(options: {
  repos: string[];
  since: Date;
  token: string;
  fetch?: typeof globalThis.fetch;
}): Promise<{ viewer: string; pullRequests: WorkSource[] }> {
  const { repos, since, token, fetch = globalThis.fetch } = options;
  const who = await postGraphQL<{ viewer: { login: string } }>({ query: VIEWER_QUERY, variables: {} }, token, fetch);
  if (!who.data?.viewer) throw who.failure("no viewer");
  const viewer = who.data.viewer.login;

  const found = new Map<string, WorkSource>();
  const day = since.toISOString().slice(0, 10);
  // The three searches at once: each runs its pages one after the other, and a PR found by two is kept once.
  const search = async (qualifier: (typeof QUALIFIERS)[number]) => {
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const variables: Record<string, string> = { q: `is:pr ${qualifier}:${viewer} updated:>=${day}`, ...(after ? { after } : {}) };
      const { data, failure } = await postGraphQL<SearchData>({ query: SEARCH_QUERY, variables }, token, fetch);
      if (!data?.search) throw failure("no search result");
      for (const node of data.search.nodes) {
        if (node.number === undefined) continue;
        const repo = node.repository.nameWithOwner;
        if (repos.some((followed) => sameRepo(followed, repo))) found.set(`${repo}#${node.number}`, toSource(node));
      }
      if (!data.search.pageInfo.hasNextPage) return;
      after = data.search.pageInfo.endCursor;
    }
  };
  await Promise.all(QUALIFIERS.map(search));
  return { viewer, pullRequests: [...found.values()] };
}

function toSource(node: PrNode): WorkSource {
  return {
    repo: node.repository.nameWithOwner,
    number: node.number,
    title: node.title,
    url: node.url,
    author: node.author?.login ?? "",
    headRefName: node.headRefName,
    body: node.body,
    createdAt: node.createdAt,
    mergedAt: node.mergedAt,
    closedAt: node.state === "CLOSED" ? node.closedAt : null,
    commits: node.commits.nodes.map(({ commit }) => ({ author: commit.author?.user?.login ?? null, authoredAt: commit.authoredDate })),
    reviews: node.reviews.nodes.flatMap((review) =>
      review.state === "PENDING" || review.submittedAt === null || !review.author
        ? []
        : [{ author: review.author.login, state: review.state, submittedAt: review.submittedAt, comments: review.comments.totalCount }],
    ),
    comments: node.comments.nodes.flatMap((comment) => (comment.author ? [{ author: comment.author.login, createdAt: comment.createdAt }] : [])),
  };
}
