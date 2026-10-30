import type { ClosedPullRequest } from "../api.js";
import { closedBadge } from "../badges.js";
import { age } from "../format.js";
import { BadgeView } from "./BadgeView.js";

/** The PRs merged or closed within the configured window, so they do not vanish without a trace. */
export function RecentlyClosedView({ pullRequests }: { pullRequests: ClosedPullRequest[] }) {
  return (
    <section id="recently-closed" class="card">
      <h2>{`Наскоро затворени (${pullRequests.length})`}</h2>
      <ul>
        {pullRequests.map((pr) => (
          <li key={`${pr.repo}#${pr.number}`} class="pr">
            <div class="pr-title">
              <span class="number">
                <a href={pr.url} target="_blank" rel="noopener">{`${pr.repo}#${pr.number}`}</a>
              </span>{" "}
              <a href={pr.url} target="_blank" rel="noopener">
                {pr.title}
              </a>
            </div>
            <div class="pr-meta">
              <span class="author">{pr.author}</span>
              <BadgeView badge={closedBadge(pr)} />
              <span class="age" title={`затворен ${new Date(pr.closedAt).toLocaleString()}`}>
                {age(pr.closedAt)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
