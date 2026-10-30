/**
 * Builds one GraphQL query that fetches the viewer and the open PRs of every repo,
 * one `rN: repository(...)` alias per repo, so a poll costs a single request.
 */
// GitHub prices a query by the largest number of nodes it could return. With comments, review
// threads and commits per PR, 50 PRs per repo is about 18 points, so 4 repos polled every minute
// stay under the 5,000 points an hour; 100 PRs would not.
export const PAGE_SIZE = 50;
const REVIEWERS_PAGE_SIZE = 20;
const CHECKS_PAGE_SIZE = 50;
const COMMENTS_PAGE_SIZE = 30;
const THREADS_PAGE_SIZE = 30;
const THREAD_COMMENTS_PAGE_SIZE = 10;
const COMMITS_PAGE_SIZE = 20;

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
      comments(last: ${COMMENTS_PAGE_SIZE}) { nodes { ...comment } }
      reviewThreads(last: ${THREADS_PAGE_SIZE}) {
        nodes { id comments(last: ${THREAD_COMMENTS_PAGE_SIZE}) { nodes { ...comment } } }
      }
      history: commits(last: ${COMMITS_PAGE_SIZE}) { nodes { commit { oid committedDate } } }
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
}

fragment comment on Comment {
  id
  author { __typename login }
  createdAt
  body
}`;

  return { query, variables };
}
