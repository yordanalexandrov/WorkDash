// PROTOTYPE: "Inbox" layout, an email client's three panes: sections, one urgency-sorted list, the selected PR in full.
import { Fragment } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { CiState, Comment, MergeStateStatus, ReviewState } from "../../../src/domain/types.js";
import { pushedAt } from "../../../src/domain/types.js";
import type { ClosedPullRequest, DashboardPullRequest, Section } from "../../src/api.js";
import { type Badge, statusBadges } from "../../src/badges.js";
import { age, sectionTitle } from "../../src/format.js";
import type { VariantProps } from "../types.js";

export const name = "Пощенска кутия";

type Filter = { kind: "all" } | { kind: "section"; section: Section } | { kind: "closed" };
type Row = { pr: DashboardPullRequest; section: Section };

const key = (pr: { repo: string; number: number }) => `${pr.repo}#${pr.number}`;
const repoName = (repo: string) => repo.slice(repo.indexOf("/") + 1);

const SECTION_CHIPS: Record<Section, [string, string]> = {
  waiting_on_me: ["за теб", "bad"],
  free_for_review: ["свободен", "info"],
  ready_to_merge: ["за merge", "ok"],
  waiting_on_others: ["чака други", "muted"],
  team: ["екип", "muted"],
};

/** The list's chip: why it waits on me, else which section it sits in. */
function chip(row: Row): Badge {
  const reason = row.pr.reason ? statusBadges(row.pr)[0] : undefined;
  if (reason) return reason;
  const [text, kind] = SECTION_CHIPS[row.section];
  return { text, kind };
}

const CHECK: Record<CiState, [string, string]> = {
  SUCCESS: ["минава", "ok"],
  FAILURE: ["пада", "bad"],
  ERROR: ["грешка", "bad"],
  PENDING: ["върви", "pending"],
  EXPECTED: ["чака", "pending"],
};

const MERGE: Record<MergeStateStatus, [string, string]> = {
  CLEAN: ["може", "ok"],
  HAS_HOOKS: ["може", "ok"],
  UNSTABLE: ["може, с червени незадължителни", "pending"],
  BEHIND: ["трябва rebase", "pending"],
  BLOCKED: ["блокиран от правилата", "muted"],
  DIRTY: ["конфликт", "bad"],
  DRAFT: ["draft", "muted"],
  UNKNOWN: ["неясно", "muted"],
};

const REVIEW: Record<ReviewState, [string, string]> = {
  APPROVED: ["одобри", "ok"],
  CHANGES_REQUESTED: ["иска промени", "bad"],
  COMMENTED: ["коментира", "muted"],
  DISMISSED: ["отхвърлено", "muted"],
};

/** Markdown and HTML down to readable plain text. */
function plain(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, " [код] ")
    .replace(/<[^>]+>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+\[( |x)\]\s*/gim, "• ")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clip(text: string, max: number): [string, boolean] {
  return text.length > max ? [text.slice(0, max).replace(/\s+\S*$/, "") + "…", true] : [text, false];
}

function Chip({ badge }: { badge: Badge }) {
  return (
    <span class={`chip ${badge.kind}`} title={badge.title}>
      {badge.text}
    </span>
  );
}

