import { count } from "../badges.js";
import { cleanBody, latest } from "../detail.js";
import { age } from "../format.js";
import { cardLabels } from "../issueBoard.js";
import { isClosed, issueDates, type ShownIssue } from "../issueDetail.js";
import { Avatar } from "./Avatar.js";
import { BlockedChip, ClosedAsMark, LabelChips, LinkedPrs, MeChip, MilestoneChip, StagePill, SubIssuesChip } from "./IssueMarks.js";
import { Markdown } from "./Markdown.js";

/** How many comments the sheet lists, the latest first. */
const LATEST = 6;

type IssueDetailProps = {
  /** Open, in its stage, or closed within the window. */
  issue: ShownIssue;
  /** The project hue of the repo tag. */
  hue: number;
  /** Whether it is assigned to me: the same quiet "теб" as on its card. */
  mine: boolean;
  /** The issue has left the board (closed before the window, or no longer among the fetched ones); the sheet shows its last data. */
  gone: boolean;
};

/**
 * Everything about one issue ("Anatomy" → Detail sheet in docs/design.md): every fact of its card and row, with its stage
 * as a pill and every other label (a closed one: how it was closed and all its labels), plus the description, the latest comments and when it was opened, updated and closed.
 * Texts are markdown.
 */
export function IssueDetail({ issue, hue, mine, gone }: IssueDetailProps) {
  const body = cleanBody(issue.body);
  const comments = latest(issue.latestComments, LATEST, (comment) => comment.createdAt);
  return (
    <div class="detail" style={{ "--rh": hue }}>
      <header>
        <div class="card-top">
          <span class="tag" title={issue.repo}>
            {issue.repo}
          </span>
          <a class="num" href={issue.url} target="_blank" rel="noopener">{`#${issue.number}`}</a>
          {mine ? <MeChip /> : null}
          <span class="age">{issueDates(issue)}</span>
        </div>
        <h2>
          <a href={issue.url} target="_blank" rel="noopener">
            {issue.title}
          </a>
        </h2>
        <div class="meta">
          {isClosed(issue) ? <ClosedAsMark closedAs={issue.closedAs} /> : <StagePill stage={issue.stage} />}
          <LabelChips labels={isClosed(issue) ? issue.labels : cardLabels(issue)} />
          <MilestoneChip issue={issue} />
          <LinkedPrs issue={issue} />
          <SubIssuesChip issue={issue} />
          {isClosed(issue) ? null : <BlockedChip issue={issue} />}
          {issue.comments ? <span class="ic muted">{`💬 ${count(issue.comments, "коментар", "коментара")}`}</span> : null}
        </div>
        <div class="meta people">
          <span class="person">
            <Avatar login={issue.author} title={`автор: ${issue.author}`} />
            {`${issue.author} автор`}
          </span>
          {issue.assignees.map((login) => (
            <span key={login} class="person">
              <Avatar login={login} title={`назначен: ${login}`} />
              {`${login} назначен`}
            </span>
          ))}
        </div>
      </header>
      {gone ? <p class="gone">Този issue вече не е на таблото.</p> : null}
      <div class="body">
        <section class="pane">
          <h3>Описание</h3>
          {body ? <Markdown text={body} class="desc" /> : <p class="none">Няма описание</p>}
        </section>
        <section class="pane">
          <h3>Последни коментари</h3>
          {comments.length ? (
            comments.map((comment) => (
              <div key={comment.id} class="item">
                <Avatar login={comment.author} />
                <div>
                  <span class="who">{comment.author}</span>
                  <span class="when">{`преди ${age(comment.createdAt)}`}</span>
                  <Markdown text={comment.body} class="txt" />
                </div>
              </div>
            ))
          ) : (
            <p class="none">Няма коментари</p>
          )}
        </section>
      </div>
      <footer>
        <a href={issue.url} target="_blank" rel="noopener">
          Отвори в GitHub ↗
        </a>
      </footer>
    </div>
  );
}
