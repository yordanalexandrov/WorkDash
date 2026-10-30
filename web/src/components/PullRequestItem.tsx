import type { DashboardPullRequest } from "../api.js";
import { checkBadges, reviewBadges, statusBadges } from "../badges.js";
import { age } from "../format.js";
import { BadgeView } from "./BadgeView.js";

function ExternalLink({ href, text }: { href: string; text: string }) {
  return (
    <a href={href} target="_blank" rel="noopener">
      {text}
    </a>
  );
}

export function PullRequestItem({ pr }: { pr: DashboardPullRequest }) {
  const badges = [...statusBadges(pr), ...checkBadges(pr), ...reviewBadges(pr)];
  return (
    <li class="pr">
      <div class="pr-title">
        <span class="number">
          <ExternalLink href={pr.url} text={`#${pr.number}`} />
        </span>{" "}
        <ExternalLink href={pr.url} text={pr.title} />
      </div>
      <div class="pr-meta">
        <span class="author">{pr.author}</span>
        {badges.map((badge, index) => (
          <BadgeView key={index} badge={badge} />
        ))}
        {pr.jira.map(({ key, url }) => (
          <a key={key} class="badge jira" href={url} target="_blank" rel="noopener" title={`Jira ${key}`}>
            {key}
          </a>
        ))}
        <span class="age" title={`отворен ${new Date(pr.createdAt).toLocaleString()}`}>
          {age(pr.createdAt)}
        </span>
      </div>
    </li>
  );
}
