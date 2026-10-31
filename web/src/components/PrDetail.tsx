import { pushedAt } from "../../../src/domain/types.js";
import type { DashboardPullRequest, Section } from "../api.js";
import { count, reasonBadge } from "../badges.js";
import { ACCENT } from "../board.js";
import { cleanBody, latest } from "../detail.js";
import { age, sectionTitle } from "../format.js";
import { askedReviewers, checkRings, mergeMark, reviewMarks, unreadCount } from "../marks.js";
import { Avatar } from "./Avatar.js";
import { Ring } from "./Ring.js";
import { SectionPill } from "./SectionPill.js";

/** How many comments and commits the sheet lists; the server sends only the latest anyway. */
const LATEST = 6;

type PrDetailProps = {
  pr: DashboardPullRequest;
  section: Section;
  /** The project hue of the repo tag. */
  hue: number;
  /** The PR has left the open ones (merged, closed or no longer mine); the sheet shows its last data. */
  gone: boolean;
  /** Marks the PR seen, from its button; only for a PR in "Чака теб". */
  onSeen?: (from: HTMLElement) => void;
};

/**
 * Everything about one open PR ("Anatomy" → Detail sheet in docs/design.md): every fact of its card and row, plus the
 * description, the latest comments and commits, the reviews with their times and the branch. Texts are plain text.
 */
export function PrDetail({ pr, section, hue, gone, onSeen }: PrDetailProps) {
  const reason = reasonBadge(pr);
  const merge = mergeMark(pr);
  const unread = unreadCount(pr);
  const body = cleanBody(pr.body);
  const comments = latest(pr.comments, LATEST, (comment) => comment.createdAt);
  const commits = latest(pr.commits, LATEST, pushedAt);
  return (
    <div class="detail" style={{ "--rh": hue }}>
      <header>
        <div class="card-top">
          <span class="tag" title={pr.repo}>
            {pr.repo}
          </span>
          <a class="num" href={pr.url} target="_blank" rel="noopener">{`#${pr.number}`}</a>
          <span class="age">{`отворен преди ${age(pr.createdAt)} · обновен преди ${age(pr.updatedAt)}`}</span>
        </div>
        <h2>
          <a href={pr.url} target="_blank" rel="noopener">
            {pr.isDraft ? `[draft] ${pr.title}` : pr.title}
          </a>
        </h2>
        <div class="meta">
          <SectionPill accent={ACCENT[section]} label={sectionTitle(section)} />
          {reason ? (
            <span class={`reason ${reason.kind}`} title={reason.title}>
              {reason.text}
            </span>
          ) : null}
          {checkRings(pr).map((ring) => (
            <Ring key={ring.label} ring={ring} />
          ))}
          {merge ? (
            <span class={`ic ${merge.kind}`} title={merge.title}>
              {merge.text}
            </span>
          ) : null}
          {unread ? <span class="ic pending">{`💬 ${count(unread, "непрочетен коментар", "непрочетени коментара")}`}</span> : null}
          <code class="branch" title="branch">
            {pr.headRefName}
          </code>
          {pr.jira.length ? (
            <span class="jira">
              {pr.jira.map(({ key, url }) => (
                <a key={key} href={url} target="_blank" rel="noopener" title={`Jira ${key}`}>
                  {key}
                </a>
              ))}
            </span>
          ) : null}
        </div>
        <div class="meta people">
          <span class="person">
            <Avatar login={pr.author} title={`автор: ${pr.author}`} />
            {pr.author}
          </span>
          {reviewMarks(pr).map(({ login, kind, title, verb, submittedAt }) => (
            <span key={login} class="person">
              <Avatar login={login} class={`rv ${kind}`} title={title} />
              {`${login} ${verb} · ${age(submittedAt)}`}
            </span>
          ))}
          {askedReviewers(pr).map((login) => (
            <span key={login} class="person">
              <Avatar login={login} class="ask" title={`${login}: чака се review`} />
              {`${login} чака се`}
            </span>
          ))}
        </div>
      </header>
      {gone ? <p class="gone">Този PR вече не е на таблото.</p> : null}
      <div class="body">
        <section class="pane">
          <h3>Описание</h3>
          {body ? <p class="desc">{body}</p> : <p class="none">Няма описание</p>}
        </section>
        <section class="pane">
          <h3>Последни коментари</h3>
          {comments.length ? (
            comments.map((comment) => (
              <div key={comment.id} class="item">
                <Avatar login={comment.author} />
                <div>
                  <span class="who">{comment.author}</span>
                  <span class="when">{`преди ${age(comment.createdAt)}${comment.thread ? " · в review нишка" : ""}`}</span>
                  <p class="txt">{comment.body}</p>
                </div>
              </div>
            ))
          ) : (
            <p class="none">Няма коментари</p>
          )}
          <h3>Commits</h3>
          {commits.length ? (
            commits.map((commit) => (
              <div key={commit.oid} class="item">
                <code>{commit.oid.slice(0, 7)}</code>
                <span class="when">{`преди ${age(pushedAt(commit))}`}</span>
              </div>
            ))
          ) : (
            <p class="none">Няма</p>
          )}
        </section>
      </div>
      <footer>
        <a href={pr.url} target="_blank" rel="noopener">
          Отвори в GitHub ↗
        </a>
        {onSeen && !gone ? (
          <button type="button" class="primary" title="Маркирай всичко досега като видяно" onClick={(event) => onSeen(event.currentTarget)}>
            видях
          </button>
        ) : null}
      </footer>
    </div>
  );
}
