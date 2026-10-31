import type { ClosedPullRequest } from "../api.js";
import { age, shortRepo } from "../format.js";
import { prFlipKey } from "../motion.js";
import { Avatar } from "./Avatar.js";
import { SectionPill } from "./SectionPill.js";

/** A PR merged or closed within the configured window, as a row: lighter and dashed, how it ended where the checks would be. */
export function ClosedRow({ pr, hue, index }: { pr: ClosedPullRequest; hue: number; index: number }) {
  const merged = pr.state === "MERGED";
  return (
    <div role="row" class="trow closedrow" data-flip={prFlipKey(pr)} style={{ "--rh": hue, "--ti": index }}>
      <span class="tc">
        <SectionPill accent={merged ? "var(--merged)" : "var(--bad)"} label={merged ? "merged" : "затворен"} />
      </span>
      <span class="tc">
        <span class="tag" title={pr.repo}>
          {shortRepo(pr.repo)}
        </span>
      </span>
      <span class="tc r">
        <a class="num" href={pr.url} target="_blank" rel="noopener">{`#${pr.number}`}</a>
      </span>
      <span class="tc tt">
        <a href={pr.url} target="_blank" rel="noopener" title={pr.title}>
          {pr.title}
        </a>
      </span>
      <span class="tc who">
        <Avatar login={pr.author} title={`автор: ${pr.author}`} />
        <span>{pr.author}</span>
      </span>
      <span class="tc span7">
        <span class={`closed-st ${merged ? "merged" : "bad"}`}>{merged ? "🎉 merged" : "затворен без merge"}</span>
      </span>
      <span class="tc r span2">
        <span class="age" title={`затворен ${new Date(pr.closedAt).toLocaleString()}`}>{`преди ${age(pr.closedAt)}`}</span>
      </span>
      <span class="tc" />
      <span class="card-wrap" aria-hidden="true" />
    </div>
  );
}
