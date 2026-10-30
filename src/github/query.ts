// GitHub prices a query by the largest number of nodes it could return. Listing 100 PRs with their
// checks costs about 4 points per repo; comments, review threads and commits are what made it
// expensive, so they come from buildDetailsQuery, and only for PRs that changed.
export const PAGE_SIZE = 100;
const REVIEWERS_PAGE_SIZE = 20;
const CHECKS_PAGE_SIZE = 50;
const COMMENTS_PAGE_SIZE = 30;
const THREADS_PAGE_SIZE = 30;
const THREAD_COMMENTS_PAGE_SIZE = 10;
const COMMITS_PAGE_SIZE = 20;

/**
 * Builds one GraphQL query that lists the viewer and the open PRs of every repo, one
 * `rN: repository(...)` alias per repo, without the PRs' comments and commits.
 */
export function buildSnapshotQuery(repos: string[]): { query: string; variables: Record<string, string> } {
  const variables: Record<string, string> = {};
  const params: string[] = [];
  const fields: string[] = [];

  repos.forEach((repo, i) => {
    const [owner, name] = repo.split("/") as [string, string];
    variables[`owner${i}`] = owner;
    variables[`name${i}`] = name;
    params.push(`$owner${i}: String!`, `$name${i}: String!`);
    fields.push(`  r${i}: repository(owner: $owner${i}, name: $name${i}) { ...openPullRequests }`);
  });

  const query = `query Snapshot(${params.join(", ")}) {
  viewer { login }
${fields.join("\n")}
}

fragment openPullRequests on Repository {
  nameWithOwner
  pullRequests(states: OPEN, first: ${PAGE_SIZE}, orderBy: { field: UPDATED_AT, direction: DESC }) {
    nodes {
      number
      title
      headRefName
      body
      url
      isDraft
      createdAt
      updatedAt
      mergeable
      mergeStateStatus
      reviewDecision
      author { login }
      reviewRequests(first: ${REVIEWERS_PAGE_SIZE}) { nodes { requestedReviewer { ... on User { login } } } }
      latestReviews(first: ${REVIEWERS_PAGE_SIZE}) { nodes { author { login } state submittedAt } }
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: ${CHECKS_PAGE_SIZE}) {
                nodes {
                  __typename
                  ... on CheckRun { name status conclusion checkSuite { app { slug } } }
                  ... on StatusContext { context state }
                }
              }
            }
          }
        }
      }
    }
    pageInfo { hasNextPage }
  }
}`;

  return { query, variables };
}

type Lookup = { query: string; variables: Record<string, string>; aliases: { repo: string; numbers: number[] }[] };

/**
 * Builds one GraphQL query that looks up PRs by number, one `rN: repository(...)` alias per repo
 * and one `pM: pullRequest(number: ...)` alias per PR, each selecting the first fragment in `fragment`.
 * Returns the repos and numbers in alias order, so the answer can be mapped back.
 */
function buildLookupQuery(operation: string, fragment: string, pullRequests: { repo: string; number: number }[]): Lookup {
  const aliases: { repo: string; numbers: number[] }[] = [];
  for (const { repo, number } of pullRequests) {
    const entry = aliases.find((candidate) => candidate.repo === repo);
    if (entry) entry.numbers.push(number);
    else aliases.push({ repo, numbers: [number] });
  }

  const fragmentName = fragment.match(/^fragment (\w+)/)![1];
  const variables: Record<string, string> = {};
  const params: string[] = [];
  const fields: string[] = [];
  aliases.forEach(({ repo, numbers }, i) => {
    const [owner, name] = repo.split("/") as [string, string];
    variables[`owner${i}`] = owner;
    variables[`name${i}`] = name;
    params.push(`$owner${i}: String!`, `$name${i}: String!`);
    const lookups = numbers.map((number, j) => `    p${j}: pullRequest(number: ${number}) { ...${fragmentName} }`);
    fields.push(`  r${i}: repository(owner: $owner${i}, name: $name${i}) {\n${lookups.join("\n")}\n  }`);
  });

  const query = `query ${operation}(${params.join(", ")}) {
${fields.join("\n")}
}

${fragment}`;

  return { query, variables, aliases };
}

/**
 * Builds one GraphQL query for the comments, review threads and recent commits of the given PRs.
 * These are the expensive part of a PR, so they are fetched only for PRs that changed.
 */
export function buildDetailsQuery(pullRequests: { repo: string; number: number }[]): Lookup {
  return buildLookupQuery(
    "PullRequestDetails",
    `fragment pullRequestDetails on PullRequest {
  number
  comments(last: ${COMMENTS_PAGE_SIZE}) { nodes { ...comment } }
  reviewThreads(last: ${THREADS_PAGE_SIZE}) {
    nodes { id comments(last: ${THREAD_COMMENTS_PAGE_SIZE}) { nodes { ...comment } } }
  }
  history: commits(last: ${COMMITS_PAGE_SIZE}) { nodes { commit { oid committedDate } } }
}

fragment comment on Comment {
  id
  author { __typename login }
  createdAt
  body
}`,
    pullRequests,
  );
}

/** Builds one GraphQL query that looks up PRs by number to learn whether each was merged or closed. */
export function buildClosedQuery(pullRequests: { repo: string; number: number }[]): Lookup {
  return buildLookupQuery(
    "ClosedPullRequests",
    `fragment closedPullRequest on PullRequest {
  number
  title
  url
  author { login }
  state
  closedAt
}`,
    pullRequests,
  );
}
