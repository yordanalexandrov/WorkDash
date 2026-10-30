import type { SectionOfPullRequests } from "./api.js";

/** One repo's PRs, in the sections they fall into. */
export type RepoCard = { repo: string; sections: SectionOfPullRequests[] };

/**
 * Regroups the API's sections into one card per repo. Cards are ordered by the most urgent
 * section they hold, so a repo with something waiting on me comes first.
 */
export function groupByRepo(sections: SectionOfPullRequests[]): RepoCard[] {
  const cards = new Map<string, RepoCard & { urgency: number }>();
  sections.forEach(({ section, pullRequests }, urgency) => {
    for (const pr of pullRequests) {
      let card = cards.get(pr.repo);
      if (!card) cards.set(pr.repo, (card = { repo: pr.repo, urgency, sections: [] }));
      let group = card.sections.find((candidate) => candidate.section === section);
      if (!group) card.sections.push((group = { section, pullRequests: [] }));
      group.pullRequests.push(pr);
    }
  });
  return [...cards.values()]
    .sort((a, b) => a.urgency - b.urgency || a.repo.localeCompare(b.repo))
    .map(({ repo, sections }) => ({ repo, sections }));
}
