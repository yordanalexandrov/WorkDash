import type { ClassifiedPullRequest } from "../api.js";
import { checkBadges, reviewBadges, statusBadges, unreadBadges } from "../badges.js";
import { age } from "../format.js";
import { BadgeView } from "./BadgeView.js";

function ExternalLink({ href, text }: { href: string; text: string }) {
  return (
    <a href={href} target="_blank" rel="noopener">
      {text}
    </a>
  );
}

export function PullRequestItem({ pr, onSeen }: { pr: ClassifiedPullRequest; onSeen: (pr: ClassifiedPullRequest) => void }) {
  const badges = [...statusBadges(pr), ...unreadBadges(pr), ...checkBadges(pr), ...reviewBadges(pr)];
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
        <span class="age" title={`отворен ${new Date(pr.createdAt).toLocaleString()}`}>
          {age(pr.createdAt)}
        </span>
        <button type="button" class="seen" title="Маркирай всичко досега като видяно" onClick={() => onSeen(pr)}>
          видях
        </button>
      </div>
    </li>
  );
}
