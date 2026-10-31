import type { ClosedPullRequest } from "../api.js";
import { age, shortRepo } from "../format.js";
import { prFlipKey } from "../motion.js";
import { Avatar } from "./Avatar.js";

/** A PR merged or closed within the configured window: lighter and dashed, with how it ended. `index` sets its entrance turn. */
export function ClosedCard({ pr, hue, index }: { pr: ClosedPullRequest; hue: number; index: number }) {
  const merged = pr.state === "MERGED";
  return (
    <div class="slot" data-flip={prFlipKey(pr)} style={{ "--ti": index }}>
      <article class="card closed" style={{ "--rh": hue }}>
        <div class="card-top">
          <span class="tag" title={pr.repo}>
            {shortRepo(pr.repo)}
          </span>
          <a class="num" href={pr.url} target="_blank" rel="noopener">{`#${pr.number}`}</a>
          <span class="age" title={`затворен ${new Date(pr.closedAt).toLocaleString()}`}>{`преди ${age(pr.closedAt)}`}</span>
        </div>
        <a class="title" href={pr.url} target="_blank" rel="noopener">
          {pr.title}
        </a>
        <div class="card-foot">
          <Avatar login={pr.author} title={`автор: ${pr.author}`} />
          <span class={`closed-st ${merged ? "merged" : "bad"}`}>{merged ? "🎉 merged" : "затворен без merge"}</span>
        </div>
      </article>
    </div>
  );
}
