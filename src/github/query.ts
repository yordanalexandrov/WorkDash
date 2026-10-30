/**
 * Builds one GraphQL query that fetches the viewer and the open PRs of every repo,
 * one `rN: repository(...)` alias per repo, so a poll costs a single request.
 */
export const PAGE_SIZE = 100;
const REVIEWERS_PAGE_SIZE = 20;

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
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    }
    pageInfo { hasNextPage }
  }
}`;

  return { query, variables };
}
