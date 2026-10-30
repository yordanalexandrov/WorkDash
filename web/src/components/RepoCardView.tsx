import { sectionTitle } from "../format.js";
import type { RepoCard } from "../group.js";
import { PullRequestItem } from "./PullRequestItem.js";

export function RepoCardView({ card }: { card: RepoCard }) {
  return (
    <article class="card">
      <h2>{card.repo}</h2>
      {card.sections.map(({ section, pullRequests }) => (
        <section key={section} class={`group ${section}`}>
          <h3>{`${sectionTitle(section)} (${pullRequests.length})`}</h3>
          <ul>
            {pullRequests.map((pr) => (
              <PullRequestItem key={pr.number} pr={pr} />
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