const shortTime = (iso: string) =>
  new Date(iso).toLocaleString("bg-BG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function View({ state, onSeen }: VariantProps) {
  // Ages are measured against the snapshot, so a frozen prototype reads like the moment it was taken.
  const now = useMemo(() => (state.fetchedAt ? new Date(state.fetchedAt) : new Date()), [state.fetchedAt]);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [repo, setRepo] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const lastIndex = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const allRows: Row[] = state.sections.flatMap(({ section, pullRequests }) => pullRequests.map((pr) => ({ pr, section })));
  const repos = [...new Set([...allRows.map((row) => row.pr.repo), ...state.recentlyClosed.map((pr) => pr.repo)])].sort();

  const inFilter = (row: Row) => filter.kind === "all" || (filter.kind === "section" && row.section === filter.section);
  const rows = filter.kind === "closed" ? [] : allRows.filter((row) => inFilter(row) && (!repo || row.pr.repo === repo));
  const closed = filter.kind === "closed" ? state.recentlyClosed.filter((pr) => !repo || pr.repo === repo) : [];
  const keys = filter.kind === "closed" ? closed.map(key) : rows.map((row) => key(row.pr));

  // Keep a selection: the same PR if it is still listed, else whatever took its place.
  const current = selected && keys.includes(selected) ? selected : (keys[Math.min(lastIndex.current, keys.length - 1)] ?? null);
  const index = current ? keys.indexOf(current) : -1;
  if (index >= 0) lastIndex.current = index;
  const row = rows.find((candidate) => key(candidate.pr) === current);
  const closedPr = closed.find((candidate) => key(candidate) === current);

  const select = (next: string | null) => setSelected(next);

  useEffect(() => {
    listRef.current?.querySelector(".row.sel")?.scrollIntoView({ block: "nearest" });
  }, [current]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        const next = Math.max(0, Math.min(keys.length - 1, index + (event.key === "j" ? 1 : -1)));
        select(keys[next] ?? null);
      } else if (event.key === "Enter") {
        const url = row?.pr.url ?? closedPr?.url;
        if (url) window.open(url, "_blank", "noopener");
      } else if (event.key === "s" && row?.section === "waiting_on_me") {
        onSeen(row.pr);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const choose = (next: Filter) => {
    setFilter(next);
    setSelected(null);
    lastIndex.current = 0;
  };
  const active = (candidate: Filter) =>
    candidate.kind === filter.kind && (candidate.kind !== "section" || filter.kind !== "section" || candidate.section === filter.section);
  const repoCount = (name: string) =>
    filter.kind === "closed"
      ? state.recentlyClosed.filter((pr) => pr.repo === name).length
      : allRows.filter((r) => r.pr.repo === name && inFilter(r)).length;

  return (
    <div class="vA">
      <style>{CSS}</style>
      <nav class="nav">
        <div class="brand">
          WorkDash
          <span class="who">{state.viewer}</span>
        </div>
        <button class={`nav-item ${active({ kind: "all" }) ? "on" : ""}`} onClick={() => choose({ kind: "all" })}>
          <span>Всички</span>
          <span class="count">{allRows.length}</span>
        </button>
        {state.sections.map(({ section, pullRequests }) => (
          <button
            key={section}
            class={`nav-item ${active({ kind: "section", section }) ? "on" : ""} ${section === "waiting_on_me" && pullRequests.length ? "hot" : ""}`}
            onClick={() => choose({ kind: "section", section })}
          >
            <span>{sectionTitle(section)}</span>
            <span class="count">{pullRequests.length || ""}</span>
          </button>
        ))}
        <button class={`nav-item ${active({ kind: "closed" }) ? "on" : ""}`} onClick={() => choose({ kind: "closed" })}>
          <span>Наскоро затворени</span>
          <span class="count">{state.recentlyClosed.length || ""}</span>
        </button>
        <div class="nav-label">Repo-та</div>
        {repos.map((name) => (
          <button
            key={name}
            class={`nav-item repo ${repo === name ? "on" : ""}`}
            title={name}
            onClick={() => {
              setRepo(repo === name ? null : name);
              setSelected(null);
              lastIndex.current = 0;
            }}
          >
            <span class="repo-name">{repoName(name)}</span>
            <span class="count">{repoCount(name) || ""}</span>
          </button>
        ))}
        <div class="keys">
          <kbd>j</kbd>
          <kbd>k</kbd> движение · <kbd>↵</kbd> GitHub · <kbd>s</kbd> видях
        </div>
        {state.fetchedAt ? <div class="fresh">poll в {new Date(state.fetchedAt).toLocaleTimeString("bg-BG")}</div> : null}
      </nav>

      <div class="list" ref={listRef}>
        {filter.kind === "closed"
          ? closed.map((pr) => (
              <div key={key(pr)} class={`row ${key(pr) === current ? "sel" : ""}`} onClick={() => select(key(pr))}>
                <span class={`chip ${pr.state === "MERGED" ? "merged" : "bad"}`}>{pr.state === "MERGED" ? "merged" : "затворен"}</span>
                <span class="repo-tag">{repoName(pr.repo)}</span>
                <a class="title" href={pr.url} target="_blank" rel="noopener" onClick={(event) => event.stopPropagation()}>
                  {pr.title}
                </a>
                <span class="age">{age(pr.closedAt, now)}</span>
              </div>
            ))
          : rows.map((r, i) => (
              <Fragment key={key(r.pr)}>
                {filter.kind === "all" && (i === 0 || rows[i - 1]!.section !== r.section) ? (
                  <div class="divider">{sectionTitle(r.section)}</div>
                ) : null}
                <div
                  class={`row ${key(r.pr) === current ? "sel" : ""} ${r.section === "waiting_on_me" ? "mine" : ""}`}
                  onClick={() => select(key(r.pr))}
                >
                  <Chip badge={chip(r)} />
                  <span class="repo-tag">{repoName(r.pr.repo)}</span>
                  <a class="title" href={r.pr.url} target="_blank" rel="noopener" onClick={(event) => event.stopPropagation()}>
                    {r.pr.isDraft ? <span class="draft">draft · </span> : null}
                    {r.pr.title}
                  </a>
                  <span class="age" title={`обновен ${shortTime(r.pr.updatedAt)}`}>
                    {age(r.pr.updatedAt, now)}
                  </span>
                </div>
              </Fragment>
            ))}
        {keys.length === 0 ? <div class="empty">Нищо тук. Чисто.</div> : null}
      </div>

      <main class="detail">
        {row ? (
          <Detail row={row} now={now} onSeen={onSeen} />
        ) : closedPr ? (
          <ClosedDetail pr={closedPr} now={now} />
        ) : (
          <div class="empty">Избери PR от списъка.</div>
        )}
      </main>
    </div>
  );
}

function ClosedDetail({ pr, now }: { pr: ClosedPullRequest; now: Date }) {
  return (
    <article>
      <div class="crumb">
        {pr.repo} · #{pr.number}
      </div>
      <h2>
        <a href={pr.url} target="_blank" rel="noopener">
          {pr.title}
        </a>
      </h2>
      <p class="meta">
        {pr.author} · {pr.state === "MERGED" ? "merge-нат" : "затворен без merge"} преди {age(pr.closedAt, now)} ({shortTime(pr.closedAt)})
      </p>
    </article>
  );
}

function Detail({ row, now, onSeen }: { row: Row; now: Date; onSeen: VariantProps["onSeen"] }) {
  const { pr, section } = row;
  const [fullBody, setFullBody] = useState(false);
  const [allComments, setAllComments] = useState(false);
  const body = plain(pr.body);
  const [shownBody, bodyClipped] = fullBody ? [body, true] : clip(body, 600);
  const newestFirst = [...pr.comments].reverse();
  const comments = allComments ? newestFirst : newestFirst.slice(0, 4);
  const merge = MERGE[pr.mergeable === "CONFLICTING" ? "DIRTY" : pr.mergeStateStatus];
  const reviewed = new Set(pr.reviews.map((review) => review.author.toLowerCase()));
  const pending = pr.requestedReviewers.filter((login) => !reviewed.has(login.toLowerCase()));

  return (
    <article key={key(pr)}>
      <div class="crumb">
        {pr.repo} · #{pr.number} · {sectionTitle(section)}
      </div>
      <h2>
        <a href={pr.url} target="_blank" rel="noopener">
          {pr.title}
        </a>
      </h2>
      <p class="meta">
        {pr.author} · <code>{pr.headRefName}</code> · отворен преди {age(pr.createdAt, now)} · обновен преди {age(pr.updatedAt, now)}
      </p>
      <div class="actions">
        {statusBadges(pr).map((badge) => (
          <Chip badge={badge} />
        ))}
        <span class="spacer" />
        {pr.jira.map((link) => (
          <a class="jira" href={link.url} target="_blank" rel="noopener">
            {link.key}
          </a>
        ))}
        <a class="btn" href={pr.url} target="_blank" rel="noopener">
          GitHub <kbd>↵</kbd>
        </a>
        {section === "waiting_on_me" ? (
          <button class="btn primary" onClick={() => onSeen(pr)}>
            видях <kbd>s</kbd>
          </button>
        ) : null}
      </div>

      <dl class="facts">
        <div>
          <dt>CI</dt>
          <dd>{pr.ci ? <span class={`dot ${CHECK[pr.ci][1]}`}>{CHECK[pr.ci][0]}</span> : <span class="dot muted">няма</span>}</dd>
        </div>
        <div>
          <dt>Sonar</dt>
          <dd>{pr.sonar ? <span class={`dot ${CHECK[pr.sonar][1]}`}>{CHECK[pr.sonar][0]}</span> : <span class="dot muted">—</span>}</dd>
        </div>
        <div>
          <dt>Merge</dt>
          <dd>
            <span class={`dot ${merge[1]}`}>{merge[0]}</span>
          </dd>
        </div>
        <div>
          <dt>Решение</dt>
          <dd>
            {pr.reviewDecision === "APPROVED" ? (
              <span class="dot ok">одобрен</span>
            ) : pr.reviewDecision === "CHANGES_REQUESTED" ? (
              <span class="dot bad">искат се промени</span>
            ) : (
              <span class="dot muted">{pr.reviewDecision ? "чака review" : "—"}</span>
            )}
          </dd>
        </div>
      </dl>

      <section>
        <h3>Review-та</h3>
        {pr.reviews.length || pending.length ? (
          <ul class="people">
            {pr.reviews.map((review) => (
              <li>
                <span class={`dot ${REVIEW[review.state][1]}`}>{REVIEW[review.state][0]}</span>
                <b>{review.author}</b>
                <span class="when">{age(review.submittedAt, now)}</span>
              </li>
            ))}
            {pending.map((login) => (
              <li>
                <span class="dot pending">поискан</span>
                <b>{login}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p class="none">Още никой.</p>
        )}
      </section>

      <section>
        <h3>Описание</h3>
        {body ? (
          <>
            <p class="body">{shownBody}</p>
            {bodyClipped ? (
              <button class="more" onClick={() => setFullBody(!fullBody)}>
                {fullBody ? "по-кратко" : "цялото описание"}
              </button>
            ) : null}
          </>
        ) : (
          <p class="none">Без описание.</p>
        )}
      </section>

      <section>
        <h3>
          Коментари <span class="n">{pr.comments.length || ""}</span>
          {pr.unreadComments ? <span class="chip bad">{pr.unreadComments} непрочетени</span> : null}
        </h3>
        {comments.length ? (
          <ol class="comments">
            {comments.map((comment) => (
              <CommentView comment={comment} now={now} />
            ))}
          </ol>
        ) : (
          <p class="none">Няма коментари от хора.</p>
        )}
        {newestFirst.length > 4 ? (
          <button class="more" onClick={() => setAllComments(!allComments)}>
            {allComments ? "само последните" : `още ${newestFirst.length - 4}`}
          </button>
        ) : null}
      </section>

      <section>
        <h3>
          Commit-и <span class="n">{pr.commits.length || ""}</span>
          {pr.reReview?.newCommits ? <span class="chip bad">{pr.reReview.newCommits} нови след review-то ти</span> : null}
        </h3>
        <ul class="commits">
          {[...pr.commits].reverse().map((commit) => (
            <li>
              <a href={`${pr.url}/commits/${commit.oid}`} target="_blank" rel="noopener">
                <code>{commit.oid.slice(0, 7)}</code>
              </a>
              <span class="when">преди {age(pushedAt(commit), now)}</span>
              <span class="when">{shortTime(pushedAt(commit))}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

function CommentView({ comment, now }: { comment: Comment; now: Date }) {
  const [open, setOpen] = useState(false);
  const text = plain(comment.body);
  const [shown, clipped] = open ? [text, true] : clip(text, 280);
  return (
    <li>
      <div class="c-head">
        <b>{comment.author}</b>
        {comment.thread ? <span class="tag">в кода</span> : null}
        <span class="when" title={shortTime(comment.createdAt)}>
          преди {age(comment.createdAt, now)}
        </span>
      </div>
      <p class="c-body">{shown}</p>
      {clipped ? (
        <button class="more" onClick={() => setOpen(!open)}>
          {open ? "по-кратко" : "целия"}
        </button>
      ) : null}
    </li>
  );
}

const CSS = `
body { margin: 0; background: var(--bg, #f6f6f4); font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.vA {
  --bg: #f6f6f4; --pane: #ffffff; --nav: #efefec; --line: #e3e2de; --text: #1d1d1b; --soft: #6b6a66; --faint: #9a9993;
  --sel: #e7eefc; --sel-line: #3b6fe0; --hover: #f3f3f0; --accent: #3b6fe0;
  --ok: #1f7a3d; --ok-bg: #e3f3e8; --bad: #b42318; --bad-bg: #fde8e6; --pending: #9a6200; --pending-bg: #fdf1d8;
  --info: #2155c4; --info-bg: #e5edfc; --muted: #6b6a66; --muted-bg: #ecebe7; --merged: #7239c8; --merged-bg: #efe6fb;
  display: grid; grid-template-columns: 210px minmax(340px, 1fr) minmax(420px, 1.25fr);
  height: 100vh; color: var(--text); background: var(--bg); box-sizing: border-box; padding-bottom: 52px;
}
@media (prefers-color-scheme: dark) {
  body { background: #151514; }
  .vA {
    --bg: #151514; --pane: #1c1c1b; --nav: #121211; --line: #2c2c2a; --text: #e8e7e3; --soft: #a3a29c; --faint: #6f6e69;
    --sel: #1f2c48; --sel-line: #6e98f5; --hover: #232322; --accent: #6e98f5;
    --ok: #6fcf8f; --ok-bg: #173323; --bad: #ff8a7d; --bad-bg: #3a1a17; --pending: #f0b75a; --pending-bg: #352812;
    --info: #8fb0f7; --info-bg: #1a2640; --muted: #a3a29c; --muted-bg: #2a2a28; --merged: #c3a0f5; --merged-bg: #2c2140;
  }
}
.vA *, .vA *::before, .vA *::after { box-sizing: border-box; }
.vA a { color: inherit; text-decoration: none; }
.vA a:hover { text-decoration: underline; }
.vA button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
.vA kbd { font: 10.5px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 0 4px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 3px; color: var(--soft); background: var(--pane); }
.vA code { font: 11.5px ui-monospace, SFMono-Regular, Menlo, monospace; }

.vA .nav { background: var(--nav); border-right: 1px solid var(--line); padding: 14px 8px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
.vA .brand { font-weight: 700; font-size: 15px; padding: 0 8px 14px; display: flex; flex-direction: column; }
.vA .who { font-weight: 400; font-size: 11.5px; color: var(--soft); }
.vA .nav-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px; text-align: left; color: var(--soft); }
.vA .nav-item:hover { background: var(--hover); color: var(--text); }
.vA .nav-item.on { background: var(--pane); color: var(--text); font-weight: 600; box-shadow: 0 0 0 1px var(--line); }
.vA .nav-item.hot { color: var(--bad); font-weight: 600; }
.vA .nav-item .count { font-size: 11.5px; font-variant-numeric: tabular-nums; color: var(--faint); }
.vA .nav-item.hot .count { color: var(--pane); background: var(--bad); border-radius: 9px; padding: 0 6px; font-weight: 700; }
.vA .nav-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--faint); padding: 16px 8px 4px; }
.vA .repo-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vA .keys { margin-top: auto; padding: 16px 8px 4px; font-size: 11px; color: var(--faint); line-height: 1.9; }
.vA .fresh { padding: 0 8px; font-size: 11px; color: var(--faint); }

.vA .list { background: var(--pane); border-right: 1px solid var(--line); overflow-y: auto; }
.vA .divider { position: sticky; top: 0; z-index: 1; background: var(--pane); font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--faint); padding: 10px 12px 4px; border-bottom: 1px solid var(--line); }
.vA .row { display: grid; grid-template-columns: auto auto 1fr auto; align-items: center; gap: 8px; height: 34px; padding: 0 12px 0 10px; border-bottom: 1px solid var(--line); border-left: 3px solid transparent; cursor: default; }
.vA .row:hover { background: var(--hover); }
.vA .row.mine .title { font-weight: 600; }
.vA .row.sel { background: var(--sel); border-left-color: var(--sel-line); }
.vA .repo-tag { font-size: 11.5px; color: var(--soft); max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vA .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.vA .draft { color: var(--faint); font-weight: 400; }
.vA .age { font-size: 11.5px; color: var(--faint); font-variant-numeric: tabular-nums; }
.vA .empty { padding: 40px 20px; text-align: center; color: var(--faint); }

.vA .chip { display: inline-block; font-size: 11px; line-height: 18px; padding: 0 7px; border-radius: 9px; white-space: nowrap; font-weight: 500; }
.vA .chip.ok { color: var(--ok); background: var(--ok-bg); }
.vA .chip.bad { color: var(--bad); background: var(--bad-bg); }
.vA .chip.pending { color: var(--pending); background: var(--pending-bg); }
.vA .chip.info { color: var(--info); background: var(--info-bg); }
.vA .chip.muted { color: var(--muted); background: var(--muted-bg); }
.vA .chip.merged { color: var(--merged); background: var(--merged-bg); }
.vA .row .chip { min-width: 74px; text-align: center; }

.vA .detail { overflow-y: auto; padding: 20px 28px 40px; }
.vA .detail article { max-width: 760px; }
.vA .crumb { font-size: 11.5px; color: var(--soft); }
.vA h2 { font-size: 18px; line-height: 1.3; margin: 4px 0 6px; }
.vA .meta { margin: 0 0 12px; color: var(--soft); font-size: 12px; }
.vA .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
.vA .spacer { flex: 1; }
.vA .jira { font-size: 11.5px; font-weight: 600; color: var(--info); border: 1px solid var(--line); border-radius: 5px; padding: 2px 7px; }
.vA .btn { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--pane); font-weight: 500; }
.vA .btn:hover { text-decoration: none; background: var(--hover); }
.vA .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.vA .btn.primary kbd { background: transparent; color: #fff; border-color: rgba(255,255,255,.5); }

.vA .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin: 0; border-bottom: 1px solid var(--line); }
.vA .facts > div { padding: 10px 0; }
.vA dt { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--faint); }
.vA dd { margin: 2px 0 0; }
.vA .dot { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; }
.vA .dot::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: none; }
.vA .dot.ok { color: var(--ok); } .vA .dot.bad { color: var(--bad); } .vA .dot.pending { color: var(--pending); } .vA .dot.muted { color: var(--muted); }

.vA section { padding: 14px 0 4px; border-bottom: 1px solid var(--line); }
.vA section:last-child { border-bottom: 0; }
.vA h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--soft); display: flex; align-items: center; gap: 8px; }
.vA h3 .n { color: var(--faint); }
.vA h3 .chip { text-transform: none; letter-spacing: 0; }
.vA .none { color: var(--faint); margin: 0 0 10px; }
.vA .body { white-space: pre-wrap; margin: 0 0 8px; color: var(--text); overflow-wrap: anywhere; }
.vA .more { color: var(--accent); font-size: 12px; padding: 0; margin-bottom: 10px; }
.vA .people { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.vA .people li { display: grid; grid-template-columns: 110px 1fr auto; align-items: center; }
.vA .when { color: var(--faint); font-size: 11.5px; }
.vA .comments { list-style: none; margin: 0 0 6px; padding: 0; }
.vA .comments li { padding: 8px 0; border-top: 1px dashed var(--line); }
.vA .comments li:first-child { border-top: 0; padding-top: 0; }
.vA .c-head { display: flex; align-items: baseline; gap: 8px; }
.vA .tag { font-size: 10.5px; color: var(--soft); background: var(--muted-bg); border-radius: 4px; padding: 0 5px; }
.vA .c-body { margin: 3px 0 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
.vA .commits { list-style: none; margin: 0 0 10px; padding: 0; }
.vA .commits li { display: grid; grid-template-columns: 70px 90px auto; gap: 8px; padding: 2px 0; }
.vA .commits a { color: var(--accent); }

@media (max-width: 900px) {
  .vA { grid-template-columns: 1fr; height: auto; }
  .vA .nav { flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid var(--line); }
  .vA .brand, .vA .keys, .vA .fresh, .vA .nav-label { display: none; }
  .vA .list { max-height: 45vh; border-right: 0; border-bottom: 1px solid var(--line); }
  .vA .detail { padding: 16px; }
  .vA .facts { grid-template-columns: repeat(2, 1fr); }
}
`;
