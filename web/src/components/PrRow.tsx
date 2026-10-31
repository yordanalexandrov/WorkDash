import { useRef } from "preact/hooks";
import type { DashboardPullRequest, Section } from "../api.js";
import { count, reasonBadge } from "../badges.js";
import { ACCENT } from "../board.js";
import { sheetOpeners } from "../detail.js";
import { age, sectionTitle, shortRepo } from "../format.js";
import { askedReviewers, checkRing, mergeMark, reviewMarks, sectionShort, urgency } from "../marks.js";
import { middleOf } from "../effects.js";
import { type Pos, prFlipKey, slideOut } from "../motion.js";
import { Avatar } from "./Avatar.js";
import { Ring } from "./Ring.js";
import { SectionPill } from "./SectionPill.js";

type PrRowProps = {
  pr: DashboardPullRequest;
  section: Section;
  /** The project hue: stripe, tint and repo tag. */
  hue: number;
  /** The row's place in the table, which sets its turn in the entrance cascade. */
  index: number;
  /** Marks the PR seen; only "Чака теб" rows get the button. */
  onSeen?: (pr: DashboardPullRequest) => Promise<void>;
  /** Opens the detail sheet, growing out of `from`. */
  onOpen(pr: DashboardPullRequest, from: HTMLElement): void;
  /** Hidden while its sheet is open, so the sheet looks like the row grown. */
  ghost: boolean;
  /** Sparks for "видях" at a point in the viewport. */
  onSpark?: (at: Pos) => void;
};

const none = <span class="dim">·</span>;

/** An open PR in the table: the facts of its card, one per column ("Anatomy" → Row in docs/design.md), with the same stripe and tint. */
export function PrRow({ pr, section, hue, index, onSeen, onOpen, ghost, onSpark }: PrRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reason = reasonBadge(pr);
  const merge = mergeMark(pr);
  const pulse = urgency(pr.reason);
  const unread = pr.unreadComments ?? 0;
  return (
    <div
      ref={ref}
      role="row"
      class={`trow opens${pulse ? ` ${pulse}` : ""}${pr.isDraft ? " draft" : ""}${ghost ? " ghost" : ""}`}
      data-flip={prFlipKey(pr)}
      style={{ "--rh": hue, "--ti": index }}
      tabIndex={0}
      {...sheetOpeners(() => onOpen(pr, ref.current!))}
    >
      <span class="tc">
        <SectionPill accent={ACCENT[section]} label={sectionShort(section)} title={sectionTitle(section)} />
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
        <a href={pr.url} target="_blank" rel="noopener" title={`${pr.title}\n${pr.headRefName}`}>
          {pr.isDraft ? <span class="dr">draft</span> : null}
          {pr.title}
        </a>
      </span>
      <span class="tc who">
        <Avatar login={pr.author} title={`автор: ${pr.author}`} />
        <span>{pr.author}</span>
      </span>
      <span class="tc">
        {reason ? (
          <span class={`reason ${reason.kind}`} title={reason.title ?? reason.text}>
            {reason.text}
          </span>
        ) : (
          none
        )}
      </span>
      <span class="tc c">{pr.ci ? <Ring ring={checkRing("CI", pr.ci)} bare /> : none}</span>
      <span class="tc c">{pr.sonar ? <Ring ring={checkRing("Sonar", pr.sonar)} bare /> : none}</span>
      <span class="tc">
        {merge ? (
          <span class={`ic ${merge.kind}`} title={merge.title}>
            {merge.text}
          </span>
        ) : (
          none
        )}
      </span>
      <span class="tc reviews">
        {reviewMarks(pr).map(({ login, kind, title }) => (
          <Avatar key={login} login={login} class={`rv ${kind}`} title={title} />
        ))}
        {askedReviewers(pr).map((login) => (
          <Avatar key={login} login={login} class="ask" title={`${login}: чака се review`} />
        ))}
      </span>
      <span class="tc c">
        {unread ? (
          <span class="ic pending" title={count(unread, "непрочетен коментар", "непрочетени коментара")}>
            {`💬${unread}`}
          </span>
        ) : (
          none
        )}
      </span>
      <span class="tc jira">
        {pr.jira.map(({ key, url }) => (
          <a key={key} href={url} target="_blank" rel="noopener" title={`Jira ${key}`}>
            {key}
          </a>
        ))}
      </span>
      <span class="tc r">
        <span class="age" title={`отворен ${new Date(pr.createdAt).toLocaleString()}`}>
          {age(pr.createdAt)}
        </span>
      </span>
      <span class="tc r">
        <span class="age" title={`последна активност ${new Date(pr.updatedAt).toLocaleString()}`}>
          {age(pr.updatedAt)}
        </span>
      </span>
      <span class="tc r">
        {onSeen ? (
          <button
            type="button"
            class="seen"
            title="Маркирай всичко досега като видяно"
            onClick={(event) => {
              if (!ref.current) return;
              // From the button, near the row's right end, where the eye is.
              onSpark?.(middleOf(event.currentTarget.getBoundingClientRect()));
              slideOut(ref.current, () => onSeen(pr), "row");
            }}
          >
            видях
          </button>
        ) : null}
      </span>
      <span class="card-wrap" aria-hidden="true" />
    </div>
  );
}
