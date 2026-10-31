import type { DashboardPullRequest } from "../api.js";
import { count, statusBadges } from "../badges.js";
import { age, shortRepo } from "../format.js";
import { askedReviewers, checkRings, mergeMark, reviewMarks } from "../marks.js";
import { Avatar } from "./Avatar.js";
import { Ring } from "./Ring.js";

type PrCardProps = {
  pr: DashboardPullRequest;
  /** The project hue: stripe, tint and repo tag. */
  hue: number;
  /** Marks the PR seen; only "Чака теб" cards get the button. */
  onSeen?: (pr: DashboardPullRequest) => void;
};

/** An open PR on the board, laid out as "Anatomy" in docs/design.md describes. */
export function PrCard({ pr, hue, onSeen }: PrCardProps) {
  const reason = onSeen && pr.reason ? statusBadges(pr)[0] : undefined;
  const merge = mergeMark(pr);
  const unread = pr.reason === "unread_comments" ? 0 : (pr.unreadComments ?? 0);
  return (
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
          <button type="button" class="seen" title="Маркирай всичко досега като видяно" onClick={() => onSeen(pr)}>
            видях
          </button>
        ) : null}
      </div>
    </article>
  );
}
