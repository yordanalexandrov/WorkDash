import { useRef } from "preact/hooks";
import type { DashboardPullRequest } from "../api.js";
import { count, reasonBadge } from "../badges.js";
import { age, shortRepo } from "../format.js";
import { askedReviewers, checkRings, mergeMark, reviewMarks, unreadCount, urgency } from "../marks.js";
import { slideOut } from "../motion.js";
import { Avatar } from "./Avatar.js";
import { Ring } from "./Ring.js";

type PrCardProps = {
  pr: DashboardPullRequest;
  /** The project hue: stripe, tint and repo tag. */
  hue: number;
  /** The card's place in its column, which sets its turn in the entrance cascade. */
  index: number;
  /** Marks the PR seen; only "Чака теб" cards get the button. */
  onSeen?: (pr: DashboardPullRequest) => Promise<void>;
};

/**
 * An open PR on the board, laid out as "Anatomy" in docs/design.md describes. The slot around the card is what moves
 * (entrance, FLIP, leaving on "видях"); a "Чака теб" card pulses as urgently as its reason.
 */
export function PrCard({ pr, hue, index, onSeen }: PrCardProps) {
  const slot = useRef<HTMLDivElement>(null);
  const reason = reasonBadge(pr);
  const merge = mergeMark(pr);
  const unread = unreadCount(pr);
  const pulse = urgency(pr.reason);
  // The card leaves first, then the PR is marked seen; if that fails, the card comes back.
  const leave = (seen: NonNullable<PrCardProps["onSeen"]>) => {
    const exit = slot.current && slideOut(slot.current);
    (exit ? exit.finished : Promise.resolve())
      .then(() => seen(pr))
      .catch(() => exit?.cancel());
  };
  return (
    <div ref={slot} class={`slot${pulse ? ` ${pulse}` : ""}`} data-flip={`pr:${pr.repo}#${pr.number}`} style={{ "--ti": index }}>
      <article class={`card${pr.isDraft ? " draft" : ""}`} style={{ "--rh": hue }} tabIndex={0}>
        <div class="card-top">
          <span class="tag" title={pr.repo}>
            {shortRepo(pr.repo)}
          </span>
          <a class="num" href={pr.url} target="_blank" rel="noopener">{`#${pr.number}`}</a>
          <span class="age" title={`отворен ${new Date(pr.createdAt).toLocaleString()} · обновен преди ${age(pr.updatedAt)}`}>
            {age(pr.createdAt)}
          </span>
        </div>
        {reason ? (
          <span class={`reason ${reason.kind}`} title={reason.title}>
            {reason.text}
          </span>
        ) : null}
        <a class="title" href={pr.url} target="_blank" rel="noopener">
          {pr.isDraft ? `[draft] ${pr.title}` : pr.title}
        </a>
        {pr.jira.length ? (
          <div class="jira">
            {pr.jira.map(({ key, url }) => (
              <a key={key} href={url} target="_blank" rel="noopener" title={`Jira ${key}`}>
                {key}
              </a>
            ))}
          </div>
        ) : null}
        <div class="card-foot">
          <Avatar login={pr.author} title={`автор: ${pr.author}`} />
          <div class="icons">
            {checkRings(pr).map((ring) => (
              <Ring key={ring.label} ring={ring} />
            ))}
            {merge ? (
              <span class={`ic ${merge.kind}`} title={merge.title}>
                {merge.text}
              </span>
            ) : null}
            {unread ? (
              <span class="ic pending" title={count(unread, "непрочетен коментар", "непрочетени коментара")}>
                {`💬 ${unread}`}
              </span>
            ) : null}
          </div>
          <div class="reviews">
            {reviewMarks(pr).map(({ login, kind, title }) => (
              <Avatar key={login} login={login} class={`rv ${kind}`} title={title} />
            ))}
            {askedReviewers(pr).map((login) => (
              <Avatar key={login} login={login} class="ask" title={`${login}: чака се review`} />
            ))}
          </div>
          {onSeen ? (
            <button type="button" class="seen" title="Маркирай всичко досега като видяно" onClick={() => leave(onSeen)}>
              видях
            </button>
          ) : null}
        </div>
      </article>
    </div>
  );
}
