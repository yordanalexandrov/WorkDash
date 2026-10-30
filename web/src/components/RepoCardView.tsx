import type { ClassifiedPullRequest } from "../api.js";
import { sectionTitle } from "../format.js";
import type { RepoCard } from "../group.js";
import { PullRequestItem } from "./PullRequestItem.js";

export function RepoCardView({ card, onSeen }: { card: RepoCard; onSeen: (pr: ClassifiedPullRequest) => void }) {
  return (
    <article class="card">
      <h2>{card.repo}</h2>
      {card.sections.map(({ section, pullRequests }) => (
        <section key={section} class={`group ${section}`}>
          <h3>{`${sectionTitle(section)} (${pullRequests.length})`}</h3>
          <ul>
            {pullRequests.map((pr) => (
              <PullRequestItem key={pr.number} pr={pr} onSeen={onSeen} />
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
